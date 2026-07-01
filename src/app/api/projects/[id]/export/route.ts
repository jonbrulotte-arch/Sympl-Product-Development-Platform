import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import type { ProductRecord } from "@prisma/client";
import { CORE_FIELDS, CORE_FIELD_KEYS } from "@/lib/core-fields";

// Reads a core model field off a ProductRecord and formats it for the sheet.
// Field list is shared with the import mapping UI and import route so every
// column that can be exported can also be re-imported and vice versa.
function readCoreField(p: ProductRecord, key: string, type: (typeof CORE_FIELDS)[number]["type"]): unknown {
  const v = (p as unknown as Record<string, unknown>)[key];
  if (v === null || v === undefined) return "";
  if (type === "boolean") return v ? "Yes" : "No";
  if (type === "decimal") return (v as { toString(): string }).toString();
  return v;
}

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
      where: { key: { in: CORE_FIELD_KEYS }, isActive: true },
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
        key: { notIn: CORE_FIELD_KEYS },
      },
      orderBy: [{ sortOrder: "asc" }],
    }),
  ]);

  const coreFieldByKey = Object.fromEntries(CORE_FIELDS.map((f) => [f.key, f]));

  // Core fields in attr-def order (section.sortOrder → sortOrder), then any core
  // field with no AttributeDefinition row at all appended at the end — otherwise
  // fields that were never seeded as an admin-visible attribute (e.g. legacy
  // schema columns) would be silently excluded from the export entirely.
  const orderedCoreKeys = [
    ...coreAttrDefs.map((a) => a.key),
    ...CORE_FIELD_KEYS.filter((k) => !coreAttrDefs.some((a) => a.key === k)),
  ];
  const coreColumnLabels = new Map(coreAttrDefs.map((a) => [a.key, a.label]));

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
    for (const key of orderedCoreKeys) {
      const field = coreFieldByKey[key];
      if (!field) continue;
      const label = coreColumnLabels.get(key) ?? field.label;
      row[label] = readCoreField(p, key, field.type);
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
