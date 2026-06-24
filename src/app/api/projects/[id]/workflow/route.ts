import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditProject } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import type { ProjectStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES = ["PENDING","IN_REVIEW","APPROVED","REJECTED","SKIPPED"];

const STAGE_INCLUDE = {
  approvals: {
    include: {
      approver: { select: { id: true, name: true, email: true, image: true, role: true } },
    },
  },
} as const;

async function maybeAutoUpdateProject(projectId: string, newStatus: string | null) {
  if (!newStatus) return;
  await prisma.project.update({
    where: { id: projectId },
    data: { status: newStatus as ProjectStatus },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { members: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditProject(session.user.role as never, session.user.id, project)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Apply a workflow template — creates all its stages in bulk
  if (body.applyTemplateId) {
    const template = await prisma.workflowTemplate.findUnique({
      where: { id: body.applyTemplateId },
      include: { stageTemplates: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const existingCount = await prisma.workflowStage.count({ where: { projectId } });
    const stages = await Promise.all(
      template.stageTemplates.map((st, i) =>
        prisma.workflowStage.create({
          data: {
            projectId,
            name: st.name,
            description: st.description,
            sortOrder: existingCount + i,
            isRequired: st.isRequired,
          },
          include: STAGE_INCLUDE,
        })
      )
    );
    for (const s of stages) {
      logActivity({ userId: session.user.id, action: "CREATED", entityType: "WorkflowStage", entityId: s.id, projectId, newValue: s.name }).catch(() => {});
    }
    return NextResponse.json(stages, { status: 201 });
  }

  const { name, description, sortOrder, onApproveSetStatus, onRejectSetStatus } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const stage = await prisma.workflowStage.create({
    data: {
      projectId,
      name: name.trim(),
      description: description?.trim() || null,
      sortOrder: sortOrder ?? 0,
      onApproveSetStatus: (onApproveSetStatus as ProjectStatus) || null,
      onRejectSetStatus: (onRejectSetStatus as ProjectStatus) || null,
    },
    include: STAGE_INCLUDE,
  });

  logActivity({ userId: session.user.id, action: "CREATED", entityType: "WorkflowStage", entityId: stage.id, projectId, newValue: stage.name }).catch(() => {});

  return NextResponse.json(stage, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { members: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditProject(session.user.role as never, session.user.id, project)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { stageId, status, name, description, onApproveSetStatus, onRejectSetStatus, vote, voteComment, reset } = body;
  if (!stageId) return NextResponse.json({ error: "stageId required" }, { status: 400 });

  // Reset vote — clears stage back to PENDING and resets all approvals to PENDING
  if (reset) {
    await prisma.workflowApproval.updateMany({
      where: { stageId },
      data: { status: "PENDING", comments: null, reviewedAt: null },
    });
    const stage = await prisma.workflowStage.update({
      where: { id: stageId },
      data: { status: "PENDING", completedAt: null },
      include: STAGE_INCLUDE,
    });
    logActivity({ userId: session.user.id, action: "STATUS_CHANGED", entityType: "WorkflowStage", entityId: stageId, projectId, fieldKey: "status", oldValue: "previous", newValue: "PENDING", metadata: { stageName: stage.name, reset: true } }).catch(() => {});
    return NextResponse.json(stage);
  }

  // Individual approver vote — unanimous logic
  if (vote) {
    if (!["APPROVED", "REJECTED"].includes(vote)) {
      return NextResponse.json({ error: "vote must be APPROVED or REJECTED" }, { status: 400 });
    }

    const approval = await prisma.workflowApproval.findUnique({
      where: { stageId_approverId: { stageId, approverId: session.user.id } },
    });
    if (!approval) return NextResponse.json({ error: "You are not assigned as an approver for this stage" }, { status: 403 });

    await prisma.workflowApproval.update({
      where: { id: approval.id },
      data: { status: vote, comments: voteComment ?? null, reviewedAt: new Date() },
    });

    // Recompute stage status: any REJECTED → stage REJECTED; all APPROVED → stage APPROVED
    const allApprovals = await prisma.workflowApproval.findMany({ where: { stageId } });
    let newStageStatus = "IN_REVIEW";
    if (allApprovals.some((a) => a.status === "REJECTED")) {
      newStageStatus = "REJECTED";
    } else if (allApprovals.length > 0 && allApprovals.every((a) => a.status === "APPROVED")) {
      newStageStatus = "APPROVED";
    }

    const stage = await prisma.workflowStage.update({
      where: { id: stageId },
      data: {
        status: newStageStatus as never,
        completedAt: ["APPROVED", "REJECTED"].includes(newStageStatus) ? new Date() : null,
      },
      include: STAGE_INCLUDE,
    });

    logActivity({
      userId: session.user.id,
      action: vote === "APPROVED" ? "APPROVED" : "REJECTED",
      entityType: "WorkflowStage",
      entityId: stageId,
      projectId,
      fieldKey: "approval",
      newValue: vote,
      metadata: { stageName: stage.name, comment: voteComment ?? null, stageStatus: newStageStatus },
    }).catch(() => {});

    if (newStageStatus === "APPROVED") {
      await maybeAutoUpdateProject(projectId, stage.onApproveSetStatus);
    } else if (newStageStatus === "REJECTED") {
      await maybeAutoUpdateProject(projectId, stage.onRejectSetStatus);
    }

    return NextResponse.json(stage);
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (status) {
    data.status = status;
    data.completedAt = ["APPROVED", "REJECTED", "SKIPPED"].includes(status) ? new Date() : null;
  }
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description || null;
  if (onApproveSetStatus !== undefined) data.onApproveSetStatus = (onApproveSetStatus as ProjectStatus) || null;
  if (onRejectSetStatus !== undefined) data.onRejectSetStatus = (onRejectSetStatus as ProjectStatus) || null;

  // projectId ownership already verified above; update only by id (projectId is not unique)
  const stage = Object.keys(data).length > 0
    ? await prisma.workflowStage.update({ where: { id: stageId }, data, include: STAGE_INCLUDE })
    : await prisma.workflowStage.findUnique({ where: { id: stageId }, include: STAGE_INCLUDE });

  if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

  if (status) {
    logActivity({ userId: session.user.id, action: "STATUS_CHANGED", entityType: "WorkflowStage", entityId: stageId, projectId, fieldKey: "status", newValue: status, metadata: { stageName: stage.name } }).catch(() => {});
  }
  if (name !== undefined) {
    logActivity({ userId: session.user.id, action: "UPDATED", entityType: "WorkflowStage", entityId: stageId, projectId, fieldKey: "name", newValue: name, metadata: { stageName: stage.name } }).catch(() => {});
  }

  if (status === "APPROVED") {
    await maybeAutoUpdateProject(projectId, stage.onApproveSetStatus);
  } else if (status === "REJECTED") {
    await maybeAutoUpdateProject(projectId, stage.onRejectSetStatus);
  }

  return NextResponse.json(stage);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { members: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditProject(session.user.role as never, session.user.id, project)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { stageId } = await req.json();
  if (!stageId) return NextResponse.json({ error: "stageId required" }, { status: 400 });

  const deleted = await prisma.workflowStage.findUnique({ where: { id: stageId }, select: { name: true } });
  await prisma.workflowStage.delete({ where: { id: stageId } });
  logActivity({ userId: session.user.id, action: "DELETED", entityType: "WorkflowStage", entityId: stageId, projectId, oldValue: deleted?.name ?? undefined }).catch(() => {});
  return NextResponse.json({ success: true });
}
