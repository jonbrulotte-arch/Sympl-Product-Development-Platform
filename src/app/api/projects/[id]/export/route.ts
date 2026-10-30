import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inProject, sortByProjectRows } from "@/lib/product-catalog";
import ExcelJS from "exceljs";
import type { ProductRecord } from "@prisma/client";
import { CORE_FIELDS, CORE_FIELD_KEYS, REMOVED_CORE_KEYS } from "@/lib/core-fields";
import { checkProjectAccess } from "@/lib/project-access";
import { expandWithAncestors } from "@/lib/category-tree";

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

  const products = await sortByProjectRows(projectId, await prisma.productRecord.findMany({
    where: { ...inProject(projectId), isArchived: false },
    include: {
      attributeValues: { include: { attributeDefinition: true } },
      category: true,
    },
  }));

  // Include ancestor and product-level category attributes so the export
  // covers the same columns as the grid (which uses expandWithAncestors).
  const categoryIds = await expandWithAncestors([
    project.categoryId,
    ...products.map((p) => p.categoryId),
  ]);

  const attrDefs = await prisma.attributeDefinition.findMany({
    where: {
      isActive: true,
      key: { notIn: REMOVED_CORE_KEYS },
      OR: [
        { key: { in: CORE_FIELD_KEYS } },
        { categoryId: null },
        ...(categoryIds.length > 0 ? [{ categoryId: { in: categoryIds } }] : []),
      ],
    },
    include: {
      section: true,
      lovItems: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
    },
    orderBy: [{ section: { sortOrder: "asc" } }, { sectionId: "asc" }, { sortOrder: "asc" }],
  });

  // Active attribute definitions are authoritative for which columns exist —
  // a core field hidden (deactivated) in the attributes admin stays out of the
  // export. The hardcoded list is only a fallback for unseeded installs with
  // no core definitions at all.
  const seenCoreKeys = new Set(attrDefs.filter((a) => CORE_FIELD_BY_KEY[a.key]).map((a) => a.key));
  const orderedColumns: { key: string; label: string; maxValues: number; isCoreField: boolean; def: (typeof attrDefs)[number] | null }[] = [
    ...attrDefs.map((a) => ({
      key: a.key,
      label: a.label,
      maxValues: a.maxValues,
      isCoreField: !!CORE_FIELD_BY_KEY[a.key],
      def: a,
    })),
    ...(seenCoreKeys.size === 0
      ? CORE_FIELD_KEYS.map((k) => ({
          key: k,
          label: CORE_FIELD_BY_KEY[k].label,
          maxValues: 1,
          isCoreField: true,
          def: null,
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

  // One sheet column per (attribute, value slot); multi-value attributes are
  // split into numbered columns, one value per cell, so each can get a dropdown.
  const sheetColumns = orderedColumns.flatMap((col) =>
    col.isCoreField || col.maxValues <= 1
      ? [{ header: col.label, col }]
      : Array.from({ length: col.maxValues }, (_, i) => ({ header: `${col.label} ${i + 1}`, col })),
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  ws.columns = sheetColumns.map((c) => ({ header: c.header, key: c.header, width: Math.min(40, Math.max(12, c.header.length + 2)) }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows) ws.addRow(row);

  // Allowed values: the attribute's active list values, or Yes/No for booleans.
  const allowedFor = (col: (typeof orderedColumns)[number]): string[] => {
    const def = col.def;
    if (def?.lovItems.length) return def.lovItems.map((l) => l.value);
    const isBool = def?.attributeType === "BOOLEAN" || (col.isCoreField && CORE_FIELD_BY_KEY[col.key]?.type === "boolean");
    return isBool ? ["Yes", "No"] : [];
  };

  // "Valid Values" holds one column per list attribute; dropdowns reference it,
  // which avoids Excel's 255-character limit on inline list formulas.
  const lists = new Map<string, { ref: string; count: number }>();
  const vv = wb.addWorksheet("Valid Values", { views: [{ state: "frozen", ySplit: 1 }] });
  let vvCol = 0;
  for (const col of orderedColumns) {
    const values = allowedFor(col);
    if (values.length === 0 || lists.has(col.key)) continue;
    vvCol++;
    const letter = vv.getColumn(vvCol).letter;
    vv.getColumn(vvCol).width = Math.min(40, Math.max(14, col.label.length + 2, ...values.map((v) => v.length + 2)));
    const head = vv.getCell(1, vvCol);
    head.value = col.label;
    head.font = { bold: true };
    values.forEach((v, i) => { vv.getCell(i + 2, vvCol).value = v; });
    lists.set(col.key, { ref: `'Valid Values'!$${letter}$2:$${letter}$${values.length + 1}`, count: values.length });
  }
  if (vvCol === 0) vv.getCell(1, 1).value = "No list attributes in this export.";

  const TYPE_LABEL: Record<string, string> = {
    TEXT: "Text", TEXTAREA: "Long text", NUMBER: "Number", DECIMAL: "Decimal", BOOLEAN: "Yes/No", DATE: "Date",
    SELECT: "List", MULTI_SELECT: "Multi-select list", URL: "URL", EMAIL: "Email", UPC: "UPC", GTIN: "GTIN",
  };
  const lastRow = Math.max(rows.length, 1) + 500; // room for new lines
  // exceljs supports range validations at runtime but its typings omit them.
  const validations = (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations;
  sheetColumns.forEach((c, i) => {
    const colNo = i + 1;
    const letter = ws.getColumn(colNo).letter;
    const list = lists.get(c.col.key);
    const def = c.col.def;
    const type = def ? TYPE_LABEL[def.attributeType] ?? def.attributeType : (CORE_FIELD_BY_KEY[c.col.key]?.type === "boolean" ? "Yes/No" : "Text");
    const parts = [
      `${c.col.label} — ${type}${def?.requirement === "REQUIRED" ? " · Required" : def?.requirement === "CONDITIONAL" ? " · Conditional" : ""}`,
      ...(c.col.maxValues > 1 && !c.col.isCoreField ? [`Up to ${c.col.maxValues} values, one per numbered column.`] : []),
      ...(list ? [`Pick from the list (${list.count} values) — see the "Valid Values" sheet.`] : []),
      ...(def?.unit ? [`Unit: ${def.unit}`] : []),
      ...(def?.description ? [def.description] : []),
    ];
    ws.getCell(1, colNo).note = parts.join("\n");
    if (list) {
      validations.add(`${letter}2:${letter}${lastRow}`, {
        type: "list",
        allowBlank: true,
        formulae: [list.ref],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Not in the list",
        error: `"${c.col.label}" expects one of the values on the Valid Values sheet. Keep this value anyway?`,
      });
    }
  });

  const buf = Buffer.from(await wb.xlsx.writeBuffer());

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, "_")}_export.xlsx"`,
    },
  });
}
