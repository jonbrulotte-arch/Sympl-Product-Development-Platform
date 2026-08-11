import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createNotificationForMany } from "@/lib/notifications";

// Bulk project ownership transfer — for handing a departing manager's
// portfolio to someone else. Reassigning ownership is already admin-only on
// the single-project route; this is the same operation applied to a set.

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "projects:transfer_ownership"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ownerId = req.nextUrl.searchParams.get("ownerId") ?? undefined;
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";

  const [projects, owners] = await Promise.all([
    prisma.project.findMany({
      where: {
        ...(ownerId ? { ownerId } : {}),
        ...(includeArchived ? {} : { isArchived: false }),
      },
      select: {
        id: true,
        name: true,
        status: true,
        brand: true,
        isArchived: true,
        updatedAt: true,
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { products: { where: { isArchived: false } } } },
      },
      orderBy: [{ owner: { name: "asc" } }, { name: "asc" }],
    }),
    // Everyone who currently owns at least one project, for the "from" picker.
    prisma.user.findMany({
      where: { ownedProjects: { some: {} } },
      select: {
        id: true, name: true, email: true, role: true, isActive: true,
        _count: { select: { ownedProjects: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Roles that can meaningfully own a project — a Viewer as owner would hold
  // rights their role can't otherwise exercise.
  const eligible = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "DIRECTOR", "PRODUCT_MANAGER"] } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ projects, owners, eligibleOwners: eligible });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "projects:transfer_ownership"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const projectIds: string[] = Array.isArray(body.projectIds) ? body.projectIds : [];
  const newOwnerId: string = body.newOwnerId ?? "";
  const keepAsMember: boolean = body.keepAsMember !== false;

  if (projectIds.length === 0) {
    return NextResponse.json({ error: "Select at least one project" }, { status: 400 });
  }
  if (!newOwnerId) {
    return NextResponse.json({ error: "Select a new owner" }, { status: 400 });
  }

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

    // The new owner may already be a member; ownership supersedes it, but a
    // stale membership row with canEdit:false would be confusing to read.
    await tx.projectMember.deleteMany({
      where: { projectId: { in: toTransfer.map((p) => p.id) }, userId: newOwnerId },
    });

    // Keep the outgoing owner on the project so history and access survive the
    // handover; skipped when the caller asks for a clean break.
    if (keepAsMember) {
      await tx.projectMember.createMany({
        data: toTransfer.map((p) => ({
          projectId: p.id,
          userId: p.ownerId,
          role: "PRODUCT_MANAGER",
          canEdit: true,
          canApprove: false,
        })),
        skipDuplicates: true,
      });
    }
  });

  for (const p of toTransfer) {
    logActivity({
      userId: session.user.id,
      action: "UPDATED",
      entityType: "Project",
      entityId: p.id,
      projectId: p.id,
      fieldKey: "ownerId",
      oldValue: p.owner.name ?? p.owner.email,
      newValue: newOwner.name ?? newOwner.email,
      source: "Admin → Transfer Ownership",
    }).catch(() => {});
  }

  if (toTransfer.length > 0) {
    await createNotificationForMany([newOwnerId], {
      title: "Projects transferred to you",
      message: `${session.user.name ?? session.user.email} made you the owner of ${toTransfer.length} project${toTransfer.length !== 1 ? "s" : ""}.`,
      type: "info",
      category: "ASSIGNMENT",
      link: "/projects",
    });
    await createNotificationForMany(previousOwnerIds, {
      title: "Project ownership reassigned",
      message: `${toTransfer.length} of your project${toTransfer.length !== 1 ? "s were" : " was"} transferred to ${newOwner.name ?? newOwner.email}.${keepAsMember ? " You remain a member with edit access." : ""}`,
      type: "info",
      category: "ASSIGNMENT",
      link: "/projects",
    });
  }

  return NextResponse.json({
    transferred: toTransfer.length,
    skipped: projects.length - toTransfer.length,
    newOwner: { id: newOwner.id, name: newOwner.name, email: newOwner.email },
  });
}
