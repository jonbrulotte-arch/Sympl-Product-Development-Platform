import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";

export type SalsifyAttrConfig = {
  key: string;
  label: string;
  propertyId: string;
  locale: string | null;
  maxValues: number;
};

export type DebugResult = {
  label: string;
  url: string;
  method: string;
  requestBody: unknown;
  status: number | null;
  responseBody: unknown;
  durationMs: number;
  error?: string;
};

async function callSalsify(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown
): Promise<{ status: number; body: unknown; durationMs: number }> {
  const start = Date.now();
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const durationMs = Date.now() - start;
  const contentType = res.headers.get("content-type") ?? "";
  let responseBody: unknown;
  try {
    responseBody = contentType.includes("json") ? await res.json() : await res.text();
  } catch {
    responseBody = "(could not parse response)";
  }
  return { status: res.status, body: responseBody, durationMs };
}

// Build a Salsify payload from configured attributes, applying locale wrapping
function buildPayload(
  productId: string,
  attrs: SalsifyAttrConfig[],
  values: Record<string, unknown>
): Record<string, unknown> {
  const payload: Record<string, unknown> = { "salsify:id": productId };
  for (const attr of attrs) {
    const raw = values[attr.key];
    if (raw === undefined || raw === null || raw === "") continue;
    payload[attr.propertyId] = attr.locale ? { [attr.locale]: raw } : raw;
  }
  return payload;
}

// GET — return configured salsify attrs + first salsify product for reference
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await prisma.salsifyConfig.findFirst({ where: { isEnabled: true } });

  const attrs = await prisma.attributeDefinition.findMany({
    where: { salsifyEnabled: true, isActive: true, salsifyPropertyId: { not: null } },
    orderBy: [{ section: { sortOrder: "asc" } }, { sectionId: "asc" }, { sortOrder: "asc" }],
    select: { key: true, label: true, salsifyPropertyId: true, salsifyLocale: true, maxValues: true },
  });

  const attrConfigs: SalsifyAttrConfig[] = attrs.map((a) => ({
    key: a.key,
    label: a.label,
    propertyId: a.salsifyPropertyId!,
    locale: a.salsifyLocale,
    maxValues: a.maxValues,
  }));

  return NextResponse.json({
    configured: !!config,
    orgId: config?.organizationId ?? null,
    attrs: attrConfigs,
  });
}

// POST — run a debug action
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The debug tool calls Salsify as the admin using it, with their own key.
  const resolved = await resolveSalsifyCredentials(session.user.id);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const config = resolved.credentials;

  const { action, productId, values, rawPayload } = await req.json() as {
    action: string;
    productId?: string;
    values?: Record<string, unknown>;       // per-attr key → value
    rawPayload?: Record<string, unknown>;   // freeform JSON override
  };

  const baseUrl = `https://app.salsify.com/api/v1/orgs/${config.organizationId}/products`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const safeHeaders = { ...headers, Authorization: "Bearer ***" };

  const results: DebugResult[] = [];

  const push = (r: Omit<DebugResult, "requestBody"> & { requestBody?: unknown }) =>
    results.push({ requestBody: null, ...r });

  // ── Connection test ──────────────────────────────────────────────────────
  if (action === "connection" || action === "all") {
    const url = `${baseUrl}?per_page=3`;
    try {
      const r = await callSalsify("GET", url, headers);
      push({ label: "Test connection — GET /products?per_page=3", url, method: "GET", status: r.status, responseBody: r.body, durationMs: r.durationMs });
    } catch (e) {
      push({ label: "Test connection", url, method: "GET", status: null, responseBody: null, durationMs: 0, error: String(e) });
    }
  }

  // ── Fetch product ────────────────────────────────────────────────────────
  if ((action === "fetch" || action === "all") && productId) {
    const url = `${baseUrl}/${encodeURIComponent(productId)}`;
    try {
      const r = await callSalsify("GET", url, headers);
      push({ label: `Fetch product "${productId}"`, url, method: "GET", status: r.status, responseBody: r.body, durationMs: r.durationMs });
    } catch (e) {
      push({ label: "Fetch product", url, method: "GET", status: null, responseBody: null, durationMs: 0, error: String(e) });
    }
  }

  // ── PUT upsert (locale-aware, built from attr config) ───────────────────
  if ((action === "put" || action === "all") && productId) {
    const attrs = await prisma.attributeDefinition.findMany({
      where: { salsifyEnabled: true, isActive: true, salsifyPropertyId: { not: null } },
      select: { key: true, salsifyPropertyId: true, salsifyLocale: true, maxValues: true, label: true },
    });
    const attrConfigs: SalsifyAttrConfig[] = attrs.map((a) => ({
      key: a.key, label: a.label, propertyId: a.salsifyPropertyId!,
      locale: a.salsifyLocale, maxValues: a.maxValues,
    }));

    const body = rawPayload ?? buildPayload(productId, attrConfigs, values ?? {});
    const url = `${baseUrl}/${encodeURIComponent(productId)}`;
    try {
      const r = await callSalsify("PUT", url, headers, body);
      push({ label: `PUT upsert "${productId}"`, url, method: "PUT", requestBody: body, status: r.status, responseBody: r.body, durationMs: r.durationMs });
    } catch (e) {
      push({ label: "PUT upsert", url, method: "PUT", requestBody: body, status: null, responseBody: null, durationMs: 0, error: String(e) });
    }
  }

  // ── POST create ──────────────────────────────────────────────────────────
  if ((action === "post" || action === "all") && productId) {
    const attrs = await prisma.attributeDefinition.findMany({
      where: { salsifyEnabled: true, isActive: true, salsifyPropertyId: { not: null } },
      select: { key: true, salsifyPropertyId: true, salsifyLocale: true, maxValues: true, label: true },
    });
    const attrConfigs: SalsifyAttrConfig[] = attrs.map((a) => ({
      key: a.key, label: a.label, propertyId: a.salsifyPropertyId!,
      locale: a.salsifyLocale, maxValues: a.maxValues,
    }));

    const body = rawPayload ?? buildPayload(productId, attrConfigs, values ?? {});
    try {
      const r = await callSalsify("POST", baseUrl, headers, body);
      push({ label: `POST create "${productId}"`, url: baseUrl, method: "POST", requestBody: body, status: r.status, responseBody: r.body, durationMs: r.durationMs });
    } catch (e) {
      push({ label: "POST create", url: baseUrl, method: "POST", requestBody: body, status: null, responseBody: null, durationMs: 0, error: String(e) });
    }
  }

  return NextResponse.json({ results, safeHeaders });
}
