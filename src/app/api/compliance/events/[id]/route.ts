import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const EVENT_INCLUDE = {
  type: true,
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  products: {
    include: {
      product: {
        select: {
          id: true, partNumber: true, itemName: true, brand: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const event = await prisma.complianceEvent.findUnique({ where: { id }, include: EVENT_INCLUDE });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(event);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { title, description, notes, severity, status, dueDate, resolvedAt, addProductIds, removeProductIds } = body;

  const event = await prisma.complianceEvent.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description }),
      ...(notes !== undefined && { notes }),
      ...(severity !== undefined && { severity }),
      ...(status !== undefined && { status }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
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

  return NextResponse.json(event);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.complianceEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
