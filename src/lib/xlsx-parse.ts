import ExcelJS from "exceljs";

// Parsing layer for UNTRUSTED uploaded spreadsheets, built on exceljs.
// SheetJS (xlsx@0.18.x from npm) has known CVEs triggerable by crafted files
// (prototype pollution CVE-2023-30533, ReDoS CVE-2024-22363) and patched
// builds aren't published to npm — so uploads are never parsed with it.
// xlsx remains in use only for generating exports, which is not exposed to
// attacker-controlled input.

export type ParsedWorkbook = {
  sheetNames: string[];
  // Returns the sheet as a dense row-major string matrix (like
  // sheet_to_json(ws, { header: 1, defval: "" }) did).
  getRows: (sheetName: string) => string[][];
};

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  // cell.text renders rich text, formula results, dates, and hyperlinks
  // to their display string
  try {
    return cell.text ?? "";
  } catch {
    return String(v);
  }
}

export async function parseUploadedWorkbook(buf: ArrayBuffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const sheetNames = wb.worksheets.map((ws) => ws.name);

  const getRows = (sheetName: string): string[][] => {
    const ws = wb.getWorksheet(sheetName) ?? wb.worksheets[0];
    if (!ws) return [];
    const rows: string[][] = [];
    const colCount = ws.columnCount;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const out: string[] = [];
      for (let c = 1; c <= colCount; c++) {
        out.push(cellToString(row.getCell(c)));
      }
      rows.push(out);
    }
    return rows;
  };

  return { sheetNames, getRows };
}
