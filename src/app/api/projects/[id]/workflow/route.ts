import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditProject } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES = ["PENDING","IN_REVIEW","APPROVED","REJECTED","SKIPPED"];

const STAGE_INCLUDE = {
  approvals: {
    include: {
      approver: { select: { id: true, name: true, email: true, image: true, role: true } },
    },
  },
} as const;

// Ensure pending schema migrations are applied inline — no-op if already present
async function ensureWorkflowStageColumns() {
  await prisma.$executeRaw`ALTER TABLE "WorkflowStage" ADD COLUMN IF NOT EXISTS "onApproveSetStatus" "ProjectStatus"`.catch(() => {});
  await prisma.$executeRaw`ALTER TABLE "WorkflowStage" ADD COLUMN IF NOT EXISTS "onRejectSetStatus" "ProjectStatus"`.catch(() => {});
}

// Fetch the trigger fields via raw SQL and merge into a stage object.
// Prisma's generated client doesn't include onApproveSetStatus/onRejectSetStatus yet.
async function withTriggerFields<T extends object>(stage: T, stageId: string): Promise<T & { onApproveSetStatus: string | null; onRejectSetStatus: string | null }> {
  const rows = await prisma.$queryRaw<{ onApproveSetStatus: string | null; onRejectSetStatus: string | null }[]>`
    SELECT "onApproveSetStatus", "onRejectSetStatus" FROM "WorkflowStage" WHERE id = ${stageId}
  `;
  return { ...stage, ...(rows[0] ?? { onApproveSetStatus: null, onRejectSetStatus: null }) };
}

// Set onApproveSetStatus and/or onRejectSetStatus via raw SQL
async function setTriggerFields(stageId: string, onApprove: string | null | undefined, onReject: string | null | undefined) {
  if (onApprove !== undefined) {
    if (onApprove) {
      await prisma.$executeRaw`UPDATE "WorkflowStage" SET "onApproveSetStatus" = ${onApprove}::"ProjectStatus" WHERE id = ${stageId}`;
    } else {
      await prisma.$executeRaw`UPDATE "WorkflowStage" SET "onApproveSetStatus" = NULL WHERE id = ${stageId}`;
    }
  }
  if (onReject !== undefined) {
    if (onReject) {
      await prisma.$executeRaw`UPDATE "WorkflowStage" SET "onRejectSetStatus" = ${onReject}::"ProjectStatus" WHERE id = ${stageId}`;
    } else {
      await prisma.$executeRaw`UPDATE "WorkflowStage" SET "onRejectSetStatus" = NULL WHERE id = ${stageId}`;
    }
  }
}

async function maybeAutoUpdateProject(projectId: string, newStatus: string | null) {
  if (!newStatus) return;
  await prisma.project.update({
    where: { id: projectId },
    data: { status: newStatus as never },
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
    return NextResponse.json(stages, { status: 201 });
  }

  const { name, description, sortOrder, onApproveSetStatus, onRejectSetStatus } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  await ensureWorkflowStageColumns();

  // Create stage without trigger fields (not in Prisma schema), then set via raw SQL
  const stage = await prisma.workflowStage.create({
    data: {
      projectId,
      name: name.trim(),
      description: description?.trim() || null,
      sortOrder: sortOrder ?? 0,
    },
    include: STAGE_INCLUDE,
  });

  if (onApproveSetStatus || onRejectSetStatus) {
    await setTriggerFields(stage.id, onApproveSetStatus || null, onRejectSetStatus || null);
  }

  return NextResponse.json(await withTriggerFields(stage, stage.id), { status: 201 });
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
      where: { id: stageId, projectId },
      data: { status: "PENDING", completedAt: null },
      include: STAGE_INCLUDE,
    });
    return NextResponse.json(await withTriggerFields(stage, stageId));
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
      where: { id: stageId, projectId },
      data: {
        status: newStageStatus as never,
        completedAt: ["APPROVED", "REJECTED"].includes(newStageStatus) ? new Date() : null,
      },
      include: STAGE_INCLUDE,
    });

    const stageWithTriggers = await withTriggerFields(stage, stageId);
    if (newStageStatus === "APPROVED") {
      await maybeAutoUpdateProject(projectId, stageWithTriggers.onApproveSetStatus);
    } else if (newStageStatus === "REJECTED") {
      await maybeAutoUpdateProject(projectId, stageWithTriggers.onRejectSetStatus);
    }

    return NextResponse.json(stageWithTriggers);
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Handle trigger fields via raw SQL; keep only schema fields in data
  if (onApproveSetStatus !== undefined || onRejectSetStatus !== undefined) {
    await ensureWorkflowStageColumns();
    await setTriggerFields(stageId, onApproveSetStatus, onRejectSetStatus);
  }

  const data: Record<string, unknown> = {};
  if (status) {
    data.status = status;
    data.completedAt = ["APPROVED", "REJECTED", "SKIPPED"].includes(status) ? new Date() : null;
  }
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description || null;

  let stage;
  if (Object.keys(data).length > 0) {
    stage = await prisma.workflowStage.update({
      where: { id: stageId, projectId },
      data,
      include: STAGE_INCLUDE,
    });
  } else {
    stage = await prisma.workflowStage.findUnique({ where: { id: stageId }, include: STAGE_INCLUDE });
    if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });
  }

  const stageWithTriggers = await withTriggerFields(stage, stageId);
  if (status === "APPROVED") {
    await maybeAutoUpdateProject(projectId, stageWithTriggers.onApproveSetStatus);
  } else if (status === "REJECTED") {
    await maybeAutoUpdateProject(projectId, stageWithTriggers.onRejectSetStatus);
  }

  return NextResponse.json(stageWithTriggers);
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

  await prisma.workflowStage.delete({ where: { id: stageId, projectId } });
  return NextResponse.json({ success: true });
}
