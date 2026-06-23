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

  const { userId, role, canEdit, canApprove } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: {
      projectId,
      userId,
      role: role ?? "VIEWER",
      canEdit: canEdit ?? false,
      canApprove: canApprove ?? false,
    },
    update: {
      role: role ?? "VIEWER",
      canEdit: canEdit ?? false,
      canApprove: canApprove ?? false,
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true, role: true } },
    },
  });

  return NextResponse.json(member, { status: 201 });
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

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await prisma.projectMember.deleteMany({ where: { projectId, userId } });
  return NextResponse.json({ success: true });
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

  const { userId, role, canEdit, canApprove } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (role !== undefined) data.role = role;
  if (canEdit !== undefined) data.canEdit = canEdit;
  if (canApprove !== undefined) data.canApprove = canApprove;

  const member = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data,
    include: {
      user: { select: { id: true, name: true, email: true, image: true, role: true } },
    },
  });

  return NextResponse.json(member);
}
