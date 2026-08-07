import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { can } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    include: {
      children: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      attributes: {
        where: { isActive: true },
        include: { lovItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { products: { where: { isArchived: false } } } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:categories"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description, parentId } = await req.json();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const category = await prisma.category.create({
    data: {
      name,
      slug: slugify(name),
      description,
      parentId: parentId ?? undefined,
    },
  });

  return NextResponse.json(category, { status: 201 });
}
