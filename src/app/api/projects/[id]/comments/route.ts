import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkProjectAccess } from "@/lib/project-access";
import { deleteUploadFile } from "@/lib/uploads";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const access = await checkProjectAccess(projectId, session, "view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const comments = await prisma.comment.findMany({
    where: { projectId, parentId: null },
    include: {
      author: { select: { id: true, name: true, email: true, image: true, role: true } },
      replies: {
        include: {
          author: { select: { id: true, name: true, email: true, image: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(comments);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  // Commenting requires view access — Reviewers can comment but not edit products
  const access = await checkProjectAccess(projectId, session, "view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { content, productId, fieldKey, parentId } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const comment = await prisma.comment.create({
    data: {
      entityType: productId ? "PRODUCT" : "PROJECT",
      projectId,
      productId: productId ?? undefined,
      fieldKey: fieldKey ?? undefined,
      parentId: parentId ?? undefined,
      authorId: session.user.id,
      content: content.trim(),
    },
    include: {
      author: { select: { id: true, name: true, email: true, image: true, role: true } },
      replies: { include: { author: { select: { id: true, name: true, email: true, image: true, role: true } } } },
    },
  });

  return NextResponse.json(comment, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await params; // ensure params are resolved
  const { commentId } = await req.json();
  if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the author or an admin may delete
  const isAdmin = session.user.role === "ADMIN";
  if (comment.authorId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete any attached files stored on disk
  const attachMatch = comment.content.match(/<!--attachments:(\[.*?\])-->/s);
  if (attachMatch) {
    try {
      const attachments: { url: string }[] = JSON.parse(attachMatch[1]);
      for (const a of attachments) {
        if (a.url?.startsWith("/uploads/")) {
          await deleteUploadFile(a.url.slice(1)).catch(() => {});
        }
      }
    } catch { /* ignore parse errors */ }
  }

  await prisma.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ success: true });
}
