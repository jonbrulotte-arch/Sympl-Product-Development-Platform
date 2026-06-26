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
  const body = await req.json();

  // Whitelist known fields and use relation syntax for FK fields
  const {
    label, description, attributeType, requirement, maxValues, sortOrder,
    categoryId, sectionId, isActive, isCore,
    salsifyEnabled, salsifyPropertyId, salsifyLocale,
    defaultValue, unit, validationRules,
  } = body;

  const updated = await prisma.attributeDefinition.update({
    where: { id },
    data: {
      ...(label !== undefined && { label }),
      ...(description !== undefined && { description }),
      ...(attributeType !== undefined && { attributeType }),
      ...(requirement !== undefined && { requirement }),
      ...(maxValues !== undefined && { maxValues: Number(maxValues) }),
      ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      ...(isActive !== undefined && { isActive }),
      ...(isCore !== undefined && { isCore }),
      ...(salsifyEnabled !== undefined && { salsifyEnabled }),
      ...(salsifyPropertyId !== undefined && { salsifyPropertyId: salsifyPropertyId || null }),
      ...(salsifyLocale !== undefined && { salsifyLocale: salsifyLocale || null }),
      ...(defaultValue !== undefined && { defaultValue: defaultValue || null }),
      ...(unit !== undefined && { unit: unit || null }),
      ...(validationRules !== undefined && { validationRules }),
      // Use relation connect/disconnect syntax for FK fields
      ...(categoryId !== undefined && {
        category: categoryId ? { connect: { id: categoryId } } : { disconnect: true },
      }),
      ...(sectionId !== undefined && {
        section: sectionId ? { connect: { id: sectionId } } : { disconnect: true },
      }),
    },
    include: { lovItems: { orderBy: { sortOrder: "asc" } }, section: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.attributeDefinition.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
