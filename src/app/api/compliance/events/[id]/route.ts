import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { EVENT_INCLUDE } from "../route";

import { createNotificationForMany, getOwnerIdsForProducts } from "@/lib/notifications";
import { can, seesAllProjects } from "@/lib/permissions";
import { checkProjectAccess } from "@/lib/project-access";

/** Check whether the session user can access the projects linked to an event. */
async function verifyEventAccess(
  event: { products: { product: { project: { id: string } | null } }[] },
  session: { user: { id: string; role?: string | null } },
  level: "view" | "edit",
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (seesAllProjects(session.user.role)) return { ok: true };
  const projectIds = [...new Set(event.products.map((p) => p.product.project?.id).filter(Boolean))] as string[];
  if (projectIds.length === 0) return { ok: true };
  for (const projectId of projectIds) {
    const access = await checkProjectAccess(projectId, session as Parameters<typeof checkProjectAccess>[1], level);
    if (access.ok) return { ok: true };
  }
  return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const event = await prisma.complianceEvent.findUnique({ where: { id }, include: EVENT_INCLUDE });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await verifyEventAccess(event, session, "view");
  if (!access.ok) return access.response;
  return NextResponse.json(event);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.role, "compliance:manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify project access before allowing mutation
  const existing = await prisma.complianceEvent.findUnique({ where: { id }, include: { products: { include: { product: { select: { project: { select: { id: true } } } } } } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await verifyEventAccess(existing, session, "edit");
  if (!access.ok) return access.response;

  const body = await req.json();
  const { title, description, notes, severity, status, dueDate, resolvedAt, addProductIds, removeProductIds, typeId } = body;

  const previous = status !== undefined
    ? await prisma.complianceEvent.findUnique({ where: { id }, select: { status: true, title: true } })
    : null;

  const event = await prisma.complianceEvent.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(typeId !== undefined && { typeId }),
      ...(description !== undefined && { description }),
      ...(notes !== undefined && { notes }),
      ...(severity !== undefined && { severity }),
      ...(status !== undefined && { status }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null, overdueNotifiedAt: null, dueSoonNotifiedAt: null }),
      ...(resolvedAt !== undefined && { resolvedAt: resolvedAt ? new Date(resolvedAt) : null }),
      updatedById: session.user.id,
      ...(addProductIds?.length && {
        products: {
          createMany: {
            data: (addProductIds as string[]).map((productId: string) => ({ productId })),
            skipDuplicates: true,
          },
        },
      }),
      ...(removeProductIds?.length && {
        products: {
          deleteMany: { productId: { in: removeProductIds as string[] } },
        },
      }),
    },
    include: EVENT_INCLUDE,
  });

  // Notify affected project owners on status changes
  if (previous && status !== undefined && previous.status !== status) {
    (async () => {
      const ownerIds = (await getOwnerIdsForProducts(event.products.map((p) => p.product.id)))
        .filter((uid) => uid !== session.user.id);
      await createNotificationForMany(ownerIds, {
        title: `Compliance event ${String(status).toLowerCase().replace("_", " ")}: ${event.title}`,
        message: `${session.user.name ?? session.user.email} changed the status from ${previous.status.replace("_", " ")} to ${String(status).replace("_", " ")}.`,
        type: ["RESOLVED", "CLOSED"].includes(String(status)) ? "success" : "info",
        category: "COMPLIANCE",
        link: "/compliance",
      });
    })().catch(() => {});
  }

  return NextResponse.json(event);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.role, "compliance:manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify project access before allowing deletion
  const existing = await prisma.complianceEvent.findUnique({ where: { id }, include: { products: { include: { product: { select: { project: { select: { id: true } } } } } } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await verifyEventAccess(existing, session, "edit");
  if (!access.ok) return access.response;

  const docs = await prisma.complianceDocument.findMany({ where: { eventId: id } });
  const { deleteUploadFile } = await import("@/lib/uploads");
  await Promise.allSettled(docs.map((d: { filePath: string }) => deleteUploadFile(d.filePath)));

  await prisma.complianceEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
