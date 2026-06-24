import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = 50;

  const entityType = searchParams.get("entityType") ?? undefined;
  const action = searchParams.get("action") ?? undefined;
  const userId = searchParams.get("userId") ?? undefined;

  const where = {
    projectId,
    ...(entityType ? { entityType } : {}),
    ...(action ? { action: action as never } : {}),
    ...(userId ? { userId } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, image: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return NextResponse.json({ data: logs, total, page, pageSize });
}
