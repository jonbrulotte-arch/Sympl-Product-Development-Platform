import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { PSIR_INCLUDE } from "../route";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const psir = await prisma.psir.findUnique({ where: { id }, include: PSIR_INCLUDE });
  if (!psir) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(psir);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const {
    title, referenceNumber, inspectionDate, inspector, inspectionCompany,
    factory, countryOfOrigin, result, status, notes,
    addProductIds, removeProductIds, attributeValues,
  } = body;

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
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Remove uploaded files from disk
  const docs = await prisma.psirDocument.findMany({ where: { psirId: id } });
  const { unlink } = await import("fs/promises");
  const path = await import("path");
  await Promise.allSettled(
    docs.map((d: { filePath: string }) => unlink(path.join(process.cwd(), "public", d.filePath)))
  );

  await prisma.psir.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
