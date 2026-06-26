import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:workflow_templates"))) return null;
  return session;
}

const STAGE_INCLUDE = {
  defaultAssignees: {
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const {
    name, description, isDefault, isActive,
    addStage, updateStage, deleteStageId,
    reorderStages,           // { stages: { id, sortOrder }[] }
    addAssignee,             // { stageTemplateId, userId }
    removeAssignee,          // { stageTemplateId, userId }
  } = body;

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
      include: STAGE_INCLUDE,
    });
    return NextResponse.json(stage, { status: 201 });
  }

  if (updateStage) {
    const stage = await prisma.workflowStageTemplate.update({
      where: { id: updateStage.id },
      data: {
        ...(updateStage.name !== undefined && { name: updateStage.name.trim() }),
        ...(updateStage.description !== undefined && { description: updateStage.description?.trim() || null }),
        ...(updateStage.sortOrder !== undefined && { sortOrder: updateStage.sortOrder }),
        ...(updateStage.isRequired !== undefined && { isRequired: updateStage.isRequired }),
        ...(updateStage.onApproveSetStatus !== undefined && { onApproveSetStatus: updateStage.onApproveSetStatus || null }),
        ...(updateStage.onRejectSetStatus !== undefined && { onRejectSetStatus: updateStage.onRejectSetStatus || null }),
        ...(updateStage.dependsOnStageTemplateId !== undefined && { dependsOnStageTemplateId: updateStage.dependsOnStageTemplateId || null }),
      },
      include: STAGE_INCLUDE,
    });
    return NextResponse.json(stage);
  }

  if (deleteStageId) {
    await prisma.workflowStageTemplate.delete({ where: { id: deleteStageId } });
    return NextResponse.json({ success: true });
  }

  if (reorderStages) {
    await Promise.all(
      (reorderStages as { id: string; sortOrder: number }[]).map((s) =>
        prisma.workflowStageTemplate.update({
          where: { id: s.id },
          data: { sortOrder: s.sortOrder },
        })
      )
    );
    return NextResponse.json({ success: true });
  }

  if (addAssignee) {
    const assignee = await prisma.workflowStageTemplateAssignee.upsert({
      where: { stageTemplateId_userId: { stageTemplateId: addAssignee.stageTemplateId, userId: addAssignee.userId } },
      create: { stageTemplateId: addAssignee.stageTemplateId, userId: addAssignee.userId },
      update: {},
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    return NextResponse.json(assignee, { status: 201 });
  }

  if (removeAssignee) {
    await prisma.workflowStageTemplateAssignee.deleteMany({
      where: { stageTemplateId: removeAssignee.stageTemplateId, userId: removeAssignee.userId },
    });
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
    include: {
      stageTemplates: {
        orderBy: { sortOrder: "asc" },
        include: STAGE_INCLUDE,
      },
    },
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
