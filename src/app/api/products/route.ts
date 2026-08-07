import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findDuplicatesForProducts } from "@/lib/duplicate-check";
import { authenticateApiToken } from "@/lib/api-tokens";
import { seesAllProjects } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await auth();

  // External integrations (ERP/BI) may authenticate with a read-only
  // "spt_" API token instead of a session — grants read access to all
  // products, same as an admin session, but nothing else.
  let tokenAccess = false;
  if (!session?.user?.id) {
    tokenAccess = !!(await authenticateApiToken(req, "read:products"));
    if (!tokenAccess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = 50;

  const search = searchParams.get("search")?.trim() ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const brand = searchParams.get("brand") ?? "";
  const inventoryStatus = searchParams.get("inventoryStatus") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";

  const userId = session?.user?.id ?? "";
  const isAdmin = tokenAccess || seesAllProjects(session?.user?.role);

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

  // The browser renders ~12 fields, but `include` pulled all ~60 columns of
  // ProductRecord — every Decimal dimension included — which then had to be
  // JSON round-tripped to serialize. Sessions get a lean select; API-token
  // consumers (ERP/BI) keep the full record, since that is the documented
  // contract and trimming it would break them silently.
  const browserSelect = {
        id: true,
        projectId: true,
        partNumber: true,
        modelNumber: true,
        itemName: true,
        brand: true,
        upc: true,
        inventoryStatus: true,
        inventoryStatusErp: true,
        packSize: true,
        material: true,
        size: true,
        htsCode: true,
        updatedAt: true,
        project: { select: { id: true, name: true, status: true, brand: true } },
        category: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
        attributeValues: {
          select: {
            textValue: true,
            attributeDefinition: { select: { key: true, label: true } },
          },
        },
  } as const;

  const tokenInclude = {
    project: { select: { id: true, name: true, status: true, brand: true } },
    category: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true, email: true } },
    updatedBy: { select: { id: true, name: true, email: true } },
    attributeValues: { include: { attributeDefinition: { select: { key: true, label: true } } } },
  } as const;

  const [products, total] = await Promise.all([
    tokenAccess
      ? prisma.productRecord.findMany({
          where,
          include: tokenInclude,
          orderBy: [{ updatedAt: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        })
      : prisma.productRecord.findMany({
          where,
          select: browserSelect,
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
    // Decimal columns only reach the payload on the token path.
    data: tokenAccess ? JSON.parse(JSON.stringify(withDupes)) : withDupes,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
