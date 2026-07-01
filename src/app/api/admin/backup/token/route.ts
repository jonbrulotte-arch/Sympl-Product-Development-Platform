import { can } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes, createHash } from "crypto";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// POST — generate a new API token (returns plaintext once, stores hash)
export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = `sbk_${randomBytes(32).toString("hex")}`;
  const apiTokenHash = hashToken(token);

  const existing = await prisma.backupConfig.findFirst();
  if (existing) {
    await prisma.backupConfig.update({ where: { id: existing.id }, data: { apiTokenHash } });
  } else {
    await prisma.backupConfig.create({ data: { apiTokenHash } });
  }

  // Return plaintext token — this is the only time it's visible
  return NextResponse.json({ token });
}

// DELETE — revoke the API token
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.backupConfig.findFirst();
  if (existing) {
    await prisma.backupConfig.update({ where: { id: existing.id }, data: { apiTokenHash: null } });
  }

  return NextResponse.json({ success: true });
}
