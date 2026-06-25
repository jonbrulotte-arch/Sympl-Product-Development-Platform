import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditProject } from "@/lib/permissions";
import { sendMail, stageAssignedEmail } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { members: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditProject(session.user.role as never, session.user.id, project)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { stageId, userId } = await req.json();
  if (!stageId || !userId) return NextResponse.json({ error: "stageId and userId required" }, { status: 400 });

  const stage = await prisma.workflowStage.findFirst({ where: { id: stageId, projectId }, select: { id: true } });
  if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

  const stageName = await prisma.workflowStage.findUnique({ where: { id: stageId }, select: { name: true } });

  // Upsert so re-assigning a removed approver doesn't error
  const approval = await prisma.workflowApproval.upsert({
    where: { stageId_approverId: { stageId, approverId: userId } },
    create: { stageId, approverId: userId, status: "PENDING" },
    update: { status: "PENDING", comments: null, reviewedAt: null },
    include: { approver: { select: { id: true, name: true, email: true, image: true, role: true } } },
  });

  // Notify the newly assigned approver
  sendMail(
    approval.approver.email,
    `You've been assigned as an approver on "${stageName?.name ?? "a workflow stage"}"`,
    stageAssignedEmail({ toName: approval.approver.name ?? approval.approver.email, projectName: project.name, stageName: stageName?.name ?? "a workflow stage", projectId })
  ).catch(() => {});

  return NextResponse.json(approval, { status: 201 });
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

  const { stageId, userId } = await req.json();
  if (!stageId || !userId) return NextResponse.json({ error: "stageId and userId required" }, { status: 400 });

  await prisma.workflowApproval.deleteMany({ where: { stageId, approverId: userId } });
  return NextResponse.json({ success: true });
}
