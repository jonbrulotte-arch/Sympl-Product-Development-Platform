import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { checkProjectAccess } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";
import { SALSIFY_FIELD_SYNC, unresolvedDriftForProduct } from "@/lib/salsify-drift";
import type { ProductRecord } from "@prisma/client";

const CORE_FIELD_ACCESSOR: Record<string, (p: ProductRecord) => unknown> = {
  partNumber:         (p) => p.partNumber ?? null,
  modelNumber:        (p) => p.modelNumber ?? null,
  itemName:           (p) => p.itemName ?? null,
  brand:              (p) => p.brand ?? null,
  upc:                (p) => p.upc ?? null,
  inventoryStatus:    (p) => p.inventoryStatus ?? null,
  warrantyInfo:       (p) => p.warrantyInfo ?? null,
  htsCode:            (p) => p.htsCode ?? null,
  htsCodeCanada:      (p) => p.htsCodeCanada ?? null,
  productComposition: (p) => p.productComposition ?? null,
  needsProp65:        (p) => p.needsProp65,
  packagingType:      (p) => p.packagingType ?? null,
  packSize:           (p) => p.packSize ?? null,
  numberOfPieces:     (p) => p.numberOfPieces ?? null,
  individualOrSet:    (p) => p.individualOrSet ?? null,
  material:           (p) => p.material ?? null,
  size:               (p) => p.size ?? null,
  jspCategory:        (p) => p.jspCategory ?? null,
  userManual:         (p) => p.userManual ?? null,
  cutSheets:          (p) => p.cutSheets ?? null,
  upcHeight:          (p) => p.upcHeight ?? null,
  upcWidth:           (p) => p.upcWidth ?? null,
  upcLength:          (p) => p.upcLength ?? null,
  upcWeight:          (p) => p.upcWeight ?? null,
  itemHeight:         (p) => p.itemHeight ?? null,
  itemWidth:          (p) => p.itemWidth ?? null,
  itemLength:         (p) => p.itemLength ?? null,
  itemWeight:         (p) => p.itemWeight ?? null,
  innerCartonGtin:    (p) => p.innerCartonGtin ?? null,
  innerCartonHeight:  (p) => p.innerCartonHeight ?? null,
  innerCartonWidth:   (p) => p.innerCartonWidth ?? null,
  innerCartonLength:  (p) => p.innerCartonLength ?? null,
  innerCartonWeight:  (p) => p.innerCartonWeight ?? null,
  innerCartonQty:     (p) => p.innerCartonQty ?? null,
  masterCartonGtin:   (p) => p.masterCartonGtin ?? null,
  masterCartonHeight: (p) => p.masterCartonHeight ?? null,
  masterCartonWidth:  (p) => p.masterCartonWidth ?? null,
  masterCartonLength: (p) => p.masterCartonLength ?? null,
  masterCartonWeight: (p) => p.masterCartonWeight ?? null,
  masterCartonQty:    (p) => p.masterCartonQty ?? null,
  palletGtin:         (p) => p.palletGtin ?? null,
  palletHeight:       (p) => p.palletHeight ?? null,
  palletWidth:        (p) => p.palletWidth ?? null,
  palletLength:       (p) => p.palletLength ?? null,
  palletWeight:       (p) => p.palletWeight ?? null,
  palletStackable:    (p) => p.palletStackable,
  layersPerPallet:    (p) => p.layersPerPallet ?? null,
  palletQty:          (p) => p.palletQty ?? null,
};

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
  const applicableCategories = new Set<string>();
  {
    let current: string | null | undefined = product.categoryId ?? project?.categoryId;
    while (current && !applicableCategories.has(current)) {
      applicableCategories.add(current);
      current = parentOf.get(current);
    }
  }

  const salsifyId = product.partNumber ?? product.id;
  const salsifyProduct: Record<string, unknown> = { "salsify:id": salsifyId };

  for (const attr of salsifyAttrs) {
    if (!attr.salsifyPropertyId) continue;
    if (attr.categoryId && !applicableCategories.has(attr.categoryId)) continue;
    const coreAccessor = CORE_FIELD_ACCESSOR[attr.key];
    let rawValue: unknown;

    // Empty values are sent as null, not omitted: Salsify clears a property
    // when it receives null, so blanking a field in Sympl clears it there too.
    if (coreAccessor) {
      rawValue = coreAccessor(product);
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

  const encoded = encodeURIComponent(salsifyId);
  const baseUrl = `https://app.salsify.com/api/v1/orgs/${config.organizationId}/products`;
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  const payload = JSON.stringify(salsifyProduct);

  let res = await fetch(`${baseUrl}/${encoded}`, { method: "PUT", headers, body: payload });
  if (res.status === 404) {
    // A partial push must never create the record — it would land in Salsify
    // with only the one property set. Ask for a full sync instead.
    if (isPartial) {
      return NextResponse.json(
        { error: `${salsifyId} does not exist in Salsify yet — run a full sync first.` },
        { status: 409 }
      );
    }
    res = await fetch(baseUrl, { method: "POST", headers, body: payload });
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
