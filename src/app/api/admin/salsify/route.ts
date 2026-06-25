import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await prisma.salsifyConfig.findFirst();
  if (!config) return NextResponse.json(null);

  // Never expose the API key to the client — return a masked version
  return NextResponse.json({
    ...config,
    apiKey: config.apiKey ? "••••••••" + config.apiKey.slice(-4) : "",
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { apiKey, organizationId, channelId, isEnabled, salsifyDebugEnabled } = await req.json();

  const existing = await prisma.salsifyConfig.findFirst();

  if (existing) {
    const updated = await prisma.salsifyConfig.update({
      where: { id: existing.id },
      data: {
        ...(apiKey && !apiKey.startsWith("••") ? { apiKey } : {}),
        organizationId,
        channelId,
        isEnabled,
        ...(salsifyDebugEnabled !== undefined ? { salsifyDebugEnabled } : {}),
      },
    });
    return NextResponse.json({ success: true, id: updated.id });
  }

  const created = await prisma.salsifyConfig.create({
    data: { apiKey: apiKey ?? "", organizationId: organizationId ?? "", channelId, isEnabled: isEnabled ?? false, salsifyDebugEnabled: salsifyDebugEnabled ?? false },
  });
  return NextResponse.json({ success: true, id: created.id });
}
