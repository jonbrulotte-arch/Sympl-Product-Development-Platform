import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true, projects: true } } },
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, description, parentId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const category = await prisma.category.create({
    data: {
      name: name.trim(),
      slug: slugify(name.trim()),
      description: description?.trim() || null,
      parentId: parentId || null,
    },
    include: { _count: { select: { products: true, projects: true } } },
  });
  return NextResponse.json(category, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, name, description, isActive, sortOrder } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (name !== undefined) { data.name = name.trim(); data.slug = slugify(name.trim()); }
  if (description !== undefined) data.description = description?.trim() || null;
  if (isActive !== undefined) data.isActive = isActive;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

  const category = await prisma.category.update({
    where: { id },
    data,
    include: { _count: { select: { products: true, projects: true } } },
  });
  return NextResponse.json(category);
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.category.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
