"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Plug, RefreshCw } from "lucide-react";
import type { SalsifyAttrConfig, DebugResult } from "@/app/api/admin/salsify-debug/route";

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
          <span>{result.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={result.status} />
          <span className="text-xs text-gray-400">{result.durationMs}ms</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="divide-y divide-gray-100 bg-white">
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">URL</p>
            <code className="text-xs text-gray-700 break-all">{result.url}</code>
          </div>

          {result.requestBody !== null && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Request Body (sent to Salsify)</p>
              <pre className="text-xs font-mono bg-gray-900 text-gray-100 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(result.requestBody, null, 2)}
              </pre>
            </div>
          )}

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

export default function SalsifyDebugPage() {
  const [attrs, setAttrs] = useState<SalsifyAttrConfig[]>([]);
  const [configured, setConfigured] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loadingAttrs, setLoadingAttrs] = useState(true);

  const [productId, setProductId] = useState("78834-TEST");
  // per-attr key → string value entered by user
  const [values, setValues] = useState<Record<string, string>>({});

  const [useRawPayload, setUseRawPayload] = useState(false);
  const [rawPayloadText, setRawPayloadText] = useState("");
  const [rawPayloadError, setRawPayloadError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [results, setResults] = useState<DebugResult[] | null>(null);
  const [safeHeaders, setSafeHeaders] = useState<Record<string, string> | null>(null);

  const loadAttrs = async () => {
    setLoadingAttrs(true);
    try {
      const res = await fetch("/api/admin/salsify-debug");
      const data = await res.json();
      setConfigured(data.configured ?? false);
      setOrgId(data.orgId ?? null);
      setAttrs(data.attrs ?? []);
    } catch {
      setAttrs([]);
    } finally {
      setLoadingAttrs(false);
    }
  };

  useEffect(() => { loadAttrs(); }, []);

  const setValue = (key: string, val: string) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const parseRawPayload = (): Record<string, unknown> | null => {
    if (!rawPayloadText.trim()) return null;
    try {
      const p = JSON.parse(rawPayloadText);
      setRawPayloadError(null);
      return p;
    } catch (e) {
      setRawPayloadError(`Invalid JSON: ${String(e)}`);
      return null;
    }
  };

  const run = async (action: string) => {
    if (useRawPayload) {
      const p = parseRawPayload();
      if (!p && action !== "connection" && action !== "fetch") {
        return;
      }
    }
    setLoading(true);
    setActiveAction(action);
    setResults(null);
    setSafeHeaders(null);
    try {
      const body: Record<string, unknown> = {
        action,
        productId: productId.trim() || undefined,
      };
      if (useRawPayload) {
        body.rawPayload = parseRawPayload() ?? undefined;
      } else {
        // Send as key→value map; server applies locale wrapping via buildPayload
        body.values = values;
      }
      const res = await fetch("/api/admin/salsify-debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResults(data.results);
      setSafeHeaders(data.safeHeaders ?? null);
    } catch (e) {
      setResults([{
        label: action,
        url: "",
        method: "",
        requestBody: null,
        status: null,
        responseBody: null,
        durationMs: 0,
        error: String(e),
      }]);
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  const ACTIONS = [
    { action: "connection", label: "Test Connection", desc: "GET /products?per_page=3" },
    { action: "fetch",      label: "Fetch Product",   desc: "GET /products/:id" },
    { action: "put",        label: "PUT Upsert",      desc: "PUT /products/:id" },
    { action: "post",       label: "POST Create",     desc: "POST /products" },
    { action: "all",        label: "Run All",         desc: "Connection → Fetch → PUT → POST" },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Plug className="h-5 w-5 text-gray-500" />
          <h1 className="text-2xl font-bold text-gray-900">Salsify Debug</h1>
        </div>
        <p className="text-sm text-gray-500">
          Send live test requests to the Salsify API and inspect the raw response. Uses the credentials from Admin → Settings.
        </p>
      </div>

      {/* Config status */}
      <div className="flex items-center justify-between text-xs text-gray-400 font-mono bg-gray-50 border rounded px-3 py-2">
        <div className="space-x-4">
          <span>Config: <span className={configured ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{configured ? "enabled" : "not configured"}</span></span>
          {orgId && <span>Org ID: <span className="text-gray-700">{orgId}</span></span>}
          <span>Salsify-enabled attrs: <span className="text-gray-700">{loadingAttrs ? "…" : attrs.length}</span></span>
        </div>
        <button onClick={loadAttrs} disabled={loadingAttrs} className="hover:text-gray-700 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loadingAttrs ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Configured attrs reference table */}
      {attrs.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Configured Salsify Attributes</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-2 font-semibold text-gray-500">Label</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500">Key</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500">Salsify Property ID</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500">Locale</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500">Max Values</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {attrs.map((a) => (
                  <tr key={a.key} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{a.label}</td>
                    <td className="px-4 py-2 font-mono text-gray-500">{a.key}</td>
                    <td className="px-4 py-2 font-mono text-blue-700">{a.propertyId}</td>
                    <td className="px-4 py-2">
                      {a.locale
                        ? <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-mono">{a.locale}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{a.maxValues}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inputs */}
      <div className="bg-white border rounded-lg p-4 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Product ID (Part Number / salsify:id)</label>
          <Input
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="e.g. 78834-TEST"
            className="font-mono text-sm max-w-xs"
          />
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-600">Payload mode:</label>
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button
              className={`px-3 py-1.5 transition-colors ${!useRawPayload ? "bg-blue-600 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              onClick={() => setUseRawPayload(false)}
            >
              Guided (per attribute)
            </button>
            <button
              className={`px-3 py-1.5 transition-colors ${useRawPayload ? "bg-blue-600 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              onClick={() => setUseRawPayload(true)}
            >
              Raw JSON override
            </button>
          </div>
        </div>

        {!useRawPayload ? (
          /* Guided: per-attribute inputs */
          attrs.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Enter test values for each attribute. The server automatically applies locale wrapping (e.g. <code className="bg-gray-100 px-1 rounded">{`{ "en-US": "value" }`}</code>) where configured.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {attrs.map((a) => (
                  <div key={a.key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {a.label}
                      {a.locale && (
                        <span className="ml-1.5 text-purple-600 font-mono text-[10px]">→ {`{ "${a.locale}": value }`}</span>
                      )}
                    </label>
                    <Input
                      value={values[a.key] ?? ""}
                      onChange={(e) => setValue(a.key, e.target.value)}
                      placeholder={`${a.propertyId}${a.locale ? ` (localizable)` : ""}`}
                      className="text-sm font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              No Salsify-enabled attributes found. Go to Admin → Attributes to enable Salsify on your attributes and configure their Property IDs.
            </p>
          )
        ) : (
          /* Raw JSON override */
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Raw JSON Payload</label>
            <p className="text-xs text-gray-500 mb-2">
              Bypasses guided inputs and locale wrapping. The exact JSON you enter will be sent to Salsify (with <code className="bg-gray-100 px-1 rounded">salsify:id</code> prepended unless you include it yourself).
            </p>
            <textarea
              value={rawPayloadText}
              onChange={(e) => { setRawPayloadText(e.target.value); setRawPayloadError(null); }}
              rows={8}
              placeholder={`{\n  "Part Number": "78834-TEST",\n  "Item Name": { "en-US": "Test Product" }\n}`}
              className="w-full font-mono text-xs border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
            {rawPayloadError && <p className="text-xs text-red-600 mt-1">{rawPayloadError}</p>}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ACTIONS.map(({ action, label, desc }) => (
          <button
            key={action}
            onClick={() => run(action)}
            disabled={loading || !configured}
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

      {/* Headers reference */}
      {safeHeaders && (
        <div className="bg-gray-50 border rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Request Headers Used</p>
          <pre className="text-xs font-mono text-gray-700">{JSON.stringify(safeHeaders, null, 2)}</pre>
        </div>
      )}

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
