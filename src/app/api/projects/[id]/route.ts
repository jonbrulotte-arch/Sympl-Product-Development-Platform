import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectSchema } from "@/lib/validation";
import { canEditProject, canDeleteProject } from "@/lib/permissions";
import { checkProjectAccess } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";
import { projectStatusEmail } from "@/lib/email";
import { createNotificationForMany } from "@/lib/notifications";
import { deleteUploadFile, parseCommentAttachments } from "@/lib/uploads";

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
      _count: { select: { products: { where: { isArchived: false } } } },
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
  const access = await checkProjectAccess(id, session, "view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

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

  const { targetLaunchDate, ownerId, ...rest } = parsed.data;

  // Only admins may reassign the project owner
  if (ownerId && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can reassign project ownership" }, { status: 403 });
  }
  if (ownerId) {
    const newOwner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!newOwner) return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...rest,
      ...(ownerId ? { ownerId } : {}),
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
      _count: { select: { products: { where: { isArchived: false } } } },
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

  // Notify project members when status changes
  if (rest.status && rest.status !== project.status) {
    const changedBy = session.user.name ?? session.user.email ?? "Someone";
    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, email: true } } },
    });
    function fmtStatus(s: string) { return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
    createNotificationForMany(members.map((m) => m.user.id), {
      title: `${updated.name} status changed`,
      message: `${changedBy} changed the status from ${fmtStatus(project.status)} to ${fmtStatus(rest.status)}`,
      type: "info",
      category: "WORKFLOW",
      link: `/projects/${id}`,
      projectId: id,
      emailHtml: projectStatusEmail({ projectName: updated.name, oldStatus: project.status, newStatus: rest.status, changedBy, projectId: id }),
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
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

  const hard = new URL(req.url).searchParams.get("hard") === "true";

  if (hard) {
    // Hard delete — admins only, permanently removes the project and all related data
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can permanently delete projects" }, { status: 403 });
    }

    // Comment rows cascade with the project, so collect their attachment paths
    // first — once the rows are gone the files on disk are unreachable.
    // Product comments carry projectId too, but match on either to also catch
    // rows written before projectId was always set.
    const comments = await prisma.comment.findMany({
      where: { OR: [{ projectId: id }, { product: { projectId: id } }] },
      select: { content: true },
    });
    const attachmentPaths = [...new Set(comments.flatMap((c) => parseCommentAttachments(c.content)))];

    await prisma.project.delete({ where: { id } });

    // Only after the rows are gone, so a failed delete never orphans live files.
    if (attachmentPaths.length > 0) {
      const results = await Promise.all(attachmentPaths.map((p) => deleteUploadFile(p)));
      const removed = results.filter(Boolean).length;
      console.log(`[uploads] project ${id} hard-delete: removed ${removed}/${attachmentPaths.length} comment attachment(s)`);
    }
    await logActivity({
      userId: session.user.id,
      action: "DELETED",
      entityType: "Project",
      entityId: id,
      newValue: project.name,
    });
    return NextResponse.json({ success: true });
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
