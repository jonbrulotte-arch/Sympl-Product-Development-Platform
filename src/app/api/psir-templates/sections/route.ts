import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, str } from "@/lib/psir-api";

export async function GET() {
  const s = await requireAnyPermission("admin:psir_templates", "psir_generator:use");
  if (s instanceof NextResponse) return s;
  const sections = await prisma.psirTemplateSection.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(sections);
}

export async function POST(req: Request) {
  const s = await requireAnyPermission("admin:psir_templates");
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => ({}));
  const name = str(body.name, 300);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const last = await prisma.psirTemplateSection.findFirst({ orderBy: { sortOrder: "desc" } });
  const section = await prisma.psirTemplateSection.create({
    data: { name, sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : (last?.sortOrder ?? 0) + 10 },
  });
  return NextResponse.json(section, { status: 201 });
}
