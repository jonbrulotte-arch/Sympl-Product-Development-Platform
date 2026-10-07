import { NextResponse } from "next/server";
import { resolvePsirLines } from "@/lib/psir-resolve";
import { extractTokens } from "@/lib/psir-template";
import { requireAnyPermission } from "@/lib/psir-api";

export async function GET(req: Request) {
  const s = await requireAnyPermission("psir_generator:use");
  if (s instanceof NextResponse) return s;
  const categoryId = new URL(req.url).searchParams.get("categoryId");
  if (!categoryId) return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  const { chain, lines } = await resolvePsirLines(categoryId);
  if (chain.length === 0) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  const visible = lines.filter((l) => !l.hidden);
  return NextResponse.json({
    chain,
    lines: visible,
    tokens: extractTokens(visible.flatMap((l) => [l.requirement, l.actualFindings])),
  });
}
