"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import {
  KeyRound, Copy, Check, Trash2, Terminal, Database, RefreshCw,
} from "lucide-react";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

// Sympl issues two families of API token. They serve unrelated purposes and
// used to live in two unrelated places, which made both hard to find.
//
// - Read-Only Data Tokens (spt_): scoped to `read:products`. Live here.
// - Automation Tokens (sbk_): trigger the backup and cron endpoints. Used to
//   live on Admin -> Backup & Restore; moved here so both kinds are in one
//   place with matching docs.

type DataToken = {
  id: string; name: string; scope: string;
  lastUsedAt: string | null; createdAt: string;
  createdBy: { name: string | null; email: string };
};

export function ApiTokensClient() {
  // ── Read-only data tokens ────────────────────────────────────────────────
  const [tokens, setTokens] = useState<DataToken[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [copiedNew, setCopiedNew] = useState(false);

  // ── Automation token (single, for backups & cron) ────────────────────────
  const [hasAutomationToken, setHasAutomationToken] = useState(false);
  const [newAutomation, setNewAutomation] = useState<string | null>(null);
  const [autoWorking, setAutoWorking] = useState(false);
  const [copiedAuto, setCopiedAuto] = useState(false);

  const loadTokens = () =>
    fetch("/api/admin/api-tokens").then((r) => r.json()).then((d) => Array.isArray(d) && setTokens(d)).catch(() => {});
  const loadAutomation = () =>
    fetch("/api/admin/backup").then((r) => r.json()).then((d) => setHasAutomationToken(!!d?.config?.hasApiToken)).catch(() => {});

  useEffect(() => { loadTokens(); loadAutomation(); }, []);

  const createDataToken = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const res = await fetch("/api/admin/api-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewToken({ name: data.name, token: data.token });
      setName("");
      loadTokens();
    }
    setCreating(false);
  };

  const revokeDataToken = async (id: string) => {
    if (!confirm("Revoke this token? Any integration using it will stop working immediately.")) return;
    await fetch("/api/admin/api-tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadTokens();
  };

  const generateAutomation = async (rotating: boolean) => {
    if (rotating && !confirm("This replaces the current automation token. Any cron using it will stop working until you update its command."))
      return;
    setAutoWorking(true);
    const res = await fetch("/api/admin/backup/token", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setNewAutomation(data.token);
      setHasAutomationToken(true);
    }
    setAutoWorking(false);
  };

  const revokeAutomation = async () => {
    if (!confirm("Revoke the automation token? Backups and cron endpoints will stop accepting it immediately.")) return;
    setAutoWorking(true);
    await fetch("/api/admin/backup/token", { method: "DELETE" });
    setHasAutomationToken(false);
    setAutoWorking(false);
  };

  const copy = async (
    value: string,
    setCopied: (v: boolean) => void,
    label = "Copy this token:"
  ) => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      window.prompt(label, value);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
          <KeyRound className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">API Tokens</h1>
          <p className="text-xs text-gray-500">
            Two kinds of token, one page. Data tokens for read-only access; automation tokens for
            scheduled backups and cron endpoints.
          </p>
        </div>
      </div>

      {/* ─── Automation Token ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-base">Automation Token</CardTitle>
            <span className="text-[10px] font-mono uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">sbk_</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-gray-600 space-y-2">
            <p>
              Single token used by <strong>every scheduled job</strong> that hits the app from outside — the
              backup script, the overdue-check cron, and the weekly digest cron. There is only one
              at a time; generating a new one invalidates the previous.
            </p>
            <div className="text-xs bg-gray-50 border border-gray-200 rounded-md p-3 space-y-1.5">
              <p className="font-medium text-gray-700">Endpoints that accept it:</p>
              <ul className="space-y-0.5 pl-4 list-disc text-gray-600">
                <li><code className="font-mono bg-white px-1 rounded">POST /api/admin/backup/run</code> — trigger a backup</li>
                <li><code className="font-mono bg-white px-1 rounded">POST /api/cron/overdue-check</code> — overdue &amp; due-soon notifications</li>
                <li><code className="font-mono bg-white px-1 rounded">POST /api/cron/digest</code> — the weekly leadership digest</li>
              </ul>
              <p className="pt-1 text-gray-600">
                Pass it as <code className="font-mono bg-white px-1 rounded">Authorization: Bearer &lt;token&gt;</code>.
                See <strong>Admin → Backup &amp; Restore</strong> for the ready-made crontab line, and
                the README <em>Cron Jobs</em> section for the other two.
              </p>
            </div>
          </div>

          {newAutomation ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-amber-800">
                Copy this token now — it will not be shown again:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-white border border-amber-200 rounded px-2 py-1.5 break-all">
                  {newAutomation}
                </code>
                <Button size="sm" variant="outline" onClick={() => copy(newAutomation, setCopiedAuto)}>
                  {copiedAuto ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setNewAutomation(null)}>Done</Button>
              </div>
            </div>
          ) : hasAutomationToken ? (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-sm text-gray-700">
                <Check className="inline h-3.5 w-3.5 text-green-600 mr-1" />
                An automation token is active. Sympl only stores its hash, so it can&apos;t be shown
                again — regenerate below if you no longer have it.
              </p>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Button size="sm" variant="outline" disabled={autoWorking} onClick={() => generateAutomation(true)}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={autoWorking}
                  onClick={revokeAutomation}
                  className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Revoke
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                No automation token active. Generate one to run scheduled backups and cron endpoints
                from outside.
              </p>
              <Button size="sm" onClick={() => generateAutomation(false)} disabled={autoWorking}>
                <KeyRound className="h-3.5 w-3.5 mr-1" /> Generate Token
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Read-Only Data Tokens ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-base">Read-Only Data Tokens</CardTitle>
            <span className="text-[10px] font-mono uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">spt_</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-gray-600 space-y-2">
            <p>
              For ERP and BI systems that need to pull product data without a browser session. Each
              token is named, scoped to <code className="font-mono bg-gray-100 px-1 rounded">read:products</code>, and
              may be revoked independently.
            </p>
            <div className="text-xs bg-gray-50 border border-gray-200 rounded-md p-3 space-y-1.5">
              <p className="font-medium text-gray-700">Endpoints that accept it:</p>
              <ul className="space-y-0.5 pl-4 list-disc text-gray-600">
                <li><code className="font-mono bg-white px-1 rounded">GET /api/products</code> — every product the token can see</li>
              </ul>
              <p className="pt-1 text-gray-600">
                Pass it as <code className="font-mono bg-white px-1 rounded">Authorization: Bearer &lt;token&gt;</code>.
                A token authenticates as if it were an admin session, so the caller sees every project.
              </p>
              <p className="text-gray-600">
                Example:{" "}
                <code className="font-mono bg-white px-1 rounded">
                  curl -H &quot;Authorization: Bearer sptxxx&quot; https://your-server/api/products
                </code>
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Token name — e.g. PowerBI Reports"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createDataToken()}
            />
            <Button onClick={createDataToken} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create Token"}
            </Button>
          </div>

          {newToken && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-amber-800">
                Token created for &ldquo;{newToken.name}&rdquo; — copy it now, it will not be shown again:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-white border border-amber-200 rounded px-2 py-1.5 break-all">{newToken.token}</code>
                <Button size="sm" variant="outline" onClick={() => copy(newToken.token, setCopiedNew)}>
                  {copiedNew ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Active data tokens</p>
            {tokens.length === 0 ? (
              <p className="text-sm text-gray-400">No active tokens.</p>
            ) : (
              <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
                {tokens.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-400">
                        {t.scope} · created {formatDate(t.createdAt)} by {t.createdBy.name ?? t.createdBy.email}
                        {t.lastUsedAt ? ` · last used ${formatDate(t.lastUsedAt)}` : " · never used"}
                      </p>
                    </div>
                    <button
                      onClick={() => revokeDataToken(t.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-400"
                      title="Revoke"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
