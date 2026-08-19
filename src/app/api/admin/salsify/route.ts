import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await prisma.salsifyConfig.findFirst();
  if (!config) return NextResponse.json(null);

  // API keys are per-user (User.salsifyApiKey) and never travel through this
  // admin endpoint — drop the deprecated column from the response entirely.
  const { apiKey: _deprecated, ...rest } = config;
  return NextResponse.json(rest);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // apiKey is deliberately not accepted — each user sets their own via
  // /api/users/me/salsify-key.
  const { organizationId, isEnabled, salsifyDebugEnabled } = await req.json();

  const existing = await prisma.salsifyConfig.findFirst();

  if (existing) {
    const updated = await prisma.salsifyConfig.update({
      where: { id: existing.id },
      data: {
        organizationId,
        isEnabled,
        ...(salsifyDebugEnabled !== undefined ? { salsifyDebugEnabled } : {}),
      },
    });
    logActivity({
      userId: session.user.id,
      action: "SETTINGS_CHANGED" as never,
      entityType: "setting",
      entityId: "salsify",
      oldValue: JSON.stringify({ organizationId: existing.organizationId, isEnabled: existing.isEnabled, salsifyDebugEnabled: existing.salsifyDebugEnabled }),
      newValue: JSON.stringify({ organizationId, isEnabled, salsifyDebugEnabled: updated.salsifyDebugEnabled }),
    }).catch(() => {});
    return NextResponse.json({ success: true, id: updated.id });
  }

  const created = await prisma.salsifyConfig.create({
    // apiKey is deprecated but still NOT NULL on databases that predate the
    // per-user key migration, so write the empty string explicitly.
    data: { apiKey: "", organizationId: organizationId ?? "", isEnabled: isEnabled ?? false, salsifyDebugEnabled: salsifyDebugEnabled ?? false },
  });
  logActivity({
    userId: session.user.id,
    action: "SETTINGS_CHANGED" as never,
    entityType: "setting",
    entityId: "salsify",
    oldValue: JSON.stringify({ organizationId: null, isEnabled: false, salsifyDebugEnabled: false }),
    newValue: JSON.stringify({ organizationId: created.organizationId, isEnabled: created.isEnabled, salsifyDebugEnabled: created.salsifyDebugEnabled }),
  }).catch(() => {});
  return NextResponse.json({ success: true, id: created.id });
}
