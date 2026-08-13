import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { can } from "@/lib/permissions";
import { checkProjectAccess } from "@/lib/project-access";
import { isCoreField, readCoreField } from "@/lib/salsify-fields";
import type { ProductRecord } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

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
  const skipAttributeKeys: string[] = Array.isArray(body.skipAttributeKeys) ? body.skipAttributeKeys : [];
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

  // Category scoping: an attribute tied to a category only applies to products
  // in that category (or a descendant). Since blank values now clear Salsify
  // data, sending another category's attributes would wipe them — they must be
  // excluded per product, not just left empty.
  const allCats = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const parentOf = new Map(allCats.map((c) => [c.id, c.parentId]));
  const categoryWithAncestors = (start: string | null) => {
    const set = new Set<string>();
    let current: string | null | undefined = start;
    while (current && !set.has(current)) {
      set.add(current);
      current = parentOf.get(current);
    }
    return set;
  };

  const errors: string[] = [];
  let synced = 0;

  for (const product of products) {
    // Salsify PUT expects a flat JSON object (no { product: {} } wrapper).
    // salsify:id is the record identifier; Part Number (product_id role) is sent
    // as an explicit named property alongside it.
    const productId = product.partNumber ?? product.id;
    const salsifyProduct: Record<string, unknown> = {
      "salsify:id": productId,
    };

    const applicableCategories = categoryWithAncestors(product.categoryId ?? project.categoryId);

    // Map salsify-enabled attributes — core fields read from ProductRecord directly,
    // EAV fields read from attributeValues
    for (const attr of salsifyAttrs) {
      if (!attr.salsifyPropertyId) continue;
      if (attr.categoryId && !applicableCategories.has(attr.categoryId)) continue;

      let rawValue: unknown;

      // Empty values are sent as null, not omitted: Salsify clears a property
      // when it receives null, so blanking a field in Sympl clears it there too.
      if (isCoreField(attr.key)) {
        rawValue = readCoreField(product as ProductRecord, attr.key);
        if (rawValue === undefined || rawValue === "") rawValue = null;
        if (typeof rawValue === "string" && rawValue.includes("\n") && (attr.attributeType === "MULTI_SELECT" || attr.maxValues > 1)) {
          rawValue = rawValue.split("\n").map((s) => s.trim()).filter(Boolean);
        }
      } else {
        const avs = product.attributeValues
          .filter((v) => v.attributeDefinitionId === attr.id)
          .sort((a, b) => a.valueIndex - b.valueIndex);
        const values = avs
          .map((v) => v.textValue ?? v.numberValue ?? v.booleanValue)
          .filter((v) => v !== null && v !== undefined && v !== "");
        rawValue = values.length === 0 ? null : values.length > 1 ? values : values[0];
      }

      // Salsify localizable properties: the v1 API expects a map keyed
      // by locale, e.g. { "en-US": "value" } or { "en-US": ["v1","v2"] }
      if (attr.salsifyLocale) {
        salsifyProduct[attr.salsifyPropertyId] = {
          [attr.salsifyLocale]: rawValue,
        };
      } else {
        salsifyProduct[attr.salsifyPropertyId] = rawValue;
      }
    }

    try {
      const salsifyId = encodeURIComponent(productId);
      const baseUrl = `https://app.salsify.com/api/v1/orgs/${config.organizationId}/products`;
      const headers = {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      };
      // Salsify expects a flat JSON object — no { product: {} } wrapper
      const body = JSON.stringify(salsifyProduct);

      // PUT updates an existing product; POST creates a new one
      let res = await fetch(`${baseUrl}/${salsifyId}`, { method: "PUT", headers, body });
      if (res.status === 404) {
        res = await fetch(baseUrl, { method: "POST", headers, body });
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
      errors.push(`Product ${product.partNumber ?? product.id}: ${String(err)}`);
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
