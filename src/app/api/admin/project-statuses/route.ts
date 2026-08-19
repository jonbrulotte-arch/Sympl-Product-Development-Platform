import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { PROJECT_STATUS_DEFAULTS, getProjectStatuses } from "@/lib/project-statuses";
import { logActivity } from "@/lib/activity";

const DEFAULTS = PROJECT_STATUS_DEFAULTS;
const DEFAULT_CODES = new Set(DEFAULTS.map((d) => d.code));

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await getProjectStatuses());
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
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

  logActivity({
    userId: session.user.id,
    action: "SETTINGS_CHANGED" as never,
    entityType: "setting",
    entityId: "project-statuses",
    oldValue: JSON.stringify(null),
    newValue: JSON.stringify({ code: config.code, label: config.label, color: config.color }),
  }).catch(() => {});

  return NextResponse.json(config, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
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

  const oldConfig = await prisma.projectStatusConfig.findFirst({ where: { code } }).catch(() => null);

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

  logActivity({
    userId: session.user.id,
    action: "SETTINGS_CHANGED" as never,
    entityType: "setting",
    entityId: "project-statuses",
    oldValue: JSON.stringify(oldConfig ? { code: oldConfig.code, label: oldConfig.label, color: oldConfig.color, isActive: oldConfig.isActive } : null),
    newValue: JSON.stringify({ code: config.code, label: config.label, color: config.color, isActive: config.isActive }),
  }).catch(() => {});

  return NextResponse.json(config);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
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
  logActivity({
    userId: session.user.id,
    action: "SETTINGS_CHANGED" as never,
    entityType: "setting",
    entityId: "project-statuses",
    oldValue: JSON.stringify({ code }),
    newValue: JSON.stringify(null),
  }).catch(() => {});
  return NextResponse.json({ success: true });
}
