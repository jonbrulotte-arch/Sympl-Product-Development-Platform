import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Returns PSIRs that contain at least one product belonging to this project.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const productIds = (
    await prisma.productRecord.findMany({
      where: { projectId, isArchived: false },
      select: { id: true },
    })
  ).map((p) => p.id);

  if (!productIds.length) return NextResponse.json([]);

  const psirs = await prisma.psir.findMany({
    where: {
      products: { some: { productId: { in: productIds } } },
    },
    select: {
      id: true,
      title: true,
      referenceNumber: true,
      result: true,
      status: true,
      products: {
        where: { productId: { in: productIds } },
        include: {
          product: { select: { id: true, partNumber: true, itemName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(psirs);
}
