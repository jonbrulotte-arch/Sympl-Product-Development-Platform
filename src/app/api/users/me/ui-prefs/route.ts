import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUiPrefs, parseUiPrefs } from "@/lib/ui-prefs";

// Sticky per-user UI choices (e.g. the Projects page card/list toggle).
// Everyone manages only their own — there is no cross-user access here.

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getUiPrefs(session.user.id));
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Merge rather than replace, so setting one toggle can't drop the others.
  const incoming = parseUiPrefs(await req.json().catch(() => ({})));
  const current = await getUiPrefs(session.user.id);
  const merged = { ...current, ...incoming };

  await prisma.userPreferences.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, uiPrefs: merged },
    update: { uiPrefs: merged },
  });

  return NextResponse.json(merged);
}
