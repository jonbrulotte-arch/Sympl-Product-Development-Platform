import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, str } from "@/lib/psir-api";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const s = await requireAnyPermission("admin:psir_templates");
  if (s instanceof NextResponse) return s;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: { name?: string; sortOrder?: number; isActive?: boolean } = {};
  if (body.name !== undefined) {
    const name = str(body.name, 300);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    data.name = name;
  }
  if (Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  const section = await prisma.psirTemplateSection.update({ where: { id }, data }).catch(() => null);
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(section);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await requireAnyPermission("admin:psir_templates");
  if (s instanceof NextResponse) return s;
  const { id } = await params;
  const used = await prisma.psirTemplateLine.count({ where: { sectionId: id } });
  if (used) {
    return NextResponse.json({ error: `Section still has ${used} line(s). Move or delete them first.` }, { status: 409 });
  }
  await prisma.psirTemplateSection.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
