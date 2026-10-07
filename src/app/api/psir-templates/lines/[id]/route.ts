import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, str } from "@/lib/psir-api";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const s = await requireAnyPermission("admin:psir_templates");
  if (s instanceof NextResponse) return s;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = str(body.name, 500);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    data.name = name;
  }
  if (body.requirement !== undefined) data.requirement = str(body.requirement);
  if (body.actualFindings !== undefined) data.actualFindings = str(body.actualFindings);
  if (body.samplingLevel !== undefined) data.samplingLevel = str(body.samplingLevel, 200);
  if (body.aql !== undefined) data.aql = str(body.aql, 50);
  if (body.sectionId !== undefined) data.sectionId = str(body.sectionId);
  if (Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
  const line = await prisma.psirTemplateLine.update({ where: { id }, data }).catch(() => null);
  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(line);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await requireAnyPermission("admin:psir_templates");
  if (s instanceof NextResponse) return s;
  const { id } = await params;
  await prisma.psirTemplateLine.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
