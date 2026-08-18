// Shared exceljs export helper. Both generation and parsing now use exceljs.

import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

export function buildXlsxResponse(
  inputRows: Record<string, string | number | null>[],
  sheetName: string,
  filename: string
): NextResponse {
  // We need to build the workbook synchronously-ish but exceljs buffer write
  // is async, so we return a NextResponse built from the promise.
  const promise = (async () => {
    // Underscore-prefixed keys carry IDs for the UI (row drill-down) and are not
    // part of the exported sheet.
    const rows = inputRows.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("_")))
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName.slice(0, 31));

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    // Add header row
    ws.columns = headers.map((h) => {
      let max = h.length;
      for (const row of rows) {
        const len = String(row[h] ?? "").length;
        if (len > max) max = len;
      }
      return { header: h, key: h, width: Math.min(max + 2, 50) };
    });

    // Add data rows
    for (const row of rows) {
      ws.addRow(row);
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  })();

  // NextResponse accepts a promise body via the Response constructor with a
  // ReadableStream, but the simplest approach is to await and return.
  // Since route handlers can return promises, we wrap in an async-compatible way.
  // However buildXlsxResponse is sync in its signature — we need to keep it that way.
  // Use a ReadableStream that pulls from the promise.
  const stream = new ReadableStream({
    async start(controller) {
      const buf = await promise;
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
