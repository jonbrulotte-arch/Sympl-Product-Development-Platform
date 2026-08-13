import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkProjectAccess } from "@/lib/project-access";
import { deleteUploadFile, parseCommentAttachments } from "@/lib/uploads";
import { createNotificationForMany } from "@/lib/notifications";

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

  // Notify the project owner and members (except the author) — fire and forget.
  // Users called out with @Name or @email get a distinct "mentioned you"
  // notification instead of the generic one.
  (async () => {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        ownerId: true,
        members: { select: { user: { select: { id: true, name: true, email: true } } } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!project) return;

    const team = [project.owner, ...project.members.map((m) => m.user)];
    const body = content.trim().replace(/<!--attachments:.*?-->/s, "");
    const bodyLower = body.toLowerCase();

    // A user counts as mentioned when the comment contains @ immediately
    // followed by their full name, first name, or email prefix — and the
    // character after the match is a word boundary, so "@Jon 2" doesn't
    // fire "@jon" for a different Jon and "@joe" doesn't hit "@joeseph".
    const firstNameCounts = new Map<string, number>();
    for (const u of team) {
      const first = u.name?.toLowerCase().split(" ")[0];
      if (first) firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1);
    }

    const matchAt = (needle: string) => {
      let from = 0;
      while (from < bodyLower.length) {
        const at = bodyLower.indexOf(`@${needle}`, from);
        if (at === -1) return false;
        const tail = bodyLower.charAt(at + 1 + needle.length);
        // A word char after the match means this is a longer token — keep looking.
        if (!tail || !/[a-z0-9_.-]/.test(tail)) return true;
        from = at + 1;
      }
      return false;
    };

    const mentionedIds = new Set<string>();
    for (const u of team) {
      if (u.id === session.user.id) continue;
      const fullName = u.name?.toLowerCase();
      const firstName = fullName?.split(" ")[0];
      const emailPrefix = u.email.toLowerCase().split("@")[0];
      const candidates: string[] = [];
      if (fullName && fullName.length >= 2) candidates.push(fullName);
      // Skip the first-name candidate when it's ambiguous across the team —
      // "@Jon" shouldn't notify both Jons; the author has to be specific.
      if (firstName && firstName.length >= 2 && (firstNameCounts.get(firstName) ?? 0) <= 1) {
        candidates.push(firstName);
      }
      if (emailPrefix.length >= 2) candidates.push(emailPrefix);
      if (candidates.some(matchAt)) mentionedIds.add(u.id);
    }

    const preview = body.slice(0, 120);
    const author = session.user.name ?? session.user.email;

    if (mentionedIds.size > 0) {
      await createNotificationForMany([...mentionedIds], {
        title: `${author} mentioned you on ${project.name}`,
        message: preview,
        type: "info",
        category: "MENTION",
        link: `/projects/${projectId}?tab=comments`,
        projectId,
      });
    }

    const recipients = [...new Set(team.map((u) => u.id))]
      .filter((uid) => uid !== session.user.id && !mentionedIds.has(uid));
    await createNotificationForMany(recipients, {
      title: `New comment on ${project.name}`,
      message: `${author}: ${preview}`,
      type: "info",
      category: "COMMENT",
      link: `/projects/${projectId}?tab=comments`,
      projectId,
    });
  })().catch(() => {});

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
  const attachmentPaths = parseCommentAttachments(comment.content);
  if (attachmentPaths.length > 0) {
    const results = await Promise.all(attachmentPaths.map((p) => deleteUploadFile(p)));
    const removed = results.filter(Boolean).length;
    console.log(`[uploads] comment ${commentId} delete: removed ${removed}/${attachmentPaths.length} attachment(s)`);
  }

  await prisma.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ success: true });
}
