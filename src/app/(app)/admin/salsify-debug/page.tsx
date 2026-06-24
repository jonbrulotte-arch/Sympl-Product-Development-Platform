"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Plug } from "lucide-react";

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

const METHOD_COLOR: Record<string, string> = {
  GET: "bg-blue-100 text-blue-800",
  POST: "bg-green-100 text-green-800",
  PUT: "bg-amber-100 text-amber-800",
  DELETE: "bg-red-100 text-red-800",
};

function StatusPill({ status }: { status: number | null }) {
  if (status === null) return <span className="text-xs text-gray-400">—</span>;
  const ok = status >= 200 && status < 300;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {status}
    </span>
  );
}

function ResultCard({ result }: { result: DebugResult }) {
  const [open, setOpen] = useState(true);
  const ok = result.status !== null && result.status >= 200 && result.status < 300;

  return (
    <div className={`border rounded-lg overflow-hidden ${ok ? "border-green-200" : "border-red-200"}`}>
      <button
        className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium ${ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded font-mono ${METHOD_COLOR[result.method] ?? "bg-gray-100 text-gray-700"}`}>{result.method}</span>
          <span>{result.action}</span>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={result.status} />
          <span className="text-xs text-gray-400">{result.durationMs}ms</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="divide-y divide-gray-100 bg-white">
          {/* URL */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">URL</p>
            <code className="text-xs text-gray-700 break-all">{result.url}</code>
          </div>

          {/* Request body */}
          {result.requestBody !== null && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Request Body</p>
              <pre className="text-xs font-mono bg-gray-900 text-gray-100 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(result.requestBody, null, 2)}
              </pre>
            </div>
          )}

          {/* Response */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Response</p>
            {result.error ? (
              <p className="text-xs text-red-600 font-mono">{result.error}</p>
            ) : (
              <pre className="text-xs font-mono bg-gray-900 text-gray-100 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(result.responseBody, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const PROPERTY_PLACEHOLDER = `{
  "Part Number": "78834-TEST",
  "Item Name": "Test Product"
}`;

export default function SalsifyDebugPage() {
  const [productId, setProductId] = useState("78834-TEST");
  const [propertiesRaw, setPropertiesRaw] = useState(PROPERTY_PLACEHOLDER);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DebugResult[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const parseProperties = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(propertiesRaw);
      setPropertiesError(null);
      return parsed;
    } catch (e) {
      setPropertiesError(`Invalid JSON: ${String(e)}`);
      return null;
    }
  };

  const run = async (action: string) => {
    const properties = parseProperties();
    if (!properties && action !== "connection") return;
    setLoading(true);
    setActiveAction(action);
    setResults(null);
    try {
      const res = await fetch("/api/admin/salsify-debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, productId: productId.trim() || undefined, properties }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResults(data.results);
      setOrgId(data.orgId ?? null);
    } catch (e) {
      setResults([{ action, url: "", method: "", requestBody: null, requestHeaders: {}, status: null, responseBody: null, durationMs: 0, error: String(e) }]);
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Plug className="h-5 w-5 text-gray-500" />
          <h1 className="text-2xl font-bold text-gray-900">Salsify Debug</h1>
        </div>
        <p className="text-sm text-gray-500">Send test requests directly to the Salsify API and inspect the raw response. Uses the credentials from Admin → Settings.</p>
      </div>

      {orgId && (
        <div className="text-xs text-gray-400 font-mono bg-gray-50 border rounded px-3 py-2">
          Org ID: <span className="text-gray-700">{orgId}</span>
        </div>
      )}

      {/* Inputs */}
      <div className="bg-white border rounded-lg p-4 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Product ID (Part Number)</label>
          <Input
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="e.g. 78834-TEST"
            className="font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Properties JSON (sent in request body)</label>
          <textarea
            value={propertiesRaw}
            onChange={(e) => { setPropertiesRaw(e.target.value); setPropertiesError(null); }}
            rows={6}
            className="w-full font-mono text-xs border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          {propertiesError && <p className="text-xs text-red-600 mt-1">{propertiesError}</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          { action: "connection", label: "Test Connection", desc: "GET /products?per_page=1" },
          { action: "fetch", label: "Fetch Product", desc: "GET /products/:id" },
          { action: "upsert", label: "PUT Upsert (with salsify:id)", desc: "PUT /products/:id + salsify:id in body" },
          { action: "upsert_no_id", label: "PUT Upsert (no salsify:id)", desc: "PUT /products/:id, no id in body" },
          { action: "create", label: "POST Create", desc: "POST /products" },
          { action: "all", label: "Run All Tests", desc: "Runs all 5 tests in sequence" },
        ].map(({ action, label, desc }) => (
          <button
            key={action}
            onClick={() => run(action)}
            disabled={loading}
            className="flex flex-col items-start gap-0.5 border rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
              {loading && activeAction === action && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {label}
            </div>
            <span className="text-xs text-gray-400 font-mono">{desc}</span>
          </button>
        ))}
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Results</h2>
          {results.map((r, i) => <ResultCard key={i} result={r} />)}
        </div>
      )}
    </div>
  );
}
