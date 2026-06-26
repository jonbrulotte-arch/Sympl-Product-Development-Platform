import { can } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:psir_attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const { label, description, attributeType, sortOrder, options, isActive } = body;

  const attr = await prisma.psirAttributeDefinition.update({
    where: { id },
    data: {
      ...(label !== undefined && { label: label.trim() }),
      ...(description !== undefined && { description }),
      ...(attributeType !== undefined && { attributeType }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(options !== undefined && { options }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  return NextResponse.json(attr);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:psir_attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.psirAttributeDefinition.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
