import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/psir-api";

type Ctx = { params: Promise<{ partNumber: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const s = await requireAnyPermission("psir_generator:use");
  if (s instanceof NextResponse) return s;
  const { partNumber } = await params;
  const product = await prisma.psirSavedProduct.findUnique({
    where: { partNumber: decodeURIComponent(partNumber) },
    include: { category: { select: { id: true, name: true, parentId: true } } },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await requireAnyPermission("psir_generator:use");
  if (s instanceof NextResponse) return s;
  const { partNumber } = await params;
  await prisma.psirSavedProduct.deleteMany({ where: { partNumber: decodeURIComponent(partNumber) } });
  return NextResponse.json({ ok: true });
}
