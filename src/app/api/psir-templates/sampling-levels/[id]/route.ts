import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/psir-api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireAnyPermission("admin:psir_templates");
  if (s instanceof NextResponse) return s;
  const { id } = await params;
  await prisma.psirSamplingLevel.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
