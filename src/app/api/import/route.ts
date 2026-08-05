import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CORE_FIELDS, coerceCoreValue } from "@/lib/core-fields";
import { checkProjectAccess } from "@/lib/project-access";
import { parseUploadedWorkbook } from "@/lib/xlsx-parse";

const CORE_FIELD_BY_KEY = Object.fromEntries(CORE_FIELDS.map((f) => [f.key, f]));

function findHeaderRow(raw: string[][]): number {
  const idx = raw.findIndex((row) =>
    Array.isArray(row) && row.some((c) => typeof c === "string" && c.includes("Part Number"))
  );
  return idx >= 0 ? idx : 0;
}

type MappedRow = {
  rowNumber: number;
  coreValues: Record<string, string>;
  coreData: Record<string, unknown>;
  attrValues: { key: string; valueIndex: number; value: string }[];
};

function mapRows(
  dataRows: string[][],
  headers: string[],
  mapping: Record<string, string>
): MappedRow[] {
  const out: MappedRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (row.every((c) => !c)) continue;

    const rowData: Record<string, string> = {};
    headers.forEach((h, j) => { rowData[h] = row[j]?.toString() ?? ""; });

    // Core fields map to a plain key ("partNumber"); custom attributes map to
    // "attr:<attributeKey>:<valueIndex>" so multi-value attributes don't
    // collide onto the same slot and overwrite each other.
    const coreValues: Record<string, string> = {};
    const attrValues: MappedRow["attrValues"] = [];
    for (const [sourceCol, targetField] of Object.entries(mapping)) {
      if (!targetField || rowData[sourceCol] === undefined) continue;
      if (targetField.startsWith("attr:")) {
        const [, attrKey, idxStr] = targetField.split(":");
        attrValues.push({ key: attrKey, valueIndex: parseInt(idxStr, 10) || 0, value: rowData[sourceCol] });
      } else {
        coreValues[targetField] = rowData[sourceCol];
      }
    }

    if (!coreValues.partNumber && !coreValues.itemName) continue;

    const coreData: Record<string, unknown> = {};
    for (const [key, rawVal] of Object.entries(coreValues)) {
      const field = CORE_FIELD_BY_KEY[key];
      if (!field) continue;
      const coerced = coerceCoreValue(field.type, rawVal);
      if (coerced !== undefined) coreData[key] = coerced;
    }

    out.push({ rowNumber: i + 1, coreValues, coreData, attrValues });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("projectId") as string | null;
  const phase = formData.get("phase") as string | null; // "preview" | "dryrun" | "import"
  const sheetName = formData.get("sheetName") as string | null;
  const columnMapping = formData.get("columnMapping") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  let workbook;
  try {
    workbook = await parseUploadedWorkbook(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not parse file — ensure it is a valid .xlsx workbook" }, { status: 400 });
  }

  if (phase === "preview") {
    const selectedSheet = sheetName ?? workbook.sheetNames[0];
    const raw = workbook.getRows(selectedSheet);
    const headerIdx = findHeaderRow(raw);
    const headers = (raw[headerIdx] ?? []).filter(Boolean);
    const allDataRows = raw.slice(headerIdx + 1);

    const sampleRows = allDataRows.slice(0, 5).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = row[i]?.toString() ?? ""; });
      return obj;
    });

    return NextResponse.json({
      sheets: workbook.sheetNames,
      selectedSheet,
      headers,
      sampleRows,
      totalRows: allDataRows.filter((r) => r.some((c) => c !== "" && c != null)).length,
    });
  }

  // Dry-run and import phases both need project + mapping
  if (!projectId || !columnMapping) {
    return NextResponse.json({ error: "projectId and columnMapping required" }, { status: 400 });
  }

  const access = await checkProjectAccess(projectId, session, "edit");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const mapping: Record<string, string> = JSON.parse(columnMapping);
  const selectedSheet = sheetName ?? workbook.sheetNames[0];
  const raw = workbook.getRows(selectedSheet);
  const headerIdx = findHeaderRow(raw);
  const headers = raw[headerIdx] ?? [];
  const dataRows = raw.slice(headerIdx + 1);

  const mappedRows = mapRows(dataRows, headers, mapping);

  // Existing products keyed by Part Number → upsert instead of duplicating
  const existingProducts = await prisma.productRecord.findMany({
    where: { projectId, isArchived: false, partNumber: { not: null } },
    include: { attributeValues: true },
  });
  const existingByPartNumber = new Map(
    existingProducts.filter((p) => p.partNumber).map((p) => [p.partNumber as string, p])
  );

  // Resolve attribute definitions once for the whole file (not per row)
  const allAttrKeys = [...new Set(mappedRows.flatMap((r) => r.attrValues.map((a) => a.key)))];
  const attrDefs = allAttrKeys.length
    ? await prisma.attributeDefinition.findMany({
        where: { key: { in: allAttrKeys }, isActive: true },
        select: { id: true, key: true, label: true, maxValues: true },
      })
    : [];
  const defByKey = Object.fromEntries(attrDefs.map((d) => [d.key, d.id]));
  const defsByKey = Object.fromEntries(attrDefs.map((d) => [d.key, d]));

  // ─── Dry run: report what WOULD happen, write nothing ──────────────────────
  if (phase === "dryrun") {
    const changes: {
      row: number;
      partNumber: string | null;
      action: "create" | "update";
      fieldChanges: { field: string; from: string; to: string }[];
    }[] = [];
    let wouldCreate = 0;
    let wouldUpdate = 0;

    for (const mr of mappedRows) {
      const partNumber = mr.coreValues.partNumber?.trim() || null;
      const existing = partNumber ? existingByPartNumber.get(partNumber) : undefined;
      if (existing) {
        wouldUpdate++;
        const fieldChanges: { field: string; from: string; to: string }[] = [];
        for (const [key, newVal] of Object.entries(mr.coreData)) {
          const field = CORE_FIELD_BY_KEY[key];
          const oldVal = (existing as unknown as Record<string, unknown>)[key];
          const oldStr = oldVal === null || oldVal === undefined ? "" : String(oldVal);
          const newStr = String(newVal);
          if (oldStr !== newStr) {
            fieldChanges.push({ field: field?.label ?? key, from: oldStr, to: newStr });
          }
        }
        // Custom (EAV) attribute diffs — without these, imports that only
        // change attribute values would misleadingly report "no field changes".
        // A blank cell in a mapped column clears the stored value, so an
        // empty av.value against a non-empty stored value is a real change.
        for (const av of mr.attrValues) {
          const def = defsByKey[av.key];
          if (!def) continue;
          const old = existing.attributeValues.find(
            (x) => x.attributeDefinitionId === def.id && x.valueIndex === av.valueIndex
          );
          const oldStr =
            old?.textValue ?? old?.numberValue?.toString() ?? old?.booleanValue?.toString() ?? "";
          if (oldStr !== av.value) {
            const label = def.maxValues > 1 ? `${def.label} ${av.valueIndex + 1}` : def.label;
            fieldChanges.push({ field: label, from: oldStr, to: av.value });
          }
        }
        if (changes.length < 100) {
          changes.push({ row: mr.rowNumber, partNumber, action: "update", fieldChanges });
        }
      } else {
        wouldCreate++;
        if (changes.length < 100) {
          changes.push({ row: mr.rowNumber, partNumber, action: "create", fieldChanges: [] });
        }
      }
    }

    // Diagnostics: distinguish "no attribute columns mapped" from "cells all
    // empty" from "attribute keys didn't resolve" — otherwise every one of
    // those failure modes looks identical ("no field changes") in the review.
    const mappedAttrColumns = Object.values(mapping).filter((v) => v?.startsWith("attr:")).length;
    const attrCellsWithValue = mappedRows.reduce(
      (n, mr) => n + mr.attrValues.filter((a) => a.value).length,
      0
    );
    const unresolvedAttrKeys = allAttrKeys.filter((k) => !defByKey[k]);

    return NextResponse.json({
      dryRun: true,
      totalRows: mappedRows.length,
      wouldCreate,
      wouldUpdate,
      changes,
      attrDiagnostics: { mappedAttrColumns, attrCellsWithValue, unresolvedAttrKeys },
    });
  }

  // ─── Import phase ───────────────────────────────────────────────────────────
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
  // Per-attribute diagnostics so a silent mapping/resolution failure is
  // visible in the result instead of looking like a successful no-op import.
  let attrValuesWritten = 0;
  let attrValuesCleared = 0;
  const unresolvedAttrKeys = allAttrKeys.filter((k) => !defByKey[k]);

  const maxRow = await prisma.productRecord.aggregate({
    where: { projectId },
    _max: { rowIndex: true },
  });
  let nextRowIndex = (maxRow._max.rowIndex ?? -1) + 1;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { categoryId: true },
  });
  const projectCategoryId = project?.categoryId ?? null;

  for (const mr of mappedRows) {
    try {
      const partNumber = mr.coreValues.partNumber?.trim() || undefined;
      const existing = partNumber ? existingByPartNumber.get(partNumber) : undefined;

      let productId: string;
      if (existing) {
        const updated = await prisma.productRecord.update({
          where: { id: existing.id },
          data: { ...mr.coreData, updatedById: session.user.id },
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
            ...mr.coreData,
          },
        });
        productId = created.id;
        if (partNumber) existingByPartNumber.set(partNumber, { ...created, attributeValues: [] });
        createdRows++;
      }

      for (const av of mr.attrValues) {
        const attributeDefinitionId = defByKey[av.key];
        if (!attributeDefinitionId) continue;
        // Blank cell in a mapped column = clear the stored value for that
        // slot. Unmapped columns never reach here, so data the sheet doesn't
        // cover is left alone.
        if (!av.value) {
          const deleted = await prisma.productAttributeValue.deleteMany({
            where: { productId, attributeDefinitionId, valueIndex: av.valueIndex },
          });
          attrValuesCleared += deleted.count;
          continue;
        }
        attrValuesWritten++;
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
    } catch (err) {
      errorRows++;
      errors.push({
        row: mr.rowNumber,
        errors: [err instanceof Error ? err.message.slice(0, 200) : "Failed to import row"],
      });
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
    attrValuesWritten,
    attrValuesCleared,
    unresolvedAttrKeys,
  });
}
