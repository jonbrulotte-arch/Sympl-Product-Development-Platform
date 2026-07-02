import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseUploadedWorkbook } from "@/lib/xlsx-parse";

// Extracts part numbers from an uploaded .xlsx — used by the compliance and
// PSIR bulk-link dialogs so users can upload a sheet instead of pasting.
// Uses the "Part Number" column when a header row is present, otherwise the
// first column.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  let rows: string[][];
  try {
    const wb = await parseUploadedWorkbook(await file.arrayBuffer());
    rows = wb.getRows(wb.sheetNames[0]);
  } catch {
    return NextResponse.json({ error: "Could not parse file — ensure it is a valid .xlsx workbook" }, { status: 400 });
  }

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  let colIdx = 0;
  let startRow = 0;
  const headerRowIdx = rows.findIndex((r) => r.some((c) => normalize(c ?? "") === "partnumber"));
  if (headerRowIdx >= 0) {
    colIdx = rows[headerRowIdx].findIndex((c) => normalize(c ?? "") === "partnumber");
    startRow = headerRowIdx + 1;
  }

  const partNumbers = [...new Set(
    rows.slice(startRow)
      .map((r) => (r[colIdx] ?? "").toString().trim())
      .filter(Boolean)
  )];

  return NextResponse.json({ partNumbers });
}
