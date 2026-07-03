import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

const SHAREABLE_TYPES = new Set(["PRODUCT", "PSIR", "COMPLIANCE"]);
const CAN_SHARE_ROLES = new Set(["ADMIN", "PRODUCT_MANAGER"]);

// Create an expiring read-only share link for a product or PSIR.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CAN_SHARE_ROLES.has(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { entityType, entityId, expiresInDays } = await req.json();
  if (!SHAREABLE_TYPES.has(entityType) || !entityId) {
    return NextResponse.json({ error: "entityType (PRODUCT|PSIR) and entityId required" }, { status: 400 });
  }

  // Verify the entity exists before minting a link to it
  const exists =
    entityType === "PRODUCT"
      ? await prisma.productRecord.findUnique({ where: { id: entityId }, select: { id: true } })
      : entityType === "PSIR"
      ? await prisma.psir.findUnique({ where: { id: entityId }, select: { id: true } })
      : await prisma.complianceEvent.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const days = Math.min(Math.max(parseInt(String(expiresInDays)) || 7, 1), 90);
  const token = randomBytes(24).toString("base64url");

  const link = await prisma.shareLink.create({
    data: {
      token,
      entityType,
      entityId,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      createdById: session.user.id,
    },
  });

  return NextResponse.json({
    id: link.id,
    url: `/share/${token}`,
    expiresAt: link.expiresAt,
  }, { status: 201 });
}

// List active links for an entity
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CAN_SHARE_ROLES.has(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType") ?? "";
  const entityId = searchParams.get("entityId") ?? "";

  const links = await prisma.shareLink.findMany({
    where: {
      entityType,
      entityId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, expiresAt: true, createdAt: true },
  });

  return NextResponse.json(links.map((l) => ({ ...l, url: `/share/${l.token}` })));
}

// Revoke a link
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CAN_SHARE_ROLES.has(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
