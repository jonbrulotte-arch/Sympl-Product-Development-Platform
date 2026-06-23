import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const templates = await prisma.workflowTemplate.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { stageTemplates: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, description, isDefault } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  if (isDefault) {
    await prisma.workflowTemplate.updateMany({ data: { isDefault: false } });
  }

  const template = await prisma.workflowTemplate.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      isDefault: isDefault ?? false,
    },
    include: { stageTemplates: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json(template, { status: 201 });
}
