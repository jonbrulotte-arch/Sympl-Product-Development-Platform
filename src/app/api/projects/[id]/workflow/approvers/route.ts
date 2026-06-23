import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditProject } from "@/lib/permissions";

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

  // Use raw SQL to verify stage belongs to project — avoids issues with pending schema migrations
  const stageRows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "WorkflowStage" WHERE id = ${stageId} AND "projectId" = ${projectId} LIMIT 1`;
  if (!stageRows.length) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

  // Upsert so re-assigning a removed approver doesn't error
  const approval = await prisma.workflowApproval.upsert({
    where: { stageId_approverId: { stageId, approverId: userId } },
    create: { stageId, approverId: userId, status: "PENDING" },
    update: { status: "PENDING", comments: null, reviewedAt: null },
    include: { approver: { select: { id: true, name: true, email: true, image: true, role: true } } },
  });

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
