// App-wide module toggles (Admin → Settings → Modules).
// Inspections defaults to enabled when no AppConfig row exists yet.

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function isInspectionsEnabled(): Promise<boolean> {
  const config = await prisma.appConfig.findFirst({ select: { inspectionsEnabled: true } });
  return config?.inspectionsEnabled ?? true;
}

/** API-route guard: returns a 404 response when the Inspections module is disabled, else null. */
export async function requireInspectionsEnabled(): Promise<NextResponse | null> {
  if (await isInspectionsEnabled()) return null;
  return NextResponse.json({ error: "Inspections module is disabled" }, { status: 404 });
}

export async function setInspectionsEnabled(enabled: boolean): Promise<void> {
  const existing = await prisma.appConfig.findFirst({ select: { id: true } });
  if (existing) {
    await prisma.appConfig.update({ where: { id: existing.id }, data: { inspectionsEnabled: enabled } });
  } else {
    await prisma.appConfig.create({ data: { inspectionsEnabled: enabled } });
  }
}
