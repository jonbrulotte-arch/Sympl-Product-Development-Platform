import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectSchema } from "@/lib/validation";
import { canEditProject, canDeleteProject } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { sendMail, projectStatusEmail } from "@/lib/email";

async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true, role: true } },
      category: true,
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true, role: true } },
        },
      },
      workflowStages: {
        include: {
          approvals: {
            include: {
              approver: { select: { id: true, name: true, email: true, image: true, role: true } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { products: true } },
    },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Track recent project
  await prisma.userPreferences.upsert({
    where: { userId: session.user.id },
    update: {
      lastOpenedProjectId: id,
      recentProjectIds: {
        set: [id, ...(await prisma.userPreferences.findUnique({
          where: { userId: session.user.id },
          select: { recentProjectIds: true }
        }))?.recentProjectIds.filter(pid => pid !== id).slice(0, 9) ?? []],
      },
    },
    create: { userId: session.user.id, lastOpenedProjectId: id, recentProjectIds: [id] },
  });

  return NextResponse.json(project);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { members: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canEditProject(session.user.role as never, session.user.id, project)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = projectSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { targetLaunchDate, ...rest } = parsed.data;

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...rest,
      ...(targetLaunchDate !== undefined
        ? { targetLaunchDate: targetLaunchDate ? new Date(targetLaunchDate) : null }
        : {}),
    },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true, role: true } },
      category: true,
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true, role: true } },
        },
      },
      _count: { select: { products: true } },
    },
  });

  await logActivity({
    userId: session.user.id,
    action: "UPDATED",
    entityType: "Project",
    entityId: id,
    projectId: id,
    metadata: rest,
  });

  // Email project members when status changes
  if (rest.status && rest.status !== project.status) {
    const changedBy = session.user.name ?? session.user.email ?? "Someone";
    const memberEmails = await prisma.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { email: true } } },
    });
    for (const m of memberEmails) {
      sendMail(
        m.user.email,
        `Project status updated: ${updated.name}`,
        projectStatusEmail({ projectName: updated.name, oldStatus: project.status, newStatus: rest.status, changedBy, projectId: id })
      ).catch(() => {});
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canDeleteProject(session.user.role as never, session.user.id, project.ownerId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.project.update({ where: { id }, data: { isArchived: true } });

  await logActivity({
    userId: session.user.id,
    action: "ARCHIVED",
    entityType: "Project",
    entityId: id,
    projectId: id,
  });

  return NextResponse.json({ success: true });
}
