import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lightweight endpoint for feature flags consumed by the client shell (sidebar, etc.)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.salsifyConfig.findFirst({
    select: { salsifyDebugEnabled: true },
  });

  return NextResponse.json({
    salsifyDebugEnabled: config?.salsifyDebugEnabled ?? false,
  });
}
