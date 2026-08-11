import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isInspectionsEnabled } from "@/lib/app-config";
import { getGrantedPermissions } from "@/lib/permissions";

// Lightweight endpoint for feature flags consumed by the client shell (sidebar, etc.)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [config, inspectionsEnabled, granted, me] = await Promise.all([
    prisma.salsifyConfig.findFirst({
      select: { salsifyDebugEnabled: true, isEnabled: true, organizationId: true },
    }),
    isInspectionsEnabled(),
    getGrantedPermissions(session.user.role),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { salsifyApiKey: true },
    }),
  ]);

  // Everything a sync needs before it can succeed. Mirrors the checks in
  // resolveSalsifyCredentials so the UI can say what's missing up front
  // instead of letting the user find out after confirming a sync.
  const hasApiKey = !!me?.salsifyApiKey?.trim();
  const salsifyEnabled = !!config?.isEnabled && !!config?.organizationId;

  return NextResponse.json({
    salsifyDebugEnabled: config?.salsifyDebugEnabled ?? false,
    inspectionsEnabled,
    // The caller's own grants, so client components can hide actions the API
    // would reject anyway. Never a substitute for the server-side check.
    permissions: [...granted],
    salsify: {
      enabled: salsifyEnabled,
      hasApiKey,
      ready: salsifyEnabled && hasApiKey,
      // What to tell the user when it isn't ready.
      blockedReason: salsifyEnabled
        ? hasApiKey
          ? null
          : "Add your personal Salsify API key in My Profile to sync."
        : "Salsify is not configured. An admin must enable it in Admin → Settings.",
    },
  });
}
