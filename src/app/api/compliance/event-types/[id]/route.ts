import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const { name, description, color, sortOrder, isActive } = body;

  const type = await prisma.complianceEventType.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description }),
      ...(color !== undefined && { color }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  return NextResponse.json(type);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.complianceEventType.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
