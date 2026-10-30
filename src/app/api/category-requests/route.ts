import { NextRequest, NextResponse } from "next/server";
import type { CategoryRequestStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { notifyReviewers, REQUEST_INCLUDE, STATUS_LABELS, validateRequestBody } from "@/lib/category-requests";

// Reviewers see every request; everyone else sees only their own.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isReviewer = await can(session.user.role, "categories:review_requests");
  if (!isReviewer && !(await can(session.user.role, "categories:request"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") as CategoryRequestStatus | null;
  const mine = sp.get("mine") === "true" || !isReviewer;
  const requests = await prisma.categoryRequest.findMany({
    where: {
      ...(mine ? { requestedById: session.user.id } : {}),
      ...(status && status in STATUS_LABELS ? { status } : {}),
    },
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json(requests);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.role, "categories:request"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = await validateRequestBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status ?? 400 });

  const created = await prisma.categoryRequest.create({
    data: { ...parsed.data, requestedById: session.user.id },
    include: REQUEST_INCLUDE,
  });
  await logActivity({
    userId: session.user.id, action: "SUBMITTED", entityType: "CategoryRequest", entityId: created.id,
    newValue: created.name, source: "Category Requests",
  }).catch(() => {});
  await notifyReviewers(created, "submitted", session.user.id);
  return NextResponse.json(created, { status: 201 });
}
