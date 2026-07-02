import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { CORE_FIELDS, coerceCoreValue } from "@/lib/core-fields";

const CORE_FIELD_BY_KEY = Object.fromEntries(CORE_FIELDS.map((f) => [f.key, f]));

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("projectId") as string | null;
  const phase = formData.get("phase") as string | null; // "preview" | "import"
  const sheetName = formData.get("sheetName") as string | null;
  const columnMapping = formData.get("columnMapping") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: "array" });

  if (phase === "preview") {
    const sheets = wb.SheetNames;
    const selectedSheet = sheetName ?? sheets[0];
    const ws = wb.Sheets[selectedSheet];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];

    // Find header row (skip section-level rows)
    const headerRowIndex = raw.findIndex((row) =>
      Array.isArray(row) && (row as unknown[]).some((c) => typeof c === "string" && (c as string).includes("Part Number"))
    );

    const headerIdx = headerRowIndex >= 0 ? headerRowIndex : 0;
    const headers = (raw[headerIdx] as string[]).filter(Boolean);
    const allDataRows = raw.slice(headerIdx + 1);
    const dataRows = allDataRows.slice(0, 5);

    const sampleRows = dataRows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = (row as string[])[i]?.toString() ?? "";
      });
      return obj;
    });

    return NextResponse.json({
      sheets,
      selectedSheet,
      headers,
      sampleRows,
      totalRows: allDataRows.filter((r) => (r as string[]).some((c) => c !== "" && c != null)).length,
    });
  }

  // Import phase
  if (!projectId || !columnMapping) {
    return NextResponse.json({ error: "projectId and columnMapping required" }, { status: 400 });
  }

  const mapping: Record<string, string> = JSON.parse(columnMapping);
  const selectedSheet = sheetName ?? wb.SheetNames[0];
  const ws = wb.Sheets[selectedSheet];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];

  const headerRowIndex = raw.findIndex((row) =>
    Array.isArray(row) && (row as unknown[]).some((c) => typeof c === "string" && (c as string).includes("Part Number"))
  );
  const headerIdx = headerRowIndex >= 0 ? headerRowIndex : 0;
  const headers = raw[headerIdx] as string[];
  const dataRows = raw.slice(headerIdx + 1);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { categoryId: true },
  });
  const projectCategoryId = project?.categoryId ?? null;

  let importRecord = await prisma.importHistory.create({
    data: {
      projectId,
      userId: session.user.id,
      fileName: file.name,
      status: "PROCESSING",
      totalRows: dataRows.length,
      columnMapping: mapping,
    },
  });

  let createdRows = 0;
  let updatedRows = 0;
  let errorRows = 0;
  const errors: { row: number; errors: string[] }[] = [];

  const maxRow = await prisma.productRecord.aggregate({
    where: { projectId },
    _max: { rowIndex: true },
  });
  let nextRowIndex = (maxRow._max.rowIndex ?? -1) + 1;

  // Existing products in this project, keyed by Part Number, so re-importing
  // the same sheet updates rows instead of creating duplicates.
  const existingProducts = await prisma.productRecord.findMany({
    where: { projectId, isArchived: false, partNumber: { not: null } },
    select: { id: true, partNumber: true },
  });
  const existingByPartNumber = new Map(
    existingProducts.filter((p) => p.partNumber).map((p) => [p.partNumber as string, p.id])
  );

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] as string[];
    if (row.every((c) => !c)) continue; // skip empty rows

    const rowData: Record<string, string> = {};
    headers.forEach((h, j) => {
      rowData[h] = row[j]?.toString() ?? "";
    });

    // Apply column mapping to build product data.
    // Core fields map to a plain key ("partNumber"); custom attributes map to
    // "attr:<attributeKey>:<valueIndex>" so multi-value attributes (which export
    // as separate "Label 1", "Label 2", ... columns) don't collide onto the
    // same slot and overwrite each other.
    const coreValues: Record<string, string> = {};
    const attrValues: { key: string; valueIndex: number; value: string }[] = [];
    for (const [sourceCol, targetField] of Object.entries(mapping)) {
      if (!targetField || rowData[sourceCol] === undefined) continue;
      if (targetField.startsWith("attr:")) {
        const [, attrKey, idxStr] = targetField.split(":");
        attrValues.push({ key: attrKey, valueIndex: parseInt(idxStr, 10) || 0, value: rowData[sourceCol] });
      } else {
        coreValues[targetField] = rowData[sourceCol];
      }
    }

    if (!coreValues.partNumber && !coreValues.itemName) {
      continue; // skip if no meaningful data
    }

    // Coerce core field strings into the types Prisma expects, dropping blanks
    // and unparseable numbers rather than writing bad data.
    const coreData: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(coreValues)) {
      const field = CORE_FIELD_BY_KEY[key];
      if (!field) continue;
      const coerced = coerceCoreValue(field.type, raw);
      if (coerced !== undefined) coreData[key] = coerced;
    }

    try {
      const partNumber = coreValues.partNumber?.trim() || undefined;
      const existingId = partNumber ? existingByPartNumber.get(partNumber) : undefined;

      let productId: string;
      if (existingId) {
        const updated = await prisma.productRecord.update({
          where: { id: existingId },
          data: { ...coreData, updatedById: session.user.id },
        });
        productId = updated.id;
        updatedRows++;
      } else {
        const created = await prisma.productRecord.create({
          data: {
            projectId,
            categoryId: projectCategoryId,
            createdById: session.user.id,
            updatedById: session.user.id,
            rowIndex: nextRowIndex++,
            ...coreData,
          },
        });
        productId = created.id;
        if (partNumber) existingByPartNumber.set(partNumber, productId);
        createdRows++;
      }

      if (attrValues.length > 0) {
        const attrDefs = await prisma.attributeDefinition.findMany({
          where: { key: { in: [...new Set(attrValues.map((a) => a.key))] }, isActive: true },
          select: { id: true, key: true },
        });
        const defByKey = Object.fromEntries(attrDefs.map((d) => [d.key, d.id]));

        for (const av of attrValues) {
          const attributeDefinitionId = defByKey[av.key];
          if (!attributeDefinitionId || !av.value) continue;
          await prisma.productAttributeValue.upsert({
            where: {
              productId_attributeDefinitionId_valueIndex: {
                productId,
                attributeDefinitionId,
                valueIndex: av.valueIndex,
              },
            },
            update: { textValue: av.value },
            create: {
              productId,
              attributeDefinitionId,
              valueIndex: av.valueIndex,
              textValue: av.value,
            },
          });
        }
      }
    } catch {
      errorRows++;
      errors.push({ row: i + 1, errors: ["Failed to import row"] });
    }
  }

  const importedRows = createdRows + updatedRows;

  importRecord = await prisma.importHistory.update({
    where: { id: importRecord.id },
    data: {
      status: errorRows > 0 && importedRows === 0 ? "FAILED" : errorRows > 0 ? "PARTIAL" : "COMPLETED",
      importedRows,
      errorRows,
      errorReport: errors,
      completedAt: new Date(),
    },
  });

  await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });

  return NextResponse.json({
    importId: importRecord.id,
    totalRows: dataRows.length,
    importedRows,
    createdRows,
    updatedRows,
    errorRows,
    errors,
  });
}
