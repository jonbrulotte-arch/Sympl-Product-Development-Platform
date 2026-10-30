import { NextRequest, NextResponse } from "next/server";
import type { CategoryRequestStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { EDITABLE_BY_REQUESTER, notifyRequester, notifyReviewers, REQUEST_INCLUDE, STATUS_LABELS, validateRequestBody } from "@/lib/category-requests";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  return prisma.categoryRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await load(id);
  const isReviewer = await can(session.user.role, "categories:review_requests");
  if (!r || (!isReviewer && r.requestedById !== session.user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const history = await prisma.activityLog.findMany({
    where: { entityType: "CategoryRequest", entityId: id },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ ...r, history });
}

const REVIEW_ACTIONS: Record<string, CategoryRequestStatus> = {
  approve: "APPROVED",
  reject: "REJECTED",
  needs_info: "NEEDS_INFO",
  complete: "COMPLETED",
  reopen: "PENDING",
};
const ACTION_LOG = { APPROVED: "APPROVED", REJECTED: "REJECTED", NEEDS_INFO: "STATUS_CHANGED", COMPLETED: "STATUS_CHANGED", PENDING: "STATUS_CHANGED" } as const;

// body.action present → reviewer decision; otherwise → requester edit/resubmit.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await load(id);
  const isReviewer = await can(session.user.role, "categories:review_requests");
  if (!existing || (!isReviewer && existing.requestedById !== session.user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));

  if (typeof body.action === "string") {
    if (!isReviewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const status = REVIEW_ACTIONS[body.action];
    if (!status) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 5000) : null;
    if ((status === "REJECTED" || status === "NEEDS_INFO") && !note) {
      return NextResponse.json({ error: "Please add a note explaining the decision" }, { status: 400 });
    }
    let createdCategoryId: string | null | undefined = undefined;
    if (status === "COMPLETED" && typeof body.createdCategoryId === "string" && body.createdCategoryId) {
      if (!(await prisma.category.findUnique({ where: { id: body.createdCategoryId }, select: { id: true } }))) {
        return NextResponse.json({ error: "Category not found" }, { status: 400 });
      }
      createdCategoryId = body.createdCategoryId;
    }
    const updated = await prisma.categoryRequest.update({
      where: { id },
      data: { status, reviewNote: note ?? existing.reviewNote, reviewedById: session.user.id, reviewedAt: new Date(), ...(createdCategoryId !== undefined ? { createdCategoryId } : {}) },
      include: REQUEST_INCLUDE,
    });
    await logActivity({
      userId: session.user.id, action: ACTION_LOG[status], entityType: "CategoryRequest", entityId: id,
      fieldKey: "status", oldValue: STATUS_LABELS[existing.status], newValue: STATUS_LABELS[status],
      source: "Category Requests", metadata: note ? { note } : undefined,
    }).catch(() => {});
    if (existing.requestedById !== session.user.id) {
      await notifyRequester(updated, session.user.name ?? session.user.email ?? "A reviewer");
    }
    return NextResponse.json(updated);
  }

  // Requester edit: only while open; resubmits to PENDING.
  if (existing.requestedById !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!EDITABLE_BY_REQUESTER.includes(existing.status)) {
    return NextResponse.json({ error: "This request has already been decided and can't be edited" }, { status: 409 });
  }
  const parsed = await validateRequestBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status ?? 400 });
  const wasNeedsInfo = existing.status === "NEEDS_INFO";
  const updated = await prisma.categoryRequest.update({
    where: { id },
    data: { ...parsed.data, status: "PENDING" },
    include: REQUEST_INCLUDE,
  });
  await logActivity({
    userId: session.user.id, action: wasNeedsInfo ? "SUBMITTED" : "UPDATED", entityType: "CategoryRequest", entityId: id,
    newValue: wasNeedsInfo ? "Resubmitted" : "Edited", source: "Category Requests",
  }).catch(() => {});
  if (wasNeedsInfo) await notifyReviewers(updated, "resubmitted", session.user.id);
  return NextResponse.json(updated);
}

// Requester withdraws a request that hasn't been decided yet.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.categoryRequest.findUnique({ where: { id } });
  if (!existing || existing.requestedById !== session.user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!EDITABLE_BY_REQUESTER.includes(existing.status)) {
    return NextResponse.json({ error: "Only open requests can be withdrawn" }, { status: 409 });
  }
  await prisma.categoryRequest.delete({ where: { id } });
  await logActivity({
    userId: session.user.id, action: "DELETED", entityType: "CategoryRequest", entityId: id,
    oldValue: existing.name, newValue: "Withdrawn", source: "Category Requests",
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
