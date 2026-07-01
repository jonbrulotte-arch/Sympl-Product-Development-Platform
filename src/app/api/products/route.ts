import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findDuplicatesForProducts } from "@/lib/duplicate-check";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = 50;

  const search = searchParams.get("search")?.trim() ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const brand = searchParams.get("brand") ?? "";
  const inventoryStatus = searchParams.get("inventoryStatus") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";

  const userId = session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  const where = {
    isArchived: false,
    // Non-admins can only see products from projects they belong to
    ...(!isAdmin
      ? {
          project: {
            OR: [
              { ownerId: userId },
              { members: { some: { userId } } },
            ],
          },
        }
      : {}),
    ...(projectId ? { projectId } : {}),
    ...(brand ? { brand } : {}),
    ...(inventoryStatus ? {
      OR: [
        { inventoryStatus: { contains: inventoryStatus, mode: "insensitive" as const } },
        { inventoryStatusErp: { contains: inventoryStatus, mode: "insensitive" as const } },
      ],
    } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(search
      ? {
          OR: [
            { partNumber: { contains: search, mode: "insensitive" as const } },
            { modelNumber: { contains: search, mode: "insensitive" as const } },
            { itemName: { contains: search, mode: "insensitive" as const } },
            { brand: { contains: search, mode: "insensitive" as const } },
            { upc: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [products, total] = await Promise.all([
    prisma.productRecord.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, status: true, brand: true } },
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        attributeValues: { include: { attributeDefinition: { select: { key: true, label: true } } } },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.productRecord.count({ where }),
  ]);

  const dupes = await findDuplicatesForProducts(
    products.map((p) => ({ id: p.id, partNumber: p.partNumber, projectId: p.projectId }))
  );
  const withDupes = products.map((p) => ({ ...p, duplicateOf: dupes.get(p.id) ?? null }));

  return NextResponse.json({
    data: JSON.parse(JSON.stringify(withDupes)),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
