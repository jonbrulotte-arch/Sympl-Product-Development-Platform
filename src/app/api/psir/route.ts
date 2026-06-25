import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const PSIR_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  documents: {
    orderBy: { createdAt: "desc" as const },
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
    orderBy: { attrDef: { sortOrder: "asc" as const } },
  },
} as const;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  const status = searchParams.get("status");
  const result = searchParams.get("result");
  const search = searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = 20;

  const where = {
    ...(productId && { products: { some: { productId } } }),
    ...(status && { status }),
    ...(result && { result }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" as const } },
        { referenceNumber: { contains: search, mode: "insensitive" as const } },
        { inspector: { contains: search, mode: "insensitive" as const } },
        { inspectionCompany: { contains: search, mode: "insensitive" as const } },
        { factory: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [psirs, total] = await Promise.all([
    prisma.psir.findMany({
      where,
      include: PSIR_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.psir.count({ where }),
  ]);

  return NextResponse.json({ psirs, total, page, pageSize });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    title, referenceNumber, inspectionDate, inspector, inspectionCompany,
    factory, countryOfOrigin, result, status, notes, productIds, attributeValues,
  } = body;

  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const psir = await prisma.psir.create({
    data: {
      title: title.trim(),
      referenceNumber: referenceNumber || null,
      inspectionDate: inspectionDate ? new Date(inspectionDate) : null,
      inspector: inspector || null,
      inspectionCompany: inspectionCompany || null,
      factory: factory || null,
      countryOfOrigin: countryOfOrigin || null,
      result: result ?? "PENDING",
      status: status ?? "DRAFT",
      notes: notes || null,
      createdById: session.user.id,
      ...(productIds?.length && {
        products: { create: (productIds as string[]).map((productId) => ({ productId })) },
      }),
      ...(attributeValues?.length && {
        attributeValues: {
          create: (attributeValues as { attrDefId: string; value: string }[]).map((av) => ({
            attrDefId: av.attrDefId, value: av.value,
          })),
        },
      }),
    },
    include: PSIR_INCLUDE,
  });

  return NextResponse.json(psir, { status: 201 });
}
