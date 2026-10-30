import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { invalidateBranding, validateLogo } from "@/lib/branding";

async function guard() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) return null;
  return session;
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const cfg = await prisma.appConfig.findFirst({
    select: { brandingEnabled: true, brandName: true, brandTagline: true, brandLogo: true },
  });
  return NextResponse.json({
    enabled: cfg?.brandingEnabled ?? false,
    name: cfg?.brandName ?? "",
    tagline: cfg?.brandTagline ?? "",
    logo: cfg?.brandLogo ?? null,
  });
}

// body: { enabled, name, tagline, logo?: dataURL | null (null removes; omitted keeps) }
export async function PUT(req: NextRequest) {
  const session = await guard();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const enabled = body.enabled === true;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  const tagline = typeof body.tagline === "string" ? body.tagline.trim().slice(0, 120) : "";
  if (enabled && !name) return NextResponse.json({ error: "Site name is required when custom branding is on" }, { status: 400 });

  let logo: string | null | undefined = undefined;
  if (body.logo === null) logo = null;
  else if (typeof body.logo === "string") {
    const v = validateLogo(body.logo);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    logo = v.dataUrl;
  }

  const data = {
    brandingEnabled: enabled,
    brandName: name || null,
    brandTagline: tagline || null,
    ...(logo !== undefined ? { brandLogo: logo } : {}),
    brandUpdatedAt: new Date(),
  };
  const existing = await prisma.appConfig.findFirst({ select: { id: true, brandingEnabled: true, brandName: true } });
  if (existing) await prisma.appConfig.update({ where: { id: existing.id }, data });
  else await prisma.appConfig.create({ data });
  invalidateBranding();

  await logActivity({
    userId: session.user.id, action: "SETTINGS_CHANGED", entityType: "Setting", entityId: "branding",
    oldValue: JSON.stringify({ enabled: existing?.brandingEnabled ?? false, name: existing?.brandName ?? null }),
    newValue: JSON.stringify({ enabled, name: name || null, logo: logo === undefined ? "unchanged" : logo ? "updated" : "removed" }),
    source: "Admin Settings",
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
