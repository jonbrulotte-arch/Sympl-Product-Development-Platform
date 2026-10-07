import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, str } from "@/lib/psir-api";

// Upserts the override a category holds on an inherited line. Fields omitted or
// null inherit; an override with nothing left in it is deleted.
export async function PUT(req: Request) {
  const s = await requireAnyPermission("admin:psir_templates");
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => ({}));
  const lineId = str(body.lineId);
  const categoryId = str(body.categoryId);
  if (!lineId || !categoryId) return NextResponse.json({ error: "lineId and categoryId are required" }, { status: 400 });

  const line = await prisma.psirTemplateLine.findUnique({ where: { id: lineId } });
  if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });
  if (line.categoryId === categoryId) {
    return NextResponse.json({ error: "This category owns the line; edit it directly" }, { status: 400 });
  }

  const data = {
    hidden: typeof body.hidden === "boolean" ? body.hidden : null,
    requirement: str(body.requirement),
    actualFindings: str(body.actualFindings),
    samplingLevel: str(body.samplingLevel, 200),
    aql: str(body.aql, 50),
  };
  const empty = Object.values(data).every((v) => v === null);
  if (empty) {
    await prisma.psirTemplateLineOverride.deleteMany({ where: { lineId, categoryId } });
    return NextResponse.json({ ok: true, deleted: true });
  }
  const override = await prisma.psirTemplateLineOverride.upsert({
    where: { lineId_categoryId: { lineId, categoryId } },
    update: data,
    create: { lineId, categoryId, ...data },
  });
  return NextResponse.json(override);
}

export async function DELETE(req: Request) {
  const s = await requireAnyPermission("admin:psir_templates");
  if (s instanceof NextResponse) return s;
  const sp = new URL(req.url).searchParams;
  const lineId = sp.get("lineId");
  const categoryId = sp.get("categoryId");
  if (!lineId || !categoryId) return NextResponse.json({ error: "lineId and categoryId are required" }, { status: 400 });
  await prisma.psirTemplateLineOverride.deleteMany({ where: { lineId, categoryId } });
  return NextResponse.json({ ok: true });
}
