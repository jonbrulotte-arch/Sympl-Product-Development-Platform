import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { checkProjectAccess } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";
import { SALSIFY_FIELD_SYNC, unresolvedDriftForProduct } from "@/lib/salsify-drift";
import { buildSalsifyPayload, categoryAncestry } from "@/lib/salsify-fields";
import { salsifyFetch, describeFetchError } from "@/lib/salsify-http";

type Params = { params: Promise<{ id: string; productId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!(await can(role, "products:sync_salsify"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId, productId } = await params;
  const access = await checkProjectAccess(projectId, session, "view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const reqBody = await req.json().catch(() => ({}));
  const skipAttributeKeys: string[] = Array.isArray(reqBody.skipAttributeKeys) ? reqBody.skipAttributeKeys : [];
  // Partial push: send only these attribute keys (used by the Out-of-Sync
  // report to update a single drifted field). Salsify leaves properties it
  // isn't sent alone, so the rest of the record is untouched.
  const onlyAttributeKeys: string[] = Array.isArray(reqBody.onlyAttributeKeys) ? reqBody.onlyAttributeKeys : [];
  const isPartial = onlyAttributeKeys.length > 0;

  const resolved = await resolveSalsifyCredentials(session.user.id);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status }
    );
  }
  const config = resolved.credentials;

  const product = await prisma.productRecord.findUnique({
    where: { id: productId },
    include: {
      attributeValues: { include: { attributeDefinition: true } },
    },
  });
  if (!product || product.projectId !== projectId) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const salsifyAttrs = await prisma.attributeDefinition.findMany({
    where: {
      salsifyEnabled: true,
      isActive: true,
      ...(isPartial ? { key: { in: onlyAttributeKeys } } : {}),
      ...(skipAttributeKeys.length > 0 ? { key: { notIn: skipAttributeKeys } } : {}),
    },
  });
  if (isPartial && salsifyAttrs.length === 0) {
    return NextResponse.json({ error: "No Salsify-enabled attributes match that field" }, { status: 400 });
  }

  // Category scoping: an attribute tied to a category only applies to products
  // in that category (or a descendant). Since blank values now clear Salsify
  // data, sending another category's attributes would wipe them.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { categoryId: true },
  });
  const allCats = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const parentOf = new Map(allCats.map((c) => [c.id, c.parentId]));
  const applicableCategories = categoryAncestry(product.categoryId ?? project?.categoryId, parentOf);

  const salsifyId = product.partNumber ?? product.id;
  const { payload: salsifyProduct } = buildSalsifyPayload(product, salsifyAttrs, applicableCategories);

  const encoded = encodeURIComponent(salsifyId);
  const baseUrl = `https://app.salsify.com/api/v1/orgs/${config.organizationId}/products`;
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  const payload = JSON.stringify(salsifyProduct);

  let res: Response;
  try {
    res = await salsifyFetch(`${baseUrl}/${encoded}`, { method: "PUT", headers, body: payload });
    if (res.status === 404 && !isPartial) {
      res = await salsifyFetch(baseUrl, { method: "POST", headers, body: payload });
    }
  } catch (err) {
    // Retries are already exhausted by this point, so report the underlying
    // socket reason rather than letting it surface as an unhandled 500.
    return NextResponse.json(
      { error: `Could not reach Salsify: ${describeFetchError(err)}` },
      { status: 502 }
    );
  }
  // A partial push must never create the record — it would land in Salsify
  // with only the one property set. Ask for a full sync instead.
  if (res.status === 404 && isPartial) {
    return NextResponse.json(
      { error: `${salsifyId} does not exist in Salsify yet — run a full sync first.` },
      { status: 409 }
    );
  }

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Salsify returned ${res.status}: ${text.slice(0, 300)}` },
      { status: 502 }
    );
  }

  // Record sync time without touching updatedAt (drift detection compares
  // the two). Bind a JS Date (UTC) rather than NOW() — NOW() cast into a
  // timestamp column uses the DB server's local timezone, skewing the
  // comparison against Prisma's UTC-written updatedAt.
  //
  // A partial push records each field it pushed, then only stamps the
  // timestamp once no edited field is left unpushed — so resolving every
  // drifted field one at a time clears the product from the report just as a
  // full sync would.
  let fullyResolved = !isPartial;

  if (isPartial) {
    const syncedFields = salsifyAttrs.map((a) => a.key);
    await Promise.all(
      syncedFields.map((key) =>
        logActivity({
          userId: session.user.id,
          action: "EXPORTED",
          entityType: "ProductRecord",
          entityId: product.id,
          projectId,
          productId: product.id,
          fieldKey: key,
          source: SALSIFY_FIELD_SYNC,
        }).catch(() => {})
      )
    );

    // Never infer a full sync for a product that has never had one — one
    // pushed property is no evidence the rest of the record matches.
    if (product.salsifyLastSyncedAt) {
      const remaining = await unresolvedDriftForProduct(product.id, product.salsifyLastSyncedAt);
      fullyResolved = remaining.length === 0;
    }
  }

  if (fullyResolved) {
    await prisma.$executeRaw`UPDATE "ProductRecord" SET "salsifyLastSyncedAt" = ${new Date()} WHERE id = ${product.id}`.catch(() => {});
  }

  return NextResponse.json({
    synced: true,
    salsifyId,
    partial: isPartial,
    fullyResolved,
    fields: isPartial ? salsifyAttrs.map((a) => a.key) : undefined,
  });
}
