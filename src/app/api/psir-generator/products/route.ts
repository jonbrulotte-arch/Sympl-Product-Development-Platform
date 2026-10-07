import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanTokens, requireAnyPermission, str } from "@/lib/psir-api";

export async function GET(req: Request) {
  const s = await requireAnyPermission("psir_generator:use");
  if (s instanceof NextResponse) return s;
  const search = new URL(req.url).searchParams.get("search")?.trim() ?? "";
  const products = await prisma.psirSavedProduct.findMany({
    where: search
      ? { OR: [
          { partNumber: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ] }
      : {},
    include: {
      category: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } },
      updatedBy: { select: { name: true, email: true } },
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return NextResponse.json(products);
}

// Upsert by part number.
export async function PUT(req: Request) {
  const s = await requireAnyPermission("psir_generator:use");
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => ({}));
  const partNumber = str(body.partNumber, 100);
  const categoryId = str(body.categoryId);
  if (!partNumber || !categoryId) {
    return NextResponse.json({ error: "Part number and category are required" }, { status: 400 });
  }
  if (!(await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }
  const data = { description: str(body.description, 500), categoryId, tokenValues: cleanTokens(body.tokenValues) };
  const product = await prisma.psirSavedProduct.upsert({
    where: { partNumber },
    update: { ...data, updatedById: s.user.id },
    create: { ...data, partNumber, createdById: s.user.id },
  });
  return NextResponse.json(product);
}
