import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { generateApiToken } from "@/lib/api-tokens";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tokens = await prisma.apiToken.findMany({
    where: { revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, scope: true, lastUsedAt: true, createdAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
  return NextResponse.json(tokens);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { token, tokenHash } = generateApiToken();
  const record = await prisma.apiToken.create({
    data: {
      name: name.trim(),
      tokenHash,
      scope: "read:products",
      createdById: session.user.id,
    },
  });

  // Plaintext token returned exactly once — only the hash is stored
  return NextResponse.json({ id: record.id, name: record.name, token }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
