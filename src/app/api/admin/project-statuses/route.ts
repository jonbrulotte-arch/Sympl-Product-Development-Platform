import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULTS = [
  { code: "DRAFT",              label: "Draft",               color: "gray",   sortOrder: 0, description: "Initial state — work in progress" },
  { code: "IN_PROGRESS",       label: "In Progress",         color: "blue",   sortOrder: 1, description: "Actively being worked on" },
  { code: "NEEDS_REVIEW",      label: "Needs Review",        color: "yellow", sortOrder: 2, description: "Ready for stakeholder review" },
  { code: "CHANGES_REQUESTED", label: "Changes Requested",   color: "orange", sortOrder: 3, description: "Reviewer requested revisions" },
  { code: "APPROVED",          label: "Approved",            color: "green",  sortOrder: 4, description: "All approvals obtained" },
  { code: "EXPORT_READY",      label: "Export Ready",        color: "purple", sortOrder: 5, description: "Data verified and ready for export" },
  { code: "ARCHIVED",          label: "Archived",            color: "gray",   sortOrder: 6, description: "Hidden from active projects list" },
];

const DEFAULT_CODES = new Set(DEFAULTS.map((d) => d.code));

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let configs: { code: string; label: string; color: string; description: string | null; sortOrder: number; isActive: boolean; id: string }[] = [];
  try {
    configs = await prisma.projectStatusConfig.findMany({ orderBy: { sortOrder: "asc" } });
  } catch {
    // Table may not exist yet — fall through to defaults
  }
  const configMap = new Map(configs.map((c) => [c.code, c]));

  // Merge DB records with hardcoded defaults so all built-in statuses always appear
  const merged = DEFAULTS.map((d) => configMap.get(d.code) ?? { id: null, ...d, isActive: true });

  // Also include any custom statuses (in DB but not in DEFAULTS), ordered by sortOrder
  const extras = configs.filter((c) => !DEFAULT_CODES.has(c.code));
  const all = [...merged, ...extras].sort((a, b) => a.sortOrder - b.sortOrder);

  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { code, label, color, description, sortOrder } = await req.json();
  if (!code?.trim() || !label?.trim()) {
    return NextResponse.json({ error: "code and label are required" }, { status: 400 });
  }

  const normalizedCode = String(code).trim().toUpperCase().replace(/\s+/g, "_");

  // Ensure table exists
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "ProjectStatusConfig" (
      "id"          TEXT      NOT NULL,
      "code"        TEXT      NOT NULL,
      "label"       TEXT      NOT NULL,
      "color"       TEXT      NOT NULL DEFAULT 'gray',
      "description" TEXT,
      "sortOrder"   INTEGER   NOT NULL DEFAULT 0,
      "isActive"    BOOLEAN   NOT NULL DEFAULT true,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProjectStatusConfig_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ProjectStatusConfig_code_key" UNIQUE ("code")
    )
  `.catch(() => {});

  // Check uniqueness
  const existing = await prisma.projectStatusConfig.findFirst({ where: { code: normalizedCode } }).catch(() => null);
  if (existing) {
    return NextResponse.json({ error: "A status with this code already exists" }, { status: 409 });
  }

  const config = await prisma.projectStatusConfig.create({
    data: {
      code: normalizedCode,
      label: label.trim(),
      color: color ?? "gray",
      description: description?.trim() || null,
      sortOrder: sortOrder ?? 99,
      isActive: true,
    },
  });

  return NextResponse.json(config, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { code, label, color, description, sortOrder, isActive } = await req.json();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "ProjectStatusConfig" (
      "id"          TEXT      NOT NULL,
      "code"        TEXT      NOT NULL,
      "label"       TEXT      NOT NULL,
      "color"       TEXT      NOT NULL DEFAULT 'gray',
      "description" TEXT,
      "sortOrder"   INTEGER   NOT NULL DEFAULT 0,
      "isActive"    BOOLEAN   NOT NULL DEFAULT true,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProjectStatusConfig_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ProjectStatusConfig_code_key" UNIQUE ("code")
    )
  `.catch(() => {});

  const defaultEntry = DEFAULTS.find((d) => d.code === code);

  const config = await prisma.projectStatusConfig.upsert({
    where: { code },
    create: {
      code,
      label: label ?? defaultEntry?.label ?? code,
      color: color ?? defaultEntry?.color ?? "gray",
      description: description ?? defaultEntry?.description ?? null,
      sortOrder: sortOrder ?? defaultEntry?.sortOrder ?? 0,
      isActive: isActive ?? true,
    },
    update: {
      ...(label !== undefined && { label }),
      ...(color !== undefined && { color }),
      ...(description !== undefined && { description }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json(config);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  if (DEFAULT_CODES.has(code)) {
    // Built-in statuses can't be hard-deleted — just disable them
    return NextResponse.json({ error: "Built-in statuses cannot be deleted. Use the enable/disable toggle instead." }, { status: 400 });
  }

  // Custom statuses can be fully removed
  await prisma.projectStatusConfig.deleteMany({ where: { code } }).catch(() => {});
  return NextResponse.json({ success: true });
}
