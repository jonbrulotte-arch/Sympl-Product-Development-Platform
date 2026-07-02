"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { KeyRound, Copy, Check, Trash2 } from "lucide-react";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

type Token = {
  id: string; name: string; scope: string;
  lastUsedAt: string | null; createdAt: string;
  createdBy: { name: string | null; email: string };
};

export function ApiTokensClient() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    fetch("/api/admin/api-tokens").then((r) => r.json()).then((d) => Array.isArray(d) && setTokens(d)).catch(() => {});
  };
  useEffect(load, []);

  const create = async () => {
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
      load();
    }
    setCreating(false);
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this token? Any integration using it will stop working immediately.")) return;
    await fetch("/api/admin/api-tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const copyToken = async () => {
    if (!newToken) return;
    const ok = await copyToClipboard(newToken.token);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      window.prompt("Copy this token:", newToken.token);
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
          <p className="text-xs text-gray-500">Read-only tokens for external tools (ERP, BI) to pull product data</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Create Token</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Token name — e.g. PowerBI Reports"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <Button onClick={create} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </div>

          {newToken && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-amber-800">
                Token created for &quot;{newToken.name}&quot; — copy it now, it will not be shown again:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-white border border-amber-200 rounded px-2 py-1.5 break-all">{newToken.token}</code>
                <Button size="sm" variant="outline" onClick={copyToken}>
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-xs text-amber-700">
                Usage: <code className="bg-white px-1 rounded">curl -H &quot;Authorization: Bearer {"<token>"}&quot; https://your-server/api/products</code>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Active Tokens</CardTitle></CardHeader>
        <CardContent className="p-0">
          {tokens.length === 0 && <p className="text-sm text-gray-400 px-6 py-6">No active tokens.</p>}
          <div className="divide-y divide-gray-100">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-6 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-400">
                    {t.scope} · created {formatDate(t.createdAt)} by {t.createdBy.name ?? t.createdBy.email}
                    {t.lastUsedAt ? ` · last used ${formatDate(t.lastUsedAt)}` : " · never used"}
                  </p>
                </div>
                <button onClick={() => revoke(t.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400" title="Revoke">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
