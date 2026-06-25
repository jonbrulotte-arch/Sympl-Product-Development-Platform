import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PRODUCT_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productId } = await params;

  const config = await prisma.salsifyConfig.findFirst({ where: { isEnabled: true } });
  if (!config) {
    return NextResponse.json(
      { error: "Salsify is not configured or not enabled. Configure it in Admin → Settings." },
      { status: 400 }
    );
  }

  const product = await prisma.productRecord.findUnique({
    where: { id: productId },
    include: {
      attributeValues: { include: { attributeDefinition: true } },
    },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const salsifyAttrs = await prisma.attributeDefinition.findMany({
    where: { salsifyEnabled: true, isActive: true },
  });

  const salsifyId = product.partNumber ?? product.id;
  const salsifyProduct: Record<string, unknown> = { "salsify:id": salsifyId };

  for (const attr of salsifyAttrs) {
    if (!attr.salsifyPropertyId) continue;
    const coreAccessor = CORE_FIELD_ACCESSOR[attr.key];
    let rawValue: unknown;

    if (coreAccessor) {
      rawValue = coreAccessor(product);
      if (rawValue === null || rawValue === undefined || rawValue === "") continue;
      if (typeof rawValue === "string" && rawValue.includes("\n") && (attr.attributeType === "MULTI_SELECT" || attr.maxValues > 1)) {
        rawValue = rawValue.split("\n").map((s) => s.trim()).filter(Boolean);
      }
    } else {
      const avs = product.attributeValues
        .filter((v) => v.attributeDefinitionId === attr.id)
        .sort((a, b) => a.valueIndex - b.valueIndex);
      if (avs.length === 0) continue;
      const values = avs.map((v) => v.textValue ?? v.numberValue ?? v.booleanValue);
      const isMultiValue = attr.maxValues > 1 || attr.attributeType === "MULTI_SELECT" || values.length > 1;
      rawValue = isMultiValue ? values : values[0];
    }

    if (attr.salsifyLocale) {
      salsifyProduct[attr.salsifyPropertyId] = Array.isArray(rawValue)
        ? rawValue.map((v) => ({ [attr.salsifyLocale!]: v }))
        : { [attr.salsifyLocale]: rawValue };
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
  const body = JSON.stringify(salsifyProduct);

  let res = await fetch(`${baseUrl}/${encoded}`, { method: "PUT", headers, body });
  if (res.status === 404) {
    res = await fetch(baseUrl, { method: "POST", headers, body });
  }

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Salsify returned ${res.status}: ${text.slice(0, 300)}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ synced: true, salsifyId });
}
