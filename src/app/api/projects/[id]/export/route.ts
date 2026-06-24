import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import type { ProductRecord } from "@prisma/client";

// Map from AttributeDefinition.key → accessor on ProductRecord
// Used to read core model fields in attr-def order.
const CORE_FIELD_ACCESSOR: Record<string, (p: ProductRecord) => unknown> = {
  partNumber:          (p) => p.partNumber ?? "",
  modelNumber:         (p) => p.modelNumber ?? "",
  itemName:            (p) => p.itemName ?? "",
  brand:               (p) => p.brand ?? "",
  upc:                 (p) => p.upc ?? "",
  inventoryStatus:     (p) => p.inventoryStatus ?? "",
  warrantyInfo:        (p) => p.warrantyInfo ?? "",
  htsCode:             (p) => p.htsCode ?? "",
  htsCodeCanada:       (p) => p.htsCodeCanada ?? "",
  productComposition:  (p) => p.productComposition ?? "",
  needsProp65:         (p) => p.needsProp65 ? "Yes" : "No",
  packagingType:       (p) => p.packagingType ?? "",
  packSize:            (p) => p.packSize ?? "",
  numberOfPieces:      (p) => p.numberOfPieces ?? "",
  individualOrSet:     (p) => p.individualOrSet ?? "",
  material:            (p) => p.material ?? "",
  size:                (p) => p.size ?? "",
  jspCategory:         (p) => p.jspCategory ?? "",
  userManual:          (p) => p.userManual ?? "",
  cutSheets:           (p) => p.cutSheets ?? "",
  upcHeight:           (p) => p.upcHeight?.toString() ?? "",
  upcWidth:            (p) => p.upcWidth?.toString() ?? "",
  upcLength:           (p) => p.upcLength?.toString() ?? "",
  upcWeight:           (p) => p.upcWeight?.toString() ?? "",
  itemHeight:          (p) => p.itemHeight?.toString() ?? "",
  itemWidth:           (p) => p.itemWidth?.toString() ?? "",
  itemLength:          (p) => p.itemLength?.toString() ?? "",
  itemWeight:          (p) => p.itemWeight?.toString() ?? "",
  innerCartonGtin:     (p) => p.innerCartonGtin ?? "",
  innerCartonHeight:   (p) => p.innerCartonHeight?.toString() ?? "",
  innerCartonWidth:    (p) => p.innerCartonWidth?.toString() ?? "",
  innerCartonLength:   (p) => p.innerCartonLength?.toString() ?? "",
  innerCartonWeight:   (p) => p.innerCartonWeight?.toString() ?? "",
  innerCartonQty:      (p) => p.innerCartonQty ?? "",
  masterCartonGtin:    (p) => p.masterCartonGtin ?? "",
  masterCartonHeight:  (p) => p.masterCartonHeight?.toString() ?? "",
  masterCartonWidth:   (p) => p.masterCartonWidth?.toString() ?? "",
  masterCartonLength:  (p) => p.masterCartonLength?.toString() ?? "",
  masterCartonWeight:  (p) => p.masterCartonWeight?.toString() ?? "",
  masterCartonQty:     (p) => p.masterCartonQty ?? "",
  palletGtin:          (p) => p.palletGtin ?? "",
  palletHeight:        (p) => p.palletHeight?.toString() ?? "",
  palletWidth:         (p) => p.palletWidth?.toString() ?? "",
  palletLength:        (p) => p.palletLength?.toString() ?? "",
  palletWeight:        (p) => p.palletWeight?.toString() ?? "",
  palletStackable:     (p) => p.palletStackable ? "Yes" : "No",
  layersPerPallet:     (p) => p.layersPerPallet ?? "",
  palletQty:           (p) => p.palletQty ?? "",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [products, coreAttrDefs, categoryEavAttrs, globalEavAttrs] = await Promise.all([
    prisma.productRecord.findMany({
      where: { projectId, isArchived: false },
      include: {
        attributeValues: { include: { attributeDefinition: true } },
        category: true,
      },
      orderBy: { rowIndex: "asc" },
    }),
    // Core model field attr defs — drives column order for hardcoded fields
    prisma.attributeDefinition.findMany({
      where: { key: { in: Object.keys(CORE_FIELD_ACCESSOR) }, isActive: true },
      include: { section: true },
      orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    // Category-specific EAV attrs
    project.categoryId
      ? prisma.attributeDefinition.findMany({
          where: { categoryId: project.categoryId, isActive: true },
          orderBy: [{ sortOrder: "asc" }],
        })
      : Promise.resolve([]),
    // Global EAV attrs (exclude core fields)
    prisma.attributeDefinition.findMany({
      where: {
        categoryId: null,
        isActive: true,
        key: { notIn: Object.keys(CORE_FIELD_ACCESSOR) },
      },
      orderBy: [{ sortOrder: "asc" }],
    }),
  ]);

  // EAV attr defs in order: category-specific first, then global
  const eavAttrDefs = [...categoryEavAttrs, ...globalEavAttrs];

  // Pre-build EAV column template (empty values) so columns always appear
  const eavHeadersTemplate: Record<string, string> = {};
  for (const attr of eavAttrDefs) {
    if (attr.maxValues > 1) {
      for (let i = 1; i <= attr.maxValues; i++) {
        eavHeadersTemplate[`${attr.label} ${i}`] = "";
      }
    } else {
      eavHeadersTemplate[attr.label] = "";
    }
  }

  const rows = products.map((p) => {
    const row: Record<string, unknown> = {};

    // Core fields in attr-def order (section.sortOrder → sortOrder)
    for (const attr of coreAttrDefs) {
      const accessor = CORE_FIELD_ACCESSOR[attr.key];
      if (accessor) row[attr.label] = accessor(p);
    }

    // Seed EAV columns (empty) — maintains column presence even without data
    Object.assign(row, eavHeadersTemplate);

    // Fill in actual EAV values
    const grouped: Record<string, string[]> = {};
    for (const av of p.attributeValues) {
      const label = av.attributeDefinition.label;
      if (!grouped[label]) grouped[label] = [];
      grouped[label][av.valueIndex] = av.textValue ?? av.numberValue?.toString() ?? av.booleanValue?.toString() ?? "";
    }
    for (const [label, values] of Object.entries(grouped)) {
      const maxVals = eavAttrDefs.find((a) => a.label === label)?.maxValues ?? 1;
      if (maxVals > 1) {
        values.forEach((v, i) => { row[`${label} ${i + 1}`] = v; });
      } else {
        row[label] = values[0] ?? "";
      }
    }

    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, "_")}_export.xlsx"`,
    },
  });
}
