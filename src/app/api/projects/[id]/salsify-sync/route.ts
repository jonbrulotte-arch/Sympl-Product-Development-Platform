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

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (project.status !== "EXPORT_READY") {
    return NextResponse.json({ error: "Project must be in EXPORT_READY status to sync" }, { status: 400 });
  }

  const config = await prisma.salsifyConfig.findFirst({ where: { isEnabled: true } });
  if (!config) {
    return NextResponse.json({ error: "Salsify is not configured or not enabled. Configure it in Admin → Settings." }, { status: 400 });
  }

  // Get all salsify-enabled attribute definitions
  const salsifyAttrs = await prisma.attributeDefinition.findMany({
    where: { salsifyEnabled: true, isActive: true },
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
    // Build the Salsify product payload
    const salsifyProduct: Record<string, unknown> = {
      "salsify:id": product.partNumber ?? product.id,
      "salsify:name": product.itemName ?? product.partNumber ?? product.id,
    };

    // Map salsify-enabled attributes — core fields read from ProductRecord directly,
    // EAV fields read from attributeValues
    for (const attr of salsifyAttrs) {
      if (!attr.salsifyPropertyId) continue;

      const coreAccessor = CORE_FIELD_ACCESSOR[attr.key];
      if (coreAccessor) {
        // Core field — value lives on the ProductRecord model
        const value = coreAccessor(product);
        if (value !== null && value !== undefined && value !== "") {
          salsifyProduct[attr.salsifyPropertyId] = value;
        }
      } else {
        // EAV field — value lives in attributeValues
        const avs = product.attributeValues
          .filter((v) => v.attributeDefinitionId === attr.id)
          .sort((a, b) => a.valueIndex - b.valueIndex);
        if (avs.length === 0) continue;
        const values = avs.map((v) => v.textValue ?? v.numberValue ?? v.booleanValue);
        salsifyProduct[attr.salsifyPropertyId] = attr.maxValues > 1 ? values : values[0];
      }
    }

    try {
      const salsifyId = encodeURIComponent(salsifyProduct["salsify:id"] as string);
      const baseUrl = `https://app.salsify.com/api/v1/orgs/${config.organizationId}/products`;
      const headers = {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      };
      const body = JSON.stringify({ product: salsifyProduct });

      // Try PUT (update existing) first; fall back to POST (create) on 404
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
