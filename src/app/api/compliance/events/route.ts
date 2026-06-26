import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const EVENT_INCLUDE = {
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
  documents: {
    orderBy: { createdAt: "desc" as const },
    include: { uploadedBy: { select: { id: true, name: true, email: true } } },
  },
} as const;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");
  const typeId = searchParams.get("typeId");
  const search = searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = 20;

  const where = {
    ...(productId && { products: { some: { productId } } }),
    ...(projectId && { products: { some: { product: { projectId } } } }),
    ...(status && { status }),
    ...(typeId && { typeId }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
        { products: { some: { product: { partNumber: { contains: search, mode: "insensitive" as const } } } } },
        { products: { some: { product: { itemName: { contains: search, mode: "insensitive" as const } } } } },
      ],
    }),
  };

  const [events, total] = await Promise.all([
    prisma.complianceEvent.findMany({
      where,
      include: EVENT_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.complianceEvent.count({ where }),
  ]);

  return NextResponse.json({ events, total, page, pageSize });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { typeId, title, description, notes, severity, dueDate, productIds } = body;

  if (!typeId || !title?.trim()) {
    return NextResponse.json({ error: "typeId and title are required" }, { status: 400 });
  }
  if (!productIds?.length) {
    return NextResponse.json({ error: "At least one product is required" }, { status: 400 });
  }

  const event = await prisma.complianceEvent.create({
    data: {
      typeId,
      title: title.trim(),
      description,
      notes,
      severity: severity ?? "MEDIUM",
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: session.user.id,
      products: {
        create: (productIds as string[]).map((productId) => ({ productId })),
      },
    },
    include: EVENT_INCLUDE,
  });

  return NextResponse.json(event, { status: 201 });
}
