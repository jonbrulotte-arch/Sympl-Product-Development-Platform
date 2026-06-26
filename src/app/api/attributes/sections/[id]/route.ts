import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { name, sortOrder } = await req.json();

  const data: Record<string, unknown> = {};
  if (name !== undefined) {
    const trimmed = String(name).trim();
    data.name = trimmed;
    const base = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let slug = base;
    let i = 1;
    while (await prisma.attributeSection.findFirst({ where: { slug, NOT: { id } } })) {
      slug = `${base}-${i++}`;
    }
    data.slug = slug;
  }
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

  const section = await prisma.attributeSection.update({ where: { id }, data });
  return NextResponse.json(section);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.attributeDefinition.updateMany({ where: { sectionId: id }, data: { sectionId: null } });
  await prisma.attributeSection.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
