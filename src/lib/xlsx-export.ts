// Shared SheetJS export helper. Generation only — parsing untrusted uploads
// uses exceljs (see xlsx-parse.ts).

import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

export function buildXlsxResponse(
  rows: Record<string, string | number | null>[],
  sheetName: string,
  filename: string
): NextResponse {
  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto column widths from header + cell content
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  ws["!cols"] = headers.map((h) => {
    let max = h.length;
    for (const row of rows) {
      const len = String(row[h] ?? "").length;
      if (len > max) max = len;
    }
    return { wch: Math.min(max + 2, 50) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
