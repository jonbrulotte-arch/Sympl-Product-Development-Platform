import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

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

    const headers = (headerRowIndex >= 0 ? (raw[headerRowIndex] as string[]) : (raw[0] as string[])).filter(Boolean);
    const dataRows = raw.slice(headerRowIndex + 2).slice(0, 5);

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
      totalRows: raw.length - headerRowIndex - 2,
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
  const headers = raw[headerRowIndex] as string[];
  const dataRows = raw.slice(headerRowIndex + 2);

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

  let importedRows = 0;
  let errorRows = 0;
  const errors: { row: number; errors: string[] }[] = [];

  const maxRow = await prisma.productRecord.aggregate({
    where: { projectId },
    _max: { rowIndex: true },
  });
  let nextRowIndex = (maxRow._max.rowIndex ?? -1) + 1;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] as string[];
    if (row.every((c) => !c)) continue; // skip empty rows

    const rowData: Record<string, string> = {};
    headers.forEach((h, j) => {
      rowData[h] = row[j]?.toString() ?? "";
    });

    // Apply column mapping to build product data
    const productData: Record<string, unknown> = {};
    for (const [sourceCol, targetField] of Object.entries(mapping)) {
      if (targetField && rowData[sourceCol] !== undefined) {
        productData[targetField] = rowData[sourceCol];
      }
    }

    if (!productData.partNumber && !productData.itemName) {
      continue; // skip if no meaningful data
    }

    try {
      await prisma.productRecord.create({
        data: {
          projectId,
          createdById: session.user.id,
          updatedById: session.user.id,
          rowIndex: nextRowIndex++,
          partNumber: productData.partNumber as string | undefined,
          modelNumber: productData.modelNumber as string | undefined,
          itemName: productData.itemName as string | undefined,
          brand: productData.brand as string | undefined,
          upc: productData.upc as string | undefined,
          inventoryStatus: productData.inventoryStatus as string | undefined,
          warrantyInfo: productData.warrantyInfo as string | undefined,
          htsCode: productData.htsCode as string | undefined,
          htsCodeCanada: productData.htsCodeCanada as string | undefined,
          productComposition: productData.productComposition as string | undefined,
          packagingType: productData.packagingType as string | undefined,
          packSize: productData.packSize as string | undefined,
          material: productData.material as string | undefined,
          size: productData.size as string | undefined,
          jspCategory: productData.jspCategory as string | undefined,
          masterCartonGtin: productData.masterCartonGtin as string | undefined,
          palletGtin: productData.palletGtin as string | undefined,
        },
      });
      importedRows++;
    } catch {
      errorRows++;
      errors.push({ row: i + 1, errors: ["Failed to import row"] });
    }
  }

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
    errorRows,
    errors,
  });
}
