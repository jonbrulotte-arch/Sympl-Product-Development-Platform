import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { checkProjectAccess } from "@/lib/project-access";
import type { ProductRecord } from "@prisma/client";

// Accessor for core fields stored directly on ProductRecord (not as EAV values)
const CORE_FIELD_ACCESSOR: Record<string, (p: ProductRecord) => unknown> = {
  partNumber:          (p) => p.partNumber ?? null,
  modelNumber:         (p) => p.modelNumber ?? null,
  itemName:            (p) => p.itemName ?? null,
  brand:               (p) => p.brand ?? null,
  upc:                 (p) => p.upc ?? null,
  inventoryStatus:     (p) => p.inventoryStatus ?? null,
  warrantyInfo:        (p) => p.warrantyInfo ?? null,
  htsCode:             (p) => p.htsCode ?? null,
  htsCodeCanada:       (p) => p.htsCodeCanada ?? null,
  productComposition:  (p) => p.productComposition ?? null,
  needsProp65:         (p) => p.needsProp65,
  packagingType:       (p) => p.packagingType ?? null,
  packSize:            (p) => p.packSize ?? null,
  numberOfPieces:      (p) => p.numberOfPieces ?? null,
  individualOrSet:     (p) => p.individualOrSet ?? null,
  material:            (p) => p.material ?? null,
  size:                (p) => p.size ?? null,
  jspCategory:         (p) => p.jspCategory ?? null,
  userManual:          (p) => p.userManual ?? null,
  cutSheets:           (p) => p.cutSheets ?? null,
  upcHeight:           (p) => p.upcHeight ?? null,
  upcWidth:            (p) => p.upcWidth ?? null,
  upcLength:           (p) => p.upcLength ?? null,
  upcWeight:           (p) => p.upcWeight ?? null,
  itemHeight:          (p) => p.itemHeight ?? null,
  itemWidth:           (p) => p.itemWidth ?? null,
  itemLength:          (p) => p.itemLength ?? null,
  itemWeight:          (p) => p.itemWeight ?? null,
  innerCartonGtin:     (p) => p.innerCartonGtin ?? null,
  innerCartonHeight:   (p) => p.innerCartonHeight ?? null,
  innerCartonWidth:    (p) => p.innerCartonWidth ?? null,
  innerCartonLength:   (p) => p.innerCartonLength ?? null,
  innerCartonWeight:   (p) => p.innerCartonWeight ?? null,
  innerCartonQty:      (p) => p.innerCartonQty ?? null,
  masterCartonGtin:    (p) => p.masterCartonGtin ?? null,
  masterCartonHeight:  (p) => p.masterCartonHeight ?? null,
  masterCartonWidth:   (p) => p.masterCartonWidth ?? null,
  masterCartonLength:  (p) => p.masterCartonLength ?? null,
  masterCartonWeight:  (p) => p.masterCartonWeight ?? null,
  masterCartonQty:     (p) => p.masterCartonQty ?? null,
  palletGtin:          (p) => p.palletGtin ?? null,
  palletHeight:        (p) => p.palletHeight ?? null,
  palletWidth:         (p) => p.palletWidth ?? null,
  palletLength:        (p) => p.palletLength ?? null,
  palletWeight:        (p) => p.palletWeight ?? null,
  palletStackable:     (p) => p.palletStackable,
  layersPerPallet:     (p) => p.layersPerPallet ?? null,
  palletQty:           (p) => p.palletQty ?? null,
};

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

  const config = await prisma.salsifyConfig.findFirst({ where: { isEnabled: true } });
  if (!config) {
    return NextResponse.json({ error: "Salsify is not configured or not enabled. Configure it in Admin → Settings." }, { status: 400 });
  }

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

    // Map salsify-enabled attributes — core fields read from ProductRecord directly,
    // EAV fields read from attributeValues
    for (const attr of salsifyAttrs) {
      if (!attr.salsifyPropertyId) continue;

      const coreAccessor = CORE_FIELD_ACCESSOR[attr.key];
      let rawValue: unknown;

      const isNumericType = ["NUMBER", "DECIMAL"].includes(attr.attributeType);

      if (coreAccessor) {
        rawValue = coreAccessor(product);
        if (rawValue === null || rawValue === undefined || rawValue === "") {
          rawValue = isNumericType ? null : "";
        } else if (typeof rawValue === "string" && rawValue.includes("\n") && (attr.attributeType === "MULTI_SELECT" || attr.maxValues > 1)) {
          rawValue = rawValue.split("\n").map((s) => s.trim()).filter(Boolean);
        }
      } else {
        const avs = product.attributeValues
          .filter((v) => v.attributeDefinitionId === attr.id)
          .sort((a, b) => a.valueIndex - b.valueIndex);
        if (avs.length === 0) {
          rawValue = isNumericType ? null : "";
        } else {
          const values = avs.map((v) => v.textValue ?? v.numberValue ?? v.booleanValue);
          rawValue = values.length > 1 ? values : values[0];
        }
      }

      // Skip numeric nulls — Salsify has no way to clear number properties
      // via the v1 PUT API. Text/string blanks are sent as "" to clear.
      if (rawValue === null) continue;

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
