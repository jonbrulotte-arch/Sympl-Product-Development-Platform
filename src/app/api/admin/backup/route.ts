import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — return config + recent logs
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [config, logs] = await Promise.all([
    prisma.backupConfig.findFirst(),
    prisma.backupLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return NextResponse.json({
    config: config ? { ...config, apiTokenHash: undefined, hasApiToken: !!config.apiTokenHash } : null,
    logs: logs.map((l) => ({ ...l, fileSizeBytes: l.fileSizeBytes != null ? l.fileSizeBytes.toString() : null })),
  });
}

// POST — create or update config
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const existing = await prisma.backupConfig.findFirst();

  const data = {
    isEnabled: Boolean(body.isEnabled),
    backupPath: body.backupPath ?? "/var/backups/sympl",
    scheduleType: body.scheduleType ?? "DAILY",
    scheduleHour: Number(body.scheduleHour ?? 2),
    scheduleMinute: Number(body.scheduleMinute ?? 0),
    retainCount: Number(body.retainCount ?? 7),
  };

  const config = existing
    ? await prisma.backupConfig.update({ where: { id: existing.id }, data })
    : await prisma.backupConfig.create({ data });

  return NextResponse.json(config);
}
