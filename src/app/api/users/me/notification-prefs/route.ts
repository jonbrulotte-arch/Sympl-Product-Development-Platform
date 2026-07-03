import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  NOTIFICATION_CATEGORIES,
  resolvePrefs,
  type NotificationPrefs,
  type NotificationCategory,
} from "@/lib/notifications";

// Returns the fully-resolved matrix (stored values merged over defaults) so
// the profile UI can render every toggle without knowing the default rules.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefs = await prisma.userPreferences.findUnique({
    where: { userId: session.user.id },
    select: { notificationPrefs: true },
  });

  const stored = (prefs?.notificationPrefs ?? null) as NotificationPrefs | null;
  const matrix: Record<string, { inbox: boolean; email: boolean }> = {};
  for (const cat of NOTIFICATION_CATEGORIES) {
    matrix[cat] = resolvePrefs(stored, cat);
  }

  return NextResponse.json(matrix);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Sanitize: only known categories, only boolean channels
  const clean: NotificationPrefs = {};
  for (const cat of NOTIFICATION_CATEGORIES) {
    const v = body?.[cat];
    if (v && typeof v === "object") {
      clean[cat as NotificationCategory] = {
        inbox: v.inbox === true,
        email: v.email === true,
      };
    }
  }

  await prisma.userPreferences.upsert({
    where: { userId: session.user.id },
    update: { notificationPrefs: clean },
    create: { userId: session.user.id, notificationPrefs: clean },
  });

  return NextResponse.json({ ok: true });
}
