import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { can } from "@/lib/permissions";
import { checkProjectAccess } from "@/lib/project-access";
import { salsifyFetch, describeFetchError } from "@/lib/salsify-http";
import {
  buildSalsifyPayload, categoryAncestry, unwrapSalsifyValue,
  displayValue, sameValue,
} from "@/lib/salsify-fields";

type Params = { params: Promise<{ id: string }> };

// A push overwrites whatever Salsify currently holds, so `dryRun: true`
// returns a change report — Salsify's current value vs. what Sympl would
// send — instead of writing. The payload is built by the same
// buildSalsifyPayload the real push uses, so the preview can't drift from it.

type Change = {
  productId: string;
  partNumber: string | null;
  itemName: string | null;
  current: string;
  incoming: string;
  /** Sympl is blank here, so the push would clear a value Salsify holds. */
  clearing: boolean;
  /** The product doesn't exist in Salsify yet; this write creates it. */
  creating: boolean;
};

type ProductResult = {
  partNumber: string | null;
  status: "found" | "will_create" | "error";
  httpStatus?: number;
  detail?: string;
  changeCount: number;
  clearingCount: number;
};

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await can(session.user.role, "products:sync_salsify"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await params;
  const access = await checkProjectAccess(projectId, session, "view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dryRun === true;
  // A dry run reports on every mapped attribute so the user can decide what to
  // skip; the opt-out only applies to the write itself.
  const skipAttributeKeys: string[] = !dryRun && Array.isArray(body.skipAttributeKeys) ? body.skipAttributeKeys : [];
  const productIds: string[] | null = Array.isArray(body.productIds) && body.productIds.length > 0 ? body.productIds : null;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (project.status !== "EXPORT_READY") {
    return NextResponse.json({ error: "Project must be in EXPORT_READY status to sync" }, { status: 400 });
  }

  const resolved = await resolveSalsifyCredentials(session.user.id);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const config = resolved.credentials;

  // Get all salsify-enabled attribute definitions, excluding any the user opted out of
  const salsifyAttrs = await prisma.attributeDefinition.findMany({
    where: {
      salsifyEnabled: true,
      isActive: true,
      ...(skipAttributeKeys.length > 0 ? { key: { notIn: skipAttributeKeys } } : {}),
    },
    include: { section: { select: { name: true } } },
  });

  // Get products with their attribute values
  const products = await prisma.productRecord.findMany({
    where: { projectId, isArchived: false, ...(productIds ? { id: { in: productIds } } : {}) },
    include: {
      attributeValues: {
        include: { attributeDefinition: true },
      },
    },
  });

  const allCats = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const parentOf = new Map(allCats.map((c) => [c.id, c.parentId]));

  const baseUrl = `https://app.salsify.com/api/v1/orgs/${config.organizationId}/products`;
  const authHeaders = { Authorization: `Bearer ${config.apiKey}` };

  // ── Dry run: report what the push would overwrite, write nothing ─────────
  if (dryRun) {
    const attrChanges = new Map<string, Change[]>();
    const productResults: ProductResult[] = [];
    const attrMeta = new Map(salsifyAttrs.map((a) => [a.key, a]));

    const CONCURRENCY = 6;
    for (let i = 0; i < products.length; i += CONCURRENCY) {
      await Promise.all(
        products.slice(i, i + CONCURRENCY).map(async (product) => {
          const applicable = categoryAncestry(product.categoryId ?? project.categoryId, parentOf);
          const { values } = buildSalsifyPayload(product, salsifyAttrs, applicable);
          const salsifyId = product.partNumber ?? product.id;
          const result: ProductResult = {
            partNumber: product.partNumber, status: "found",
            changeCount: 0, clearingCount: 0,
          };
          productResults.push(result);

          let remote: Record<string, unknown> | null = null;
          try {
            const res = await salsifyFetch(`${baseUrl}/${encodeURIComponent(salsifyId)}`, { headers: authHeaders });
            result.httpStatus = res.status;
            if (res.status === 404) {
              result.status = "will_create";
              result.detail = "No Salsify record with this ID — the push creates one";
            } else if (!res.ok) {
              result.status = "error";
              result.detail = `Salsify returned ${res.status}: ${(await res.text()).slice(0, 120)}`;
              return;
            } else {
              remote = await res.json();
            }
          } catch (err) {
            result.status = "error";
            result.detail = describeFetchError(err);
            return;
          }

          const creating = remote === null;
          for (const [key, outgoing] of values) {
            const attr = attrMeta.get(key)!;
            const current = creating
              ? null
              : unwrapSalsifyValue(remote![attr.salsifyPropertyId!], attr.salsifyLocale);
            if (sameValue(current, outgoing)) continue;
            // On a create there is nothing to overwrite, so an empty field is
            // a non-event rather than a change worth listing.
            if (creating && (outgoing === null || outgoing === "")) continue;

            const clearing = !creating && (outgoing === null || outgoing === "");
            const list = attrChanges.get(key) ?? [];
            list.push({
              productId: product.id,
              partNumber: product.partNumber,
              itemName: product.itemName,
              current: displayValue(current),
              incoming: displayValue(outgoing),
              clearing, creating,
            });
            attrChanges.set(key, list);
            result.changeCount++;
            if (clearing) result.clearingCount++;
          }
        }),
      );
    }

    const attributes = salsifyAttrs
      .map((a) => {
        const changes = attrChanges.get(a.key) ?? [];
        return {
          key: a.key,
          label: a.label,
          salsifyPropertyId: a.salsifyPropertyId,
          section: a.section?.name ?? "General",
          changes,
          changeCount: changes.length,
          clearingCount: changes.filter((c) => c.clearing).length,
        };
      })
      .filter((a) => a.changeCount > 0)
      .sort((a, b) => b.changeCount - a.changeCount || a.label.localeCompare(b.label));

    return NextResponse.json({
      dryRun: true,
      attributes,
      summary: {
        productsInGrid: products.length,
        productsFoundInSalsify: productResults.filter((p) => p.status === "found").length,
        productsToCreate: productResults.filter((p) => p.status === "will_create").length,
        totalChanges: attributes.reduce((n, a) => n + a.changeCount, 0),
        totalClearing: attributes.reduce((n, a) => n + a.clearingCount, 0),
        products: productResults,
        salsifyAttrCount: salsifyAttrs.length,
        errors: productResults.filter((p) => p.status === "error").map((p) => `${p.partNumber}: ${p.detail}`),
      },
    });
  }

  const errors: string[] = [];
  let synced = 0;

  for (const product of products) {
    const productId = product.partNumber ?? product.id;
    const applicableCategories = categoryAncestry(product.categoryId ?? project.categoryId, parentOf);
    const { payload: salsifyProduct } = buildSalsifyPayload(product, salsifyAttrs, applicableCategories);

    try {
      const salsifyId = encodeURIComponent(productId);
      const headers = {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      };
      // Salsify expects a flat JSON object — no { product: {} } wrapper
      const body = JSON.stringify(salsifyProduct);

      // PUT updates an existing product; POST creates a new one
      let res = await salsifyFetch(`${baseUrl}/${salsifyId}`, { method: "PUT", headers, body });
      if (res.status === 404) {
        res = await salsifyFetch(baseUrl, { method: "POST", headers, body });
      }

      if (!res.ok) {
        const text = await res.text();
        let hint = "";
        if (res.status === 422 && text.includes("locale")) {
          const propMatch = text.match(/localizable property (.+?)"/);
          const faultyProp = propMatch?.[1];
          const matchingAttrs = salsifyAttrs
            .filter((a) => a.salsifyPropertyId === faultyProp || (!faultyProp && a.salsifyPropertyId))
            .map((a) => `"${a.label}" key=${a.key} prop=${a.salsifyPropertyId} locale=${a.salsifyLocale ?? "NULL"} sent=${JSON.stringify(salsifyProduct[a.salsifyPropertyId!])?.slice(0, 100)}`);
          if (matchingAttrs.length > 0) hint = ` — attrs: ${matchingAttrs.join("; ")}`;
        }
        errors.push(`Product ${product.partNumber ?? product.id}: ${res.status} ${text.slice(0, 200)}${hint}`);
      } else {
        synced++;
        // Record sync time WITHOUT touching updatedAt, so "changed since last
        // sync" drift detection stays accurate. Bind a JS Date (UTC) rather
        // than NOW() — NOW() cast into a timestamp column uses the DB
        // server's local timezone, which skews the drift comparison against
        // Prisma's UTC-written updatedAt.
        await prisma.$executeRaw`UPDATE "ProductRecord" SET "salsifyLastSyncedAt" = ${new Date()} WHERE id = ${product.id}`.catch(() => {});
      }
    } catch (err) {
      errors.push(`Product ${product.partNumber ?? product.id}: ${describeFetchError(err)}`);
    }
  }

  // Log the sync
  await prisma.salsifySyncLog.create({
    data: {
      projectId,
      userId: session.user.id,
      status: errors.length === 0 ? "SUCCESS" : errors.length < products.length ? "PARTIAL" : "FAILED",
      productsSynced: synced,
      errors: errors.length > 0 ? errors : undefined,
      completedAt: new Date(),
    },
  }).catch(() => {});

  return NextResponse.json({
    synced,
    total: products.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
