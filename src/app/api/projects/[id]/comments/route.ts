import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

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
