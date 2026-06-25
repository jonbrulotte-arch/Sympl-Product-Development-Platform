import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20");
  const search = searchParams.get("search");
  const archived = searchParams.get("archived") === "true";

  const searchOR = search
    ? [
        { name: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
        { brand: { contains: search, mode: "insensitive" as const } },
        { retailer: { contains: search, mode: "insensitive" as const } },
        { channel: { contains: search, mode: "insensitive" as const } },
        { owner: { name: { contains: search, mode: "insensitive" as const } } },
        { owner: { email: { contains: search, mode: "insensitive" as const } } },
        { members: { some: { user: { name: { contains: search, mode: "insensitive" as const } } } } },
        { products: { some: { isArchived: false, OR: [
          { partNumber: { contains: search, mode: "insensitive" as const } },
          { modelNumber: { contains: search, mode: "insensitive" as const } },
          { itemName: { contains: search, mode: "insensitive" as const } },
          { upc: { contains: search, mode: "insensitive" as const } },
          { brand: { contains: search, mode: "insensitive" as const } },
        ]}}},
      ]
    : null;

  const accessOR = session.user.role !== "ADMIN"
    ? [{ ownerId: session.user.id }, { members: { some: { userId: session.user.id } } }]
    : null;

  const where = {
    isArchived: archived,
    ...(status ? { status: status as never } : {}),
    ...(searchOR ? { OR: searchOR } : {}),
    ...(accessOR ? { AND: [{ OR: accessOR }] } : {}),
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true, image: true, role: true } },
        category: true,
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true, role: true } },
          },
        },
        _count: { select: { products: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  return NextResponse.json({
    data: projects,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { targetLaunchDate, ...rest } = parsed.data;

  const project = await prisma.project.create({
    data: {
      ...rest,
      targetLaunchDate: targetLaunchDate ? new Date(targetLaunchDate) : undefined,
      ownerId: session.user.id,
    },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true, role: true } },
      category: true,
      _count: { select: { products: true } },
    },
  });

  await logActivity({
    userId: session.user.id,
    action: "CREATED",
    entityType: "Project",
    entityId: project.id,
    projectId: project.id,
    newValue: project.name,
  });

  // Update user preferences
  await prisma.userPreferences.upsert({
    where: { userId: session.user.id },
    update: { lastOpenedProjectId: project.id },
    create: { userId: session.user.id, lastOpenedProjectId: project.id },
  });

  return NextResponse.json(project, { status: 201 });
}
