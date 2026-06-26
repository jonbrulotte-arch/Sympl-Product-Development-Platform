import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: attributeDefinitionId } = await params;
  const { value, label, sortOrder } = await req.json();

  if (!value || !label) {
    return NextResponse.json({ error: "value and label are required" }, { status: 400 });
  }

  const item = await prisma.lovItem.create({
    data: { attributeDefinitionId, value, label, sortOrder: sortOrder ?? 0 },
  });

  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: attributeDefinitionId } = await params;
  const { searchParams } = new URL(req.url);
  const lovId = searchParams.get("lovId");

  if (!lovId) return NextResponse.json({ error: "lovId required" }, { status: 400 });

  // Verify ownership
  const item = await prisma.lovItem.findFirst({ where: { id: lovId, attributeDefinitionId } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.lovItem.delete({ where: { id: lovId } });
  return NextResponse.json({ success: true });
}
