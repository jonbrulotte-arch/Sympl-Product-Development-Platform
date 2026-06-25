import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PsirDetailClient } from "./psir-detail-client";

export default async function PsirDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const [psir, attrDefs] = await Promise.all([
    prisma.psir.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        documents: {
          orderBy: { createdAt: "desc" },
          include: { uploadedBy: { select: { id: true, name: true, email: true } } },
        },
        products: {
          include: {
            product: {
              select: {
                id: true, partNumber: true, itemName: true, brand: true, upc: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
        },
        attributeValues: {
          include: { attrDef: true },
          orderBy: { attrDef: { sortOrder: "asc" } },
        },
      },
    }),
    prisma.psirAttributeDefinition.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!psir) notFound();

  const serialized = JSON.parse(JSON.stringify({ psir, attrDefs }));
  return <PsirDetailClient psir={serialized.psir} attrDefs={serialized.attrDefs} />;
}
