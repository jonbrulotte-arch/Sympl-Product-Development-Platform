import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isInspectionsEnabled } from "@/lib/app-config";
import { getGrantedPermissions } from "@/lib/permissions";

// Lightweight endpoint for feature flags consumed by the client shell (sidebar, etc.)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [config, inspectionsEnabled, granted] = await Promise.all([
    prisma.salsifyConfig.findFirst({ select: { salsifyDebugEnabled: true } }),
    isInspectionsEnabled(),
    getGrantedPermissions(session.user.role),
  ]);

  return NextResponse.json({
    salsifyDebugEnabled: config?.salsifyDebugEnabled ?? false,
    inspectionsEnabled,
    // The caller's own grants, so client components can hide actions the API
    // would reject anyway. Never a substitute for the server-side check.
    permissions: [...granted],
  });
}
