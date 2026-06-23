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

  const { apiKey, organizationId, channelId, isEnabled } = await req.json();

  const existing = await prisma.salsifyConfig.findFirst();

  if (existing) {
    const updated = await prisma.salsifyConfig.update({
      where: { id: existing.id },
      data: {
        // Only update apiKey if a new one is provided (not the masked placeholder)
        ...(apiKey && !apiKey.startsWith("••") ? { apiKey } : {}),
        organizationId,
        channelId,
        isEnabled,
      },
    });
    return NextResponse.json({ success: true, id: updated.id });
  }

  const created = await prisma.salsifyConfig.create({
    data: { apiKey: apiKey ?? "", organizationId: organizationId ?? "", channelId, isEnabled: isEnabled ?? false },
  });
  return NextResponse.json({ success: true, id: created.id });
}
