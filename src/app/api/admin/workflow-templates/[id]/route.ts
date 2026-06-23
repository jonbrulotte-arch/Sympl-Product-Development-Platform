import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { name, description, isDefault, isActive, addStage, updateStage, deleteStageId } = body;

  if (addStage) {
    const count = await prisma.workflowStageTemplate.count({ where: { workflowTemplateId: id } });
    const stage = await prisma.workflowStageTemplate.create({
      data: {
        workflowTemplateId: id,
        name: addStage.name.trim(),
        description: addStage.description?.trim() || null,
        sortOrder: count,
        isRequired: addStage.isRequired ?? true,
      },
    });
    return NextResponse.json(stage, { status: 201 });
  }

  if (updateStage) {
    const stage = await prisma.workflowStageTemplate.update({
      where: { id: updateStage.id },
      data: {
        name: updateStage.name?.trim(),
        description: updateStage.description?.trim() || null,
        sortOrder: updateStage.sortOrder,
        isRequired: updateStage.isRequired,
      },
    });
    return NextResponse.json(stage);
  }

  if (deleteStageId) {
    await prisma.workflowStageTemplate.delete({ where: { id: deleteStageId } });
    return NextResponse.json({ success: true });
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name.trim();
  if (description !== undefined) data.description = description?.trim() || null;
  if (isActive !== undefined) data.isActive = isActive;
  if (isDefault !== undefined) {
    if (isDefault) await prisma.workflowTemplate.updateMany({ data: { isDefault: false } });
    data.isDefault = isDefault;
  }

  const template = await prisma.workflowTemplate.update({
    where: { id },
    data,
    include: { stageTemplates: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json(template);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.workflowTemplate.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
