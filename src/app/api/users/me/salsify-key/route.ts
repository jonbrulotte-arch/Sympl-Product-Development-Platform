import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { maskApiKey } from "@/lib/salsify-auth";

// GET — whether the caller has a key, masked for display. The key itself is
// never sent back to the browser once stored.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { salsifyApiKey: true },
  });

  return NextResponse.json({
    hasKey: !!user?.salsifyApiKey,
    masked: maskApiKey(user?.salsifyApiKey),
  });
}

// PUT — set the caller's own key. A user can only ever write their own.
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { apiKey } = await req.json().catch(() => ({}));
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "API key is required" }, { status: 400 });
  }

  const trimmed = apiKey.trim();
  // Guard against saving the mask back over the real key.
  if (trimmed.startsWith("••")) {
    return NextResponse.json({ error: "Enter your full API key" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { salsifyApiKey: trimmed },
  });

  return NextResponse.json({ success: true, hasKey: true, masked: maskApiKey(trimmed) });
}

// DELETE — remove the caller's key.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { salsifyApiKey: null },
  });

  return NextResponse.json({ success: true, hasKey: false, masked: "" });
}
