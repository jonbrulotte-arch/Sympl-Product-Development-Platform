"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link2, Copy, Check, X, Trash2 } from "lucide-react";

type ActiveLink = { id: string; url: string; expiresAt: string };

// Creates and manages expiring read-only share links for a product or PSIR.
// Rendered only for ADMIN / PRODUCT_MANAGER (the API enforces it regardless).
export function ShareLinkButton({ entityType, entityId }: { entityType: "PRODUCT" | "PSIR"; entityId: string }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ActiveLink[]>([]);
  const [days, setDays] = useState(7);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadLinks = async () => {
    const res = await fetch(`/api/share-links?entityType=${entityType}&entityId=${entityId}`);
    if (res.ok) setLinks(await res.json());
  };

  const create = async () => {
    setCreating(true);
    const res = await fetch("/api/share-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId, expiresInDays: days }),
    });
    if (res.ok) await loadLinks();
    setCreating(false);
  };

  const revoke = async (id: string) => {
    await fetch("/api/share-links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadLinks();
  };

  const copy = async (link: ActiveLink) => {
    const fullUrl = `${window.location.origin}${link.url}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        onClick={() => { setOpen((o) => !o); if (!open) loadLinks(); }}
      >
        <Link2 className="h-3.5 w-3.5" />
        Share
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">Read-only share links</p>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Anyone with the link can view this {entityType === "PRODUCT" ? "product" : "inspection report"} — no account needed. Links expire automatically.
            </p>

            {links.length > 0 && (
              <div className="space-y-1.5">
                {links.map((l) => (
                  <div key={l.id} className="flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-100 rounded px-2 py-1.5">
                    <span className="flex-1 truncate font-mono text-gray-600">{l.url}</span>
                    <span className="text-gray-400 shrink-0">exp {new Date(l.expiresAt).toLocaleDateString()}</span>
                    <button onClick={() => copy(l)} className="p-1 rounded hover:bg-gray-200 text-gray-500" title="Copy link">
                      {copiedId === l.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => revoke(l.id)} className="p-1 rounded hover:bg-red-50 text-red-400" title="Revoke link">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value))}
                className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none"
              >
                <option value={7}>Expires in 7 days</option>
                <option value={30}>Expires in 30 days</option>
                <option value={90}>Expires in 90 days</option>
              </select>
              <Button size="sm" className="h-7 text-xs flex-1" onClick={create} disabled={creating}>
                {creating ? "Creating…" : "Create Link"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
