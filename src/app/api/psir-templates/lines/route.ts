import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePsirLines } from "@/lib/psir-resolve";
import { requireAnyPermission, str, SHEETS } from "@/lib/psir-api";

// Resolved view for one scope: Global (no categoryId) or a category's full cascade.
export async function GET(req: Request) {
  const s = await requireAnyPermission("admin:psir_templates");
  if (s instanceof NextResponse) return s;
  const categoryId = new URL(req.url).searchParams.get("categoryId") || null;
  return NextResponse.json(await resolvePsirLines(categoryId));
}

export async function POST(req: Request) {
  const s = await requireAnyPermission("admin:psir_templates");
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => ({}));
  const name = str(body.name, 500);
  const sheet = SHEETS.find((x) => x === body.sheet);
  if (!name || !sheet) return NextResponse.json({ error: "name and sheet are required" }, { status: 400 });
  const sectionId = str(body.sectionId);
  if (sheet === "PSIR_DATA" && !sectionId) {
    return NextResponse.json({ error: "PSIR Data lines need a section" }, { status: 400 });
  }
  const categoryId = str(body.categoryId);
  const last = await prisma.psirTemplateLine.findFirst({
    where: { sheet, sectionId: sheet === "PSIR_DATA" ? sectionId : null },
    orderBy: { sortOrder: "desc" },
  });
  const line = await prisma.psirTemplateLine.create({
    data: {
      sheet,
      sectionId: sheet === "PSIR_DATA" ? sectionId : null,
      categoryId,
      name,
      requirement: str(body.requirement),
      actualFindings: str(body.actualFindings),
      samplingLevel: str(body.samplingLevel, 200),
      aql: str(body.aql, 50),
      sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : (last?.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json(line, { status: 201 });
}
