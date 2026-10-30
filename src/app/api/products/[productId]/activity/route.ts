import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// A product's full history across every project it has been in.
export async function GET(req: NextRequest, { params }: { params: Promise<{ productId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { productId } = await params;
  const page = Math.max(1, parseInt(new URL(req.url).searchParams.get("page") ?? "1"));
  const pageSize = 50;
  const where = { productId };
  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, image: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);
  return NextResponse.json({ data: logs, total, page, pageSize });
}
