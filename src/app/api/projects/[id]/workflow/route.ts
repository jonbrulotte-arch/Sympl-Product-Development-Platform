import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditProject } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { sendMail, workflowVoteEmail, stageCompletedEmail, stageAssignedEmail } from "@/lib/email";
import { createNotification, createNotificationForMany } from "@/lib/notifications";
import type { ProjectStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES = ["PENDING","IN_REVIEW","APPROVED","REJECTED","SKIPPED"];

const STAGE_INCLUDE = {
  approvals: {
    include: {
      approver: { select: { id: true, name: true, email: true, image: true, role: true } },
    },
  },
  dependsOnStage: { select: { id: true, name: true, status: true } },
  complianceEvent: { select: { id: true, title: true, status: true, type: { select: { name: true, color: true } } } },
  psir: { select: { id: true, title: true, result: true, referenceNumber: true } },
} as const;

// A stage is blocked when its dependency stage is not yet approved/skipped
function isDependencyBlocked(depStage: { status: string } | null) {
  if (!depStage) return false;
  return depStage.status !== "APPROVED" && depStage.status !== "SKIPPED";
}

// A stage is compliance-blocked when its linked compliance event is not RESOLVED, CLOSED, or WAIVED
function isComplianceBlocked(event: { status: string } | null) {
  if (!event) return false;
  return !["RESOLVED", "CLOSED", "WAIVED"].includes(event.status);
}

// A stage is PSIR-blocked when the linked inspection result is not PASS or CONDITIONAL
function isPsirBlocked(psir: { result: string } | null) {
  if (!psir) return false;
  return !["PASS", "CONDITIONAL"].includes(psir.result);
}

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
      include: {
        stageTemplates: {
          orderBy: { sortOrder: "asc" },
          include: { defaultAssignees: { select: { userId: true } }, dependsOnStageTemplate: true },
        },
      },
    });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const existingCount = await prisma.workflowStage.count({ where: { projectId } });
    // Pass 1: create all stages (without dependencies)
    const createdStages = await Promise.all(
      template.stageTemplates.map(async (st, i) =>
        prisma.workflowStage.create({
          data: {
            projectId,
            name: st.name,
            description: st.description,
            sortOrder: existingCount + i,
            isRequired: st.isRequired,
            onApproveSetStatus: st.onApproveSetStatus ?? null,
            onRejectSetStatus: st.onRejectSetStatus ?? null,
          },
          include: STAGE_INCLUDE,
        })
      )
    );
    // Build template stageId → real stageId map
    const templateToReal = new Map<string, string>();
    template.stageTemplates.forEach((st, i) => templateToReal.set(st.id, createdStages[i].id));
    // Pass 2: wire dependencies and assignees
    const stages = await Promise.all(
      template.stageTemplates.map(async (st, i) => {
        const stage = createdStages[i];
        const updates: Promise<unknown>[] = [];
        if (st.dependsOnStageTemplateId && templateToReal.has(st.dependsOnStageTemplateId)) {
          updates.push(prisma.workflowStage.update({
            where: { id: stage.id },
            data: { dependsOnStageId: templateToReal.get(st.dependsOnStageTemplateId) },
          }));
        }
        if (st.defaultAssignees.length > 0) {
          updates.push(prisma.workflowApproval.createMany({
            data: st.defaultAssignees.map((a) => ({
              stageId: stage.id,
              approverId: a.userId,
              status: "PENDING",
            })),
            skipDuplicates: true,
          }));
        }
        await Promise.all(updates);
        if (updates.length > 0) {
          return prisma.workflowStage.findUnique({ where: { id: stage.id }, include: STAGE_INCLUDE })!;
        }
        return stage;
      })
    );
    for (const s of stages) {
      if (!s) continue;
      logActivity({ userId: session.user.id, action: "CREATED", entityType: "WorkflowStage", entityId: s.id, projectId, newValue: s.name }).catch(() => {});
    }
    return NextResponse.json(stages, { status: 201 });
  }

  const { name, description, sortOrder, onApproveSetStatus, onRejectSetStatus, dependsOnStageId, complianceEventId, psirId, dueDate } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const stage = await prisma.workflowStage.create({
    data: {
      projectId,
      name: name.trim(),
      description: description?.trim() || null,
      sortOrder: sortOrder ?? 0,
      onApproveSetStatus: (onApproveSetStatus as ProjectStatus) || null,
      onRejectSetStatus: (onRejectSetStatus as ProjectStatus) || null,
      dependsOnStageId: dependsOnStageId || null,
      complianceEventId: complianceEventId || null,
      psirId: psirId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
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
  // Bulk reorder — accepts { reorder: [{ id, sortOrder }, ...] }
  if (body.reorder && Array.isArray(body.reorder)) {
    await Promise.all(
      (body.reorder as { id: string; sortOrder: number }[]).map(({ id, sortOrder }) =>
        prisma.workflowStage.update({ where: { id }, data: { sortOrder } })
      )
    );
    return NextResponse.json({ success: true });
  }

  const { stageId, status, name, description, onApproveSetStatus, onRejectSetStatus, dependsOnStageId, complianceEventId, psirId, dueDate, vote, voteComment, reset } = body;
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

    // Enforce dependency and compliance gates before allowing votes
    const stageForVote = await prisma.workflowStage.findUnique({
      where: { id: stageId },
      select: {
        dependsOnStage: { select: { id: true, name: true, status: true } },
        complianceEvent: { select: { id: true, title: true, status: true } },
        psir: { select: { id: true, title: true, result: true } },
      },
    });
    if (stageForVote && isDependencyBlocked(stageForVote.dependsOnStage)) {
      return NextResponse.json({
        error: `This stage depends on "${stageForVote.dependsOnStage!.name}" which has not been approved yet.`,
      }, { status: 409 });
    }
    if (stageForVote && isComplianceBlocked(stageForVote.complianceEvent)) {
      return NextResponse.json({
        error: `This stage requires compliance event "${stageForVote.complianceEvent!.title}" to be resolved before voting.`,
      }, { status: 409 });
    }
    if (stageForVote && isPsirBlocked(stageForVote.psir)) {
      return NextResponse.json({
        error: `This stage requires inspection "${stageForVote.psir!.title}" to have a passing result before voting.`,
      }, { status: 409 });
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

    // Notifications — fire-and-forget (email + in-app)
    const voterName = session.user.name ?? session.user.email ?? "Someone";
    const otherApprovers = stage.approvals
      .map((a: { approver: { id: string; email: string; name: string | null } }) => a.approver)
      .filter((a: { id: string }) => a.id !== session.user.id);

    // Notify other approvers of this vote
    for (const approver of otherApprovers) {
      sendMail(
        approver.email,
        `${voterName} ${vote === "APPROVED" ? "approved" : "rejected"} "${stage.name}"`,
        workflowVoteEmail({ toName: approver.name ?? approver.email, projectName: project.name, stageName: stage.name, voterName, vote: vote as "APPROVED" | "REJECTED", comment: voteComment, projectId })
      ).catch(() => {});
      createNotification({
        userId: approver.id,
        title: `${voterName} ${vote === "APPROVED" ? "approved" : "rejected"} "${stage.name}"`,
        message: `In project ${project.name}${voteComment ? `: "${voteComment}"` : ""}`,
        type: vote === "APPROVED" ? "success" : "error",
        link: `/projects/${projectId}`,
        projectId,
      });
    }

    // If stage is now fully completed, notify all project members
    if (newStageStatus === "APPROVED" || newStageStatus === "REJECTED") {
      const members = await prisma.projectMember.findMany({
        where: { projectId },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      const memberUserIds = members.map((m) => m.user.id);
      for (const m of members) {
        sendMail(
          m.user.email,
          `Workflow stage ${newStageStatus === "APPROVED" ? "approved" : "rejected"}: ${stage.name}`,
          stageCompletedEmail({ projectName: project.name, stageName: stage.name, result: newStageStatus as "APPROVED" | "REJECTED", projectId })
        ).catch(() => {});
      }
      createNotificationForMany(memberUserIds, {
        title: `Stage ${newStageStatus === "APPROVED" ? "approved" : "rejected"}: ${stage.name}`,
        message: `All approvers have voted in project ${project.name}`,
        type: newStageStatus === "APPROVED" ? "success" : "error",
        link: `/projects/${projectId}`,
        projectId,
      });
    }

    return NextResponse.json(stage);
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Dependency/compliance gates only apply when finalizing (APPROVED/REJECTED/SKIPPED),
  // not when simply opening a stage for review (IN_REVIEW)
  if (status && ["APPROVED", "REJECTED", "SKIPPED"].includes(status)) {
    const stageForStatus = await prisma.workflowStage.findUnique({
      where: { id: stageId },
      select: {
        dependsOnStage: { select: { id: true, name: true, status: true } },
        complianceEvent: { select: { id: true, title: true, status: true } },
        psir: { select: { id: true, title: true, result: true } },
      },
    });
    if (stageForStatus && isDependencyBlocked(stageForStatus.dependsOnStage)) {
      return NextResponse.json({
        error: `This stage depends on "${stageForStatus.dependsOnStage!.name}" which has not been approved yet.`,
      }, { status: 409 });
    }
    if (stageForStatus && isComplianceBlocked(stageForStatus.complianceEvent)) {
      return NextResponse.json({
        error: `This stage requires compliance event "${stageForStatus.complianceEvent!.title}" to be resolved before it can proceed.`,
      }, { status: 409 });
    }
    if (stageForStatus && isPsirBlocked(stageForStatus.psir)) {
      return NextResponse.json({
        error: `This stage requires inspection "${stageForStatus.psir!.title}" to have a passing result before it can proceed.`,
      }, { status: 409 });
    }
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
  if (dependsOnStageId !== undefined) data.dependsOnStageId = dependsOnStageId || null;
  if (complianceEventId !== undefined) data.complianceEventId = complianceEventId || null;
  if (psirId !== undefined) data.psirId = psirId || null;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

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
