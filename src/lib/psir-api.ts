import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";

/** Returns the session when the caller holds any of the permissions, else an error response. */
export async function requireAnyPermission(...perms: Permission[]): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  for (const p of perms) if (await can(session.user.role, p)) return session;
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function str(v: unknown, max = 10_000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export const SHEETS = ["PSIR_DATA", "PRODUCT_MEASUREMENTS", "FUNCTIONAL_INSPECTIONS"] as const;

export function cleanTokens(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 500)) {
    if (typeof val === "string") out[k.slice(0, 100)] = val.slice(0, 2000);
  }
  return out;
}
