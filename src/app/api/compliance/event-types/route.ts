import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const types = await prisma.complianceEventType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(types);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, color, sortOrder } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const type = await prisma.complianceEventType.create({
    data: { name: name.trim(), description, color: color ?? "#6366f1", sortOrder: sortOrder ?? 0 },
  });
  return NextResponse.json(type, { status: 201 });
}
