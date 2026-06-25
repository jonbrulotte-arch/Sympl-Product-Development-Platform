import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const attrs = await prisma.psirAttributeDefinition.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(attrs);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { key, label, description, attributeType, sortOrder, options } = body;
  if (!key?.trim() || !label?.trim()) {
    return NextResponse.json({ error: "key and label required" }, { status: 400 });
  }

  const attr = await prisma.psirAttributeDefinition.create({
    data: {
      key: key.trim().toLowerCase().replace(/\s+/g, "_"),
      label: label.trim(),
      description: description || null,
      attributeType: attributeType ?? "TEXT",
      sortOrder: sortOrder ?? 0,
      options: options ?? [],
    },
  });
  return NextResponse.json(attr, { status: 201 });
}
