import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sections = await prisma.attributeSection.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(sections);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let slug = base;
  let i = 1;
  while (await prisma.attributeSection.findFirst({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }

  const last = await prisma.attributeSection.findFirst({ orderBy: { sortOrder: "desc" } });
  const section = await prisma.attributeSection.create({
    data: { name: name.trim(), slug, sortOrder: (last?.sortOrder ?? -1) + 1, isCore: false },
  });

  return NextResponse.json(section, { status: 201 });
}
