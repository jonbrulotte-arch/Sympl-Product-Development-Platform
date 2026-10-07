import { NextResponse } from "next/server";
import { resolvePsirLines } from "@/lib/psir-resolve";
import { buildPsirWorkbook, psirFileName } from "@/lib/psir-export";
import { cleanTokens, requireAnyPermission, str } from "@/lib/psir-api";

export async function POST(req: Request) {
  const s = await requireAnyPermission("psir_generator:use");
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => ({}));
  const categoryId = str(body.categoryId);
  if (!categoryId) return NextResponse.json({ error: "categoryId is required" }, { status: 400 });

  const { chain, lines } = await resolvePsirLines(categoryId);
  if (chain.length === 0) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const partNumber = str(body.partNumber, 100) ?? "";
  const buffer = await buildPsirWorkbook({
    lines,
    partNumber,
    description: str(body.description, 500) ?? "",
    tokenValues: cleanTokens(body.tokenValues),
  });
  const filename = psirFileName(partNumber, chain[chain.length - 1].name);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
