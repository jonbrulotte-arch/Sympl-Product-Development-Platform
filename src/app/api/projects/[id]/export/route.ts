import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import type { ProductRecord } from "@prisma/client";
import { CORE_FIELDS, CORE_FIELD_KEYS, REMOVED_CORE_KEYS } from "@/lib/core-fields";
import { checkProjectAccess } from "@/lib/project-access";

const CORE_FIELD_BY_KEY = Object.fromEntries(CORE_FIELDS.map((f) => [f.key, f]));

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
  const access = await checkProjectAccess(projectId, session, "view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A single ordered list covering every attribute that can appear on a product
  // in this project — core (ProductRecord-backed) and EAV alike — sorted by
  // (section.sortOrder, attr.sortOrder). Sections mix core and custom fields
  // (e.g. "Core Data" holds Part Number, a real column, alongside Product
  // Series, an EAV-only attribute), so ordering them separately in two blocks
  // previously split apart fields that belong together.
  const [products, attrDefs] = await Promise.all([
    prisma.productRecord.findMany({
      where: { projectId, isArchived: false },
      include: {
        attributeValues: { include: { attributeDefinition: true } },
        category: true,
      },
      orderBy: [{ rowIndex: "asc" }, { createdAt: "asc" }],
    }),
    prisma.attributeDefinition.findMany({
      where: {
        isActive: true,
        key: { notIn: REMOVED_CORE_KEYS },
        OR: [
          { key: { in: CORE_FIELD_KEYS } },
          { categoryId: null },
          ...(project.categoryId ? [{ categoryId: project.categoryId }] : []),
        ],
      },
      include: { section: true },
      orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
  ]);

  // Active attribute definitions are authoritative for which columns exist —
  // a core field hidden (deactivated) in the attributes admin stays out of the
  // export. The hardcoded list is only a fallback for unseeded installs with
  // no core definitions at all.
  const seenCoreKeys = new Set(attrDefs.filter((a) => CORE_FIELD_BY_KEY[a.key]).map((a) => a.key));
  const orderedColumns: { key: string; label: string; maxValues: number; isCoreField: boolean }[] = [
    ...attrDefs.map((a) => ({
      key: a.key,
      label: a.label,
      maxValues: a.maxValues,
      isCoreField: !!CORE_FIELD_BY_KEY[a.key],
    })),
    ...(seenCoreKeys.size === 0
      ? CORE_FIELD_KEYS.map((k) => ({
          key: k,
          label: CORE_FIELD_BY_KEY[k].label,
          maxValues: 1,
          isCoreField: true,
        }))
      : []),
  ];

  const rows = products.map((p) => {
    const row: Record<string, unknown> = {};

    const eavValuesByDefId: Record<string, string[]> = {};
    for (const av of p.attributeValues) {
      if (!eavValuesByDefId[av.attributeDefinitionId]) eavValuesByDefId[av.attributeDefinitionId] = [];
      eavValuesByDefId[av.attributeDefinitionId][av.valueIndex] =
        av.textValue ?? av.numberValue?.toString() ?? av.booleanValue?.toString() ?? "";
    }
    const attrDefIdByKey = Object.fromEntries(attrDefs.map((a) => [a.key, a.id]));

    for (const col of orderedColumns) {
      if (col.isCoreField) {
        const field = CORE_FIELD_BY_KEY[col.key];
        row[col.label] = readCoreField(p, col.key, field.type);
        continue;
      }
      const values = eavValuesByDefId[attrDefIdByKey[col.key]] ?? [];
      if (col.maxValues > 1) {
        for (let i = 1; i <= col.maxValues; i++) row[`${col.label} ${i}`] = values[i - 1] ?? "";
      } else {
        row[col.label] = values[0] ?? "";
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
