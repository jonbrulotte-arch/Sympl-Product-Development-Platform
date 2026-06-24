import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type DebugResult = {
  action: string;
  url: string;
  method: string;
  requestBody: unknown;
  requestHeaders: Record<string, string>;
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
  let responseBody: unknown;
  const contentType = res.headers.get("content-type") ?? "";
  try {
    responseBody = contentType.includes("json") ? await res.json() : await res.text();
  } catch {
    responseBody = "(could not parse response)";
  }
  return { status: res.status, body: responseBody, durationMs };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await prisma.salsifyConfig.findFirst({ where: { isEnabled: true } });
  if (!config) {
    return NextResponse.json({ error: "Salsify is not configured or not enabled." }, { status: 400 });
  }

  const { action, productId, properties } = await req.json() as {
    action: string;
    productId?: string;
    properties?: Record<string, unknown>;
  };

  const baseUrl = `https://app.salsify.com/api/v1/orgs/${config.organizationId}/products`;
  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const results: DebugResult[] = [];

  // ── Test 1: Verify connection — list products (page 1) ──────────────────
  if (action === "connection" || action === "all") {
    const url = `${baseUrl}?per_page=1`;
    try {
      const r = await callSalsify("GET", url, authHeaders);
      results.push({
        action: "Test connection (GET /products?per_page=1)",
        url, method: "GET",
        requestBody: null,
        requestHeaders: { ...authHeaders, Authorization: "Bearer ***" },
        status: r.status, responseBody: r.body, durationMs: r.durationMs,
      });
    } catch (e) {
      results.push({ action: "Test connection", url, method: "GET", requestBody: null, requestHeaders: {}, status: null, responseBody: null, durationMs: 0, error: String(e) });
    }
  }

  // ── Test 2: Fetch a specific product ────────────────────────────────────
  if ((action === "fetch" || action === "all") && productId) {
    const url = `${baseUrl}/${encodeURIComponent(productId)}`;
    try {
      const r = await callSalsify("GET", url, authHeaders);
      results.push({
        action: `Fetch product "${productId}"`,
        url, method: "GET",
        requestBody: null,
        requestHeaders: { ...authHeaders, Authorization: "Bearer ***" },
        status: r.status, responseBody: r.body, durationMs: r.durationMs,
      });
    } catch (e) {
      results.push({ action: "Fetch product", url, method: "GET", requestBody: null, requestHeaders: {}, status: null, responseBody: null, durationMs: 0, error: String(e) });
    }
  }

  // ── Test 3: PUT flat (no wrapper) — correct Salsify format ─────────────
  if ((action === "upsert" || action === "all") && productId) {
    const url = `${baseUrl}/${encodeURIComponent(productId)}`;
    const body = { "salsify:id": productId, ...properties };
    try {
      const r = await callSalsify("PUT", url, authHeaders, body);
      results.push({
        action: `PUT flat (no wrapper) "${productId}"`,
        url, method: "PUT",
        requestBody: body,
        requestHeaders: { ...authHeaders, Authorization: "Bearer ***" },
        status: r.status, responseBody: r.body, durationMs: r.durationMs,
      });
    } catch (e) {
      results.push({ action: "PUT flat", url, method: "PUT", requestBody: body, requestHeaders: {}, status: null, responseBody: null, durationMs: 0, error: String(e) });
    }
  }

  // ── Test 4: PUT flat, no salsify:id in body ──────────────────────────────
  if ((action === "upsert_no_id" || action === "all") && productId) {
    const url = `${baseUrl}/${encodeURIComponent(productId)}`;
    const body = { ...properties };
    try {
      const r = await callSalsify("PUT", url, authHeaders, body);
      results.push({
        action: `PUT flat (no salsify:id) "${productId}"`,
        url, method: "PUT",
        requestBody: body,
        requestHeaders: { ...authHeaders, Authorization: "Bearer ***" },
        status: r.status, responseBody: r.body, durationMs: r.durationMs,
      });
    } catch (e) {
      results.push({ action: "PUT flat no id", url, method: "PUT", requestBody: body, requestHeaders: {}, status: null, responseBody: null, durationMs: 0, error: String(e) });
    }
  }

  // ── Test 5: POST flat (no wrapper) ──────────────────────────────────────
  if ((action === "create" || action === "all") && productId) {
    const body = { "salsify:id": productId, ...properties };
    try {
      const r = await callSalsify("POST", baseUrl, authHeaders, body);
      results.push({
        action: `POST flat (no wrapper) "${productId}"`,
        url: baseUrl, method: "POST",
        requestBody: body,
        requestHeaders: { ...authHeaders, Authorization: "Bearer ***" },
        status: r.status, responseBody: r.body, durationMs: r.durationMs,
      });
    } catch (e) {
      results.push({ action: "POST flat", url: baseUrl, method: "POST", requestBody: body, requestHeaders: {}, status: null, responseBody: null, durationMs: 0, error: String(e) });
    }
  }

  return NextResponse.json({ results, orgId: config.organizationId });
}
