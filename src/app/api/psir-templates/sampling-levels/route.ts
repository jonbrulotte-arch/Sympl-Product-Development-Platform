import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, str } from "@/lib/psir-api";

export async function GET() {
  const s = await requireAnyPermission("admin:psir_templates", "psir_generator:use");
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await prisma.psirSamplingLevel.findMany({ orderBy: { sortOrder: "asc" } }));
}

export async function POST(req: Request) {
  const s = await requireAnyPermission("admin:psir_templates");
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => ({}));
  const label = str(body.label, 200);
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  const last = await prisma.psirSamplingLevel.findFirst({ orderBy: { sortOrder: "desc" } });
  const level = await prisma.psirSamplingLevel
    .create({ data: { label, sortOrder: (last?.sortOrder ?? -1) + 1 } })
    .catch(() => null);
  if (!level) return NextResponse.json({ error: "That sampling level already exists" }, { status: 409 });
  return NextResponse.json(level, { status: 201 });
}
