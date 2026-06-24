import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [products, categoryAttrs, globalAttrs] = await Promise.all([
    prisma.productRecord.findMany({
      where: { projectId, isArchived: false },
      include: {
        attributeValues: { include: { attributeDefinition: true } },
        category: true,
      },
      orderBy: { rowIndex: "asc" },
    }),
    project.categoryId
      ? prisma.attributeDefinition.findMany({
          where: { categoryId: project.categoryId, isActive: true },
          orderBy: { sortOrder: "asc" },
        })
      : Promise.resolve([]),
    prisma.attributeDefinition.findMany({
      where: { categoryId: null, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  // Pre-build the ordered set of EAV column headers so every row gets them,
  // even when no product has a value yet.
  const eavAttrDefs = [...categoryAttrs, ...globalAttrs];
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

  // Build rows
  const rows = products.map((p) => {
    const row: Record<string, unknown> = {
      "Part Number": p.partNumber ?? "",
      "Model Number": p.modelNumber ?? "",
      "Item Name": p.itemName ?? "",
      Brand: p.brand ?? "",
      UPC: p.upc ?? "",
      "Inventory Status": p.inventoryStatus ?? "",
      Warranty: p.warrantyInfo ?? "",
      "HTS Code": p.htsCode ?? "",
      "HTS Code (Canada)": p.htsCodeCanada ?? "",
      "Product Composition": p.productComposition ?? "",
      "Needs Prop 65": p.needsProp65 ? "Yes" : "No",
      "Packaging Type": p.packagingType ?? "",
      "Pack Size": p.packSize ?? "",
      "Number of Pieces": p.numberOfPieces ?? "",
      "Individual/Set": p.individualOrSet ?? "",
      Material: p.material ?? "",
      Size: p.size ?? "",
      "Master Carton GTIN-14": p.masterCartonGtin ?? "",
      "Inner Carton GTIN-14": p.innerCartonGtin ?? "",
      "Pallet GTIN": p.palletGtin ?? "",
      "UPC Height (in)": p.upcHeight?.toString() ?? "",
      "UPC Width (in)": p.upcWidth?.toString() ?? "",
      "UPC Length (in)": p.upcLength?.toString() ?? "",
      "UPC Weight (lbs)": p.upcWeight?.toString() ?? "",
      "Item Height (in)": p.itemHeight?.toString() ?? "",
      "Item Width (in)": p.itemWidth?.toString() ?? "",
      "Item Length (in)": p.itemLength?.toString() ?? "",
      "Item Weight (lbs)": p.itemWeight?.toString() ?? "",
      "Inner Carton Height (in)": p.innerCartonHeight?.toString() ?? "",
      "Inner Carton Width (in)": p.innerCartonWidth?.toString() ?? "",
      "Inner Carton Length (in)": p.innerCartonLength?.toString() ?? "",
      "Inner Carton Weight (lbs)": p.innerCartonWeight?.toString() ?? "",
      "Inner Carton Qty": p.innerCartonQty ?? "",
      "Master Carton Height (in)": p.masterCartonHeight?.toString() ?? "",
      "Master Carton Width (in)": p.masterCartonWidth?.toString() ?? "",
      "Master Carton Length (in)": p.masterCartonLength?.toString() ?? "",
      "Master Carton Weight (lbs)": p.masterCartonWeight?.toString() ?? "",
      "Master Carton Qty": p.masterCartonQty ?? "",
      "Pallet Height (in)": p.palletHeight?.toString() ?? "",
      "Pallet Width (in)": p.palletWidth?.toString() ?? "",
      "Pallet Length (in)": p.palletLength?.toString() ?? "",
      "Pallet Weight (lbs)": p.palletWeight?.toString() ?? "",
      "Pallet Stackable": p.palletStackable ? "Yes" : "No",
      "Layers Per Pallet": p.layersPerPallet ?? "",
      "Pallet Qty": p.palletQty ?? "",
      "JSP Category": p.jspCategory ?? "",
      "User Manual": p.userManual ?? "",
      "Cut Sheets": p.cutSheets ?? "",
    };

    // Seed all category/global EAV columns as empty so they always appear
    Object.assign(row, eavHeadersTemplate);

    // Fill in actual EAV values
    const groupedAttrs: Record<string, string[]> = {};
    for (const av of p.attributeValues) {
      const key = av.attributeDefinition.label;
      if (!groupedAttrs[key]) groupedAttrs[key] = [];
      groupedAttrs[key][av.valueIndex] = av.textValue ?? av.numberValue?.toString() ?? av.booleanValue?.toString() ?? "";
    }
    for (const [key, values] of Object.entries(groupedAttrs)) {
      const maxVals = eavAttrDefs.find((a) => a.label === key)?.maxValues ?? 1;
      if (maxVals > 1) {
        values.forEach((v, i) => {
          row[`${key} ${i + 1}`] = v;
        });
      } else {
        row[key] = values[0] ?? "";
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
