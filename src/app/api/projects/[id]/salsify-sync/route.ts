import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  const { id: projectId } = await params;
  const body = await req.json().catch(() => ({}));
  const skipAttributeKeys: string[] = Array.isArray(body.skipAttributeKeys) ? body.skipAttributeKeys : [];

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
    where: { projectId, isArchived: false },
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

      if (coreAccessor) {
        rawValue = coreAccessor(product);
        if (rawValue === null || rawValue === undefined || rawValue === "") continue;
        // Core fields that are MULTI_SELECT may have been stored with \n-joined values
        if (typeof rawValue === "string" && rawValue.includes("\n") && (attr.attributeType === "MULTI_SELECT" || attr.maxValues > 1)) {
          rawValue = rawValue.split("\n").map((s) => s.trim()).filter(Boolean);
        }
      } else {
        const avs = product.attributeValues
          .filter((v) => v.attributeDefinitionId === attr.id)
          .sort((a, b) => a.valueIndex - b.valueIndex);
        if (avs.length === 0) continue;
        const values = avs.map((v) => v.textValue ?? v.numberValue ?? v.booleanValue);
        // Only send as array when there are multiple values; single values go as scalars
        rawValue = values.length > 1 ? values : values[0];
      }

      // Localizable multi-value properties need each value wrapped: [{ locale: v1 }, { locale: v2 }]
      // Single localizable values are wrapped as: { locale: value }
      if (attr.salsifyLocale) {
        salsifyProduct[attr.salsifyPropertyId] = Array.isArray(rawValue)
          ? rawValue.map((v) => ({ [attr.salsifyLocale!]: v }))
          : { [attr.salsifyLocale]: rawValue };
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
        errors.push(`Product ${product.partNumber ?? product.id}: ${res.status} ${text.slice(0, 200)}`);
      } else {
        synced++;
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
