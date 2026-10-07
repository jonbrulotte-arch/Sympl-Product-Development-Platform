// Fills the committed CTQ PSIR template (src/lib/templates/psir-template.xlsx).
// Acknowledgement, Inspection Photos and Product Information pass through
// untouched; the three data sheets have their sample rows cleared and rebuilt
// using the template's own rows as style prototypes. Writes with exceljs for the
// same reason as the QC Dims export: SheetJS cannot emit cell styling.

import path from "path";
import ExcelJS from "exceljs";
import {
  applyTokens,
  numberPsirDataLines,
  type PsirSheetKey,
  type ResolvedPsirLine,
} from "@/lib/psir-template";

const TEMPLATE_PATH = path.join(process.cwd(), "src/lib/templates/psir-template.xlsx");

const SHEET_NAMES: Record<PsirSheetKey, string> = {
  PSIR_DATA: "PSIR Data",
  PRODUCT_MEASUREMENTS: "Product Measurements",
  FUNCTIONAL_INSPECTIONS: "Functional Inspections",
};

type StyleRow = Partial<ExcelJS.Style>[];

function findSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  // The template's sheet is literally " PSIR Data" (leading space).
  const ws = wb.worksheets.find((w) => w.name.trim() === name);
  if (!ws) throw new Error(`PSIR template is missing the "${name}" sheet`);
  return ws;
}

function captureStyles(ws: ExcelJS.Worksheet, rowNumber: number, cols: number): StyleRow {
  const row = ws.getRow(rowNumber);
  return Array.from({ length: cols }, (_, i) => structuredClone(row.getCell(i + 1).style ?? {}));
}

/** Drops every merge and value at or below firstRow so the data area can be rebuilt. */
function clearFrom(ws: ExcelJS.Worksheet, firstRow: number, cols: number) {
  const merges: string[] = [...((ws.model as { merges?: string[] }).merges ?? [])];
  for (const range of merges) {
    const top = Number(range.split(":")[0].replace(/[A-Z]+/g, ""));
    if (top >= firstRow) ws.unMergeCells(range);
  }
  for (let r = firstRow; r <= Math.max(ws.rowCount, firstRow); r++) {
    const row = ws.getRow(r);
    row.height = undefined as unknown as number;
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.value = null;
      cell.style = {};
    }
  }
}

function asCellValue(v: string): string | number {
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

function writeRow(ws: ExcelJS.Worksheet, rowNumber: number, styles: StyleRow, values: (string | null)[]) {
  const row = ws.getRow(rowNumber);
  styles.forEach((s, i) => { row.getCell(i + 1).style = structuredClone(s); });
  values.forEach((v, i) => { if (v !== null && v !== "") row.getCell(i + 1).value = v; });
  // Rough wrap estimate so long requirements aren't cut off; Excel won't autofit merged/wrapped rows itself.
  let lines = 1;
  values.forEach((v, i) => {
    if (!v) return;
    const width = ws.getColumn(i + 1).width ?? 10;
    const est = v.split("\n").reduce((n, part) => n + Math.max(1, Math.ceil(part.length / Math.max(width * 1.1, 1))), 0);
    lines = Math.max(lines, est);
  });
  if (lines > 1) row.height = Math.min(409, 15 * lines);
}

function setHeader(ws: ExcelJS.Worksheet, partNumber: string, description: string) {
  if (partNumber) ws.getCell("A3").value = asCellValue(partNumber);
  if (description) ws.getCell("C3").value = description;
}

export type PsirExportInput = {
  lines: ResolvedPsirLine[];
  partNumber: string;
  description: string;
  tokenValues: Record<string, string>;
};

export async function buildPsirWorkbook(input: PsirExportInput): Promise<Buffer> {
  const { lines, tokenValues } = input;
  const partNumber = input.partNumber.trim();
  const description = input.description.trim();
  const fill = (t: string | null) => applyTokens(t, tokenValues);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  // ── PSIR Data: section rows (row 9 style, B:K merged) + line rows (row 10 style)
  {
    const ws = findSheet(wb, SHEET_NAMES.PSIR_DATA);
    const COLS = 11;
    const sectionStyle = captureStyles(ws, 9, COLS);
    const lineStyle = captureStyles(ws, 10, COLS);
    setHeader(ws, partNumber, description);
    if (!description) ws.getCell("C3").value = null;
    clearFrom(ws, 9, COLS);

    let r = 9;
    for (const section of numberPsirDataLines(lines)) {
      writeRow(ws, r, sectionStyle, [section.number, section.name]);
      ws.mergeCells(r, 2, r, COLS);
      r++;
      for (const l of section.lines) {
        writeRow(ws, r, lineStyle, [l.number, l.name, fill(l.requirement), fill(l.actualFindings), l.samplingLevel ?? "", l.aql ?? ""]);
        if (l.aql) ws.getCell(r, 6).value = asCellValue(l.aql);
        r++;
      }
    }
  }

  // ── Product Measurements / Functional Inspections: one row per line from row 8
  for (const key of ["PRODUCT_MEASUREMENTS", "FUNCTIONAL_INSPECTIONS"] as const) {
    const ws = findSheet(wb, SHEET_NAMES[key]);
    const COLS = 10;
    const lineStyle = captureStyles(ws, 8, COLS);
    setHeader(ws, partNumber, description);
    clearFrom(ws, 8, COLS);

    let r = 8;
    for (const l of lines.filter((x) => x.sheet === key && !x.hidden)) {
      writeRow(ws, r, lineStyle, ["", partNumber, l.name, fill(l.requirement), fill(l.actualFindings), l.samplingLevel ?? "", l.aql ?? ""]);
      if (partNumber) ws.getCell(r, 2).value = asCellValue(partNumber);
      if (l.aql) ws.getCell(r, 7).value = asCellValue(l.aql);
      r++;
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

export function psirFileName(partNumber: string, categoryName: string): string {
  const base = (partNumber.trim() || categoryName).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  return `PSIR_${base}_${date}.xlsx`;
}
