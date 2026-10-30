import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inProject, linkProduct, normalizePartNumber, withPrimaryProject } from "@/lib/product-catalog";
import { can } from "@/lib/permissions";
import { productSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { checkProjectAccess } from "@/lib/project-access";
import { authenticateApiToken } from "@/lib/api-tokens";

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


  const where = {
    isArchived: false,
    // The catalog is visible to everyone; project membership only governs editing.
    ...(projectId ? inProject(projectId) : {}),
    ...(brand ? { brand: { equals: brand, mode: "insensitive" as const } } : {}),
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
        projects: { where: { isArchived: false }, orderBy: { createdAt: "asc" }, select: { project: { select: { id: true, name: true, status: true, brand: true } } } },
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
    projects: { where: { isArchived: false }, orderBy: { createdAt: "asc" }, select: { project: { select: { id: true, name: true, status: true, brand: true } } } },
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

  const withDupes = withPrimaryProject(products.map((p) => ({ ...p, duplicateOf: null })));

  return NextResponse.json({
    // Decimal columns only reach the payload on the token path.
    data: tokenAccess ? JSON.parse(JSON.stringify(withDupes)) : withDupes,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

// Creates a standalone catalog product (no project). Optionally links it to a
// project the caller can edit.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.role, "products:edit_catalog"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { projectId, ...coreData } = body ?? {};
  const parsed = productSchema.safeParse(coreData);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

  const partNumber = normalizePartNumber(parsed.data.partNumber) ?? null;
  if (partNumber) {
    const clash = await prisma.productRecord.findUnique({ where: { partNumber }, select: { id: true, partNumber: true, itemName: true } });
    if (clash) return NextResponse.json({ error: "Part number already exists", existingProduct: clash }, { status: 409 });
  }
  if (typeof projectId === "string" && projectId) {
    const access = await checkProjectAccess(projectId, session, "edit");
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.productRecord.create({
      data: { ...parsed.data, partNumber, createdById: session.user.id, updatedById: session.user.id },
    });
    if (typeof projectId === "string" && projectId) await linkProduct(projectId, created.id, session.user.id, tx);
    return created;
  });
  await logActivity({
    userId: session.user.id, action: "CREATED", entityType: "ProductRecord", entityId: product.id,
    productId: product.id, projectId: typeof projectId === "string" && projectId ? projectId : undefined,
    newValue: product.partNumber ?? undefined, source: "Products",
  });
  return NextResponse.json(product, { status: 201 });
}
