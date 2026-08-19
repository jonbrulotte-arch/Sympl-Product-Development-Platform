import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { PSIR_INCLUDE } from "../route";

import { createNotificationForMany, getOwnerIdsForProducts } from "@/lib/notifications";
import { requireInspectionsEnabled } from "@/lib/app-config";
import { can, seesAllProjects } from "@/lib/permissions";
import { checkProjectAccess } from "@/lib/project-access";

/** Check whether the session user can access the projects linked to a PSIR. */
async function verifyPsirAccess(
  psir: { products: { product: { project: { id: string } | null } }[] },
  session: { user: { id: string; role?: string | null } },
  level: "view" | "edit",
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (seesAllProjects(session.user.role)) return { ok: true };
  const projectIds = [...new Set(psir.products.map((p) => p.product.project?.id).filter(Boolean))] as string[];
  if (projectIds.length === 0) return { ok: true };
  for (const projectId of projectIds) {
    const access = await checkProjectAccess(projectId, session as Parameters<typeof checkProjectAccess>[1], level);
    if (access.ok) return { ok: true };
  }
  return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabled = await requireInspectionsEnabled();
  if (disabled) return disabled;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const psir = await prisma.psir.findUnique({ where: { id }, include: PSIR_INCLUDE });
  if (!psir) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await verifyPsirAccess(psir, session, "view");
  if (!access.ok) return access.response;
  return NextResponse.json(psir);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabled = await requireInspectionsEnabled();
  if (disabled) return disabled;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.role, "inspections:manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify project access before allowing mutation
  const existing = await prisma.psir.findUnique({ where: { id }, include: { products: { include: { product: { select: { project: { select: { id: true } } } } } } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await verifyPsirAccess(existing, session, "edit");
  if (!access.ok) return access.response;

  const body = await req.json();

  const {
    title, referenceNumber, inspectionDate, inspector, inspectionCompany,
    factory, countryOfOrigin, result, status, notes,
    addProductIds, removeProductIds, attributeValues,
  } = body;

  const previous = (status !== undefined || result !== undefined)
    ? await prisma.psir.findUnique({ where: { id }, select: { status: true, result: true, title: true } })
    : null;

  await prisma.psir.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(referenceNumber !== undefined && { referenceNumber: referenceNumber || null }),
      ...(inspectionDate !== undefined && { inspectionDate: inspectionDate ? new Date(inspectionDate) : null }),
      ...(inspector !== undefined && { inspector: inspector || null }),
      ...(inspectionCompany !== undefined && { inspectionCompany: inspectionCompany || null }),
      ...(factory !== undefined && { factory: factory || null }),
      ...(countryOfOrigin !== undefined && { countryOfOrigin: countryOfOrigin || null }),
      ...(result !== undefined && { result }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes: notes || null }),
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
        products: { deleteMany: { productId: { in: removeProductIds as string[] } } },
      }),
    },
  });

  // Upsert custom attribute values
  if (attributeValues?.length) {
    await Promise.all(
      (attributeValues as { attrDefId: string; value: string }[]).map((av) =>
        prisma.psirAttributeValue.upsert({
          where: { psirId_attrDefId: { psirId: id, attrDefId: av.attrDefId } },
          create: { psirId: id, attrDefId: av.attrDefId, value: av.value },
          update: { value: av.value },
        })
      )
    );
  }

  const updated = await prisma.psir.findUnique({ where: { id }, include: PSIR_INCLUDE });

  // Notify affected project owners on status or result changes
  if (updated && previous && (
    (status !== undefined && previous.status !== status) ||
    (result !== undefined && previous.result !== result)
  )) {
    (async () => {
      const ownerIds = (await getOwnerIdsForProducts(updated.products.map((p) => p.product.id)))
        .filter((uid) => uid !== session.user.id);
      const changes: string[] = [];
      if (status !== undefined && previous.status !== status) changes.push(`status ${previous.status} → ${status}`);
      if (result !== undefined && previous.result !== result) changes.push(`result ${previous.result} → ${result}`);
      await createNotificationForMany(ownerIds, {
        title: `Inspection updated: ${updated.title}`,
        message: `${session.user.name ?? session.user.email} changed ${changes.join(", ")}.`,
        type: result === "FAIL" || status === "REJECTED" ? "error" : "info",
        category: "INSPECTION",
        link: `/psir/${id}`,
      });
    })().catch(() => {});
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabled = await requireInspectionsEnabled();
  if (disabled) return disabled;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.role, "inspections:manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify project access before allowing deletion
  const existing = await prisma.psir.findUnique({ where: { id }, include: { products: { include: { product: { select: { project: { select: { id: true } } } } } } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await verifyPsirAccess(existing, session, "edit");
  if (!access.ok) return access.response;

  // Remove uploaded files from disk
  const docs = await prisma.psirDocument.findMany({ where: { psirId: id } });
  const { deleteUploadFile } = await import("@/lib/uploads");
  await Promise.allSettled(docs.map((d: { filePath: string }) => deleteUploadFile(d.filePath)));

  await prisma.psir.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
