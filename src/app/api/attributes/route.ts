import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const coreOnly = searchParams.get("coreOnly") === "true";
  const salsifyOnly = searchParams.get("salsifyOnly") === "true";

  const attributes = await prisma.attributeDefinition.findMany({
    where: {
      isActive: true,
      ...(coreOnly ? { isCore: true } : {}),
      ...(salsifyOnly ? { salsifyEnabled: true, salsifyPropertyId: { not: null } } : {}),
      ...(categoryId ? { OR: [{ isCore: true }, { categoryId }] } : {}),
    },
    include: {
      section: true,
      lovItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  return NextResponse.json(attributes);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const attribute = await prisma.attributeDefinition.create({ data: { ...body, isCore: false } });
  return NextResponse.json(attribute, { status: 201 });
}
