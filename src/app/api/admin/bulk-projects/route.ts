import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createNotificationForMany } from "@/lib/notifications";
import { parseCommentAttachments } from "@/lib/uploads";
import { deleteUploadFile } from "@/lib/uploads";
import type { ProjectStatus } from "@prisma/client";

// Bulk operations across a set of projects — transfer ownership, change
// status, or delete. Same permission gate as the old transfer-only page;
// hard delete stays admin-only to match the single-project DELETE route.

const PROJECT_STATUSES = [
  "DRAFT", "IN_PROGRESS", "NEEDS_REVIEW", "CHANGES_REQUESTED",
  "APPROVED", "EXPORT_READY", "ARCHIVED",
] as const satisfies readonly ProjectStatus[];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "projects:transfer_ownership"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ownerId = req.nextUrl.searchParams.get("ownerId") ?? undefined;
  const categoryId = req.nextUrl.searchParams.get("categoryId") ?? undefined;
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";

  const [projects, owners, categories] = await Promise.all([
    prisma.project.findMany({
      where: {
        ...(ownerId ? { ownerId } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(includeArchived ? {} : { isArchived: false }),
      },
      select: {
        id: true,
        name: true,
        status: true,
        brand: true,
        isArchived: true,
        updatedAt: true,
        categoryId: true,
        owner: { select: { id: true, name: true, email: true } },
        category: { select: { id: true, name: true } },
        _count: { select: { products: { where: { isArchived: false } } } },
      },
      orderBy: [{ owner: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { ownedProjects: { some: {} } },
      select: {
        id: true, name: true, email: true, role: true, isActive: true,
        _count: { select: { ownedProjects: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true, parentId: true },
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const eligible = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "DIRECTOR", "PRODUCT_MANAGER"] } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    projects,
    owners,
    eligibleOwners: eligible,
    categories,
    statuses: PROJECT_STATUSES,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "projects:transfer_ownership"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action: "transfer" | "status" | "delete" = body.action;
  const projectIds: string[] = Array.isArray(body.projectIds) ? body.projectIds : [];

  if (projectIds.length === 0) {
    return NextResponse.json({ error: "Select at least one project" }, { status: 400 });
  }

  if (action === "transfer") {
    return transfer(session, projectIds, body);
  }
  if (action === "status") {
    return updateStatus(session, projectIds, body);
  }
  if (action === "delete") {
    return bulkDelete(session, projectIds, body);
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

type Session = { user: { id: string; role?: string; name?: string | null; email?: string | null } };

async function transfer(
  session: Session,
  projectIds: string[],
  body: { newOwnerId?: string; keepAsMember?: boolean },
) {
  const newOwnerId = body.newOwnerId ?? "";
  const keepAsMember = body.keepAsMember !== false;
  if (!newOwnerId) return NextResponse.json({ error: "Select a new owner" }, { status: 400 });

  const newOwner = await prisma.user.findUnique({
    where: { id: newOwnerId },
    select: { id: true, name: true, email: true, isActive: true },
  });
  if (!newOwner) return NextResponse.json({ error: "New owner not found" }, { status: 404 });
  if (!newOwner.isActive) {
    return NextResponse.json({ error: "Cannot transfer projects to a deactivated account" }, { status: 400 });
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true, ownerId: true, owner: { select: { name: true, email: true } } },
  });
  if (projects.length !== projectIds.length) {
    return NextResponse.json({ error: "One or more projects no longer exist" }, { status: 404 });
  }

  const toTransfer = projects.filter((p) => p.ownerId !== newOwnerId);
  const previousOwnerIds = [...new Set(toTransfer.map((p) => p.ownerId))];

  await prisma.$transaction(async (tx) => {
    await tx.project.updateMany({
      where: { id: { in: toTransfer.map((p) => p.id) } },
      data: { ownerId: newOwnerId },
    });
    await tx.projectMember.deleteMany({
      where: { projectId: { in: toTransfer.map((p) => p.id) }, userId: newOwnerId },
    });
    if (keepAsMember) {
      await tx.projectMember.createMany({
        data: toTransfer.map((p) => ({
          projectId: p.id, userId: p.ownerId,
          role: "PRODUCT_MANAGER", canEdit: true, canApprove: false,
        })),
        skipDuplicates: true,
      });
    }
  });

  for (const p of toTransfer) {
    logActivity({
      userId: session.user.id, action: "UPDATED", entityType: "Project",
      entityId: p.id, projectId: p.id, fieldKey: "ownerId",
      oldValue: p.owner.name ?? p.owner.email,
      newValue: newOwner.name ?? newOwner.email,
      source: "Admin → Bulk Project Actions",
    }).catch(() => {});
  }

  if (toTransfer.length > 0) {
    await createNotificationForMany([newOwnerId], {
      title: "Projects transferred to you",
      message: `${session.user.name ?? session.user.email} made you the owner of ${toTransfer.length} project${toTransfer.length !== 1 ? "s" : ""}.`,
      type: "info", category: "ASSIGNMENT", link: "/projects",
    });
    await createNotificationForMany(previousOwnerIds, {
      title: "Project ownership reassigned",
      message: `${toTransfer.length} of your project${toTransfer.length !== 1 ? "s were" : " was"} transferred to ${newOwner.name ?? newOwner.email}.${keepAsMember ? " You remain a member with edit access." : ""}`,
      type: "info", category: "ASSIGNMENT", link: "/projects",
    });
  }

  return NextResponse.json({
    transferred: toTransfer.length,
    skipped: projects.length - toTransfer.length,
    newOwner: { id: newOwner.id, name: newOwner.name, email: newOwner.email },
  });
}

async function updateStatus(
  session: Session,
  projectIds: string[],
  body: { status?: string },
) {
  const status = body.status as ProjectStatus | undefined;
  if (!status || !PROJECT_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true, status: true, ownerId: true },
  });
  if (projects.length !== projectIds.length) {
    return NextResponse.json({ error: "One or more projects no longer exist" }, { status: 404 });
  }

  const toChange = projects.filter((p) => p.status !== status);
  const isArchive = status === "ARCHIVED";

  await prisma.project.updateMany({
    where: { id: { in: toChange.map((p) => p.id) } },
    data: { status, ...(isArchive ? { isArchived: true } : {}) },
  });

  for (const p of toChange) {
    logActivity({
      userId: session.user.id, action: "UPDATED", entityType: "Project",
      entityId: p.id, projectId: p.id, fieldKey: "status",
      oldValue: p.status, newValue: status,
      source: "Admin → Bulk Project Actions",
    }).catch(() => {});
  }

  const ownerIds = [...new Set(toChange.map((p) => p.ownerId))];
  if (toChange.length > 0) {
    await createNotificationForMany(ownerIds, {
      title: "Project status updated",
      message: `${session.user.name ?? session.user.email} set ${toChange.length} of your project${toChange.length !== 1 ? "s" : ""} to ${status.replace(/_/g, " ")}.`,
      type: "info", category: "GENERAL", link: "/projects",
    });
  }

  return NextResponse.json({
    updated: toChange.length,
    skipped: projects.length - toChange.length,
    status,
  });
}

async function bulkDelete(
  session: Session,
  projectIds: string[],
  body: { hard?: boolean },
) {
  const hard = body.hard === true;

  if (hard && session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only admins can permanently delete projects" },
      { status: 403 },
    );
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true },
  });
  if (projects.length !== projectIds.length) {
    return NextResponse.json({ error: "One or more projects no longer exist" }, { status: 404 });
  }

  if (!hard) {
    await prisma.project.updateMany({
      where: { id: { in: projectIds } },
      data: { isArchived: true },
    });
    for (const p of projects) {
      logActivity({
        userId: session.user.id, action: "ARCHIVED", entityType: "Project",
        entityId: p.id, projectId: p.id,
        source: "Admin → Bulk Project Actions",
      }).catch(() => {});
    }
    return NextResponse.json({ archived: projects.length });
  }

  // Hard delete — collect comment-attachment paths first so the files on disk
  // can be reaped after the rows are gone.
  const comments = await prisma.comment.findMany({
    where: {
      OR: [
        { projectId: { in: projectIds } },
        { product: { projectId: { in: projectIds } } },
      ],
    },
    select: { content: true },
  });
  const attachmentPaths = [
    ...new Set(comments.flatMap((c) => parseCommentAttachments(c.content))),
  ];

  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });

  if (attachmentPaths.length > 0) {
    await Promise.all(attachmentPaths.map((p) => deleteUploadFile(p)));
  }

  for (const p of projects) {
    logActivity({
      userId: session.user.id, action: "DELETED", entityType: "Project",
      entityId: p.id, newValue: p.name,
      source: "Admin → Bulk Project Actions",
    }).catch(() => {});
  }

  return NextResponse.json({ deleted: projects.length });
}
