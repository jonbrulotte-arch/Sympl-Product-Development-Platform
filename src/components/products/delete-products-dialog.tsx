"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PreviewRow = {
  id: string;
  partNumber: string | null;
  itemName: string | null;
  projects: { id: string; name: string }[];
};

// Confirmation for permanently deleting catalog products, from the product
// page (one id) or the Products page (many). Shows every project the products
// will disappear from and requires typing a confirmation word.
export function DeleteProductsDialog({ ids, onClose, onDeleted }: {
  ids: string[];
  onClose: () => void;
  onDeleted: (result: { deleted: number }) => void;
}) {
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const idKey = ids.join(",");
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/products/delete-preview?ids=${encodeURIComponent(idKey)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) setError(data.error ?? "Could not load the products.");
        else setRows(data.products ?? []);
      })
      .catch(() => { if (!cancelled) setError("Could not reach the server."); });
    return () => { cancelled = true; };
  }, [idKey]);

  // A single product is confirmed by its part number; a batch by the word DELETE.
  const single = rows?.length === 1 ? rows[0] : null;
  const word = single?.partNumber || "DELETE";
  const inProjects = (rows ?? []).filter((r) => r.projects.length > 0);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    const res = single
      ? await fetch(`/api/products/${single.id}`, { method: "DELETE" })
      : await fetch("/api/products/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: (rows ?? []).map((r) => r.id) }),
        });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Delete failed.");
      setDeleting(false);
      return;
    }
    onDeleted({ deleted: data.deleted ?? 0 });
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center">
            <Trash2 className="h-4 w-4 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">
              {rows ? `Delete ${rows.length} product${rows.length !== 1 ? "s" : ""} permanently` : "Delete products"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">This can&apos;t be undone.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!rows && !error && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          )}
          {rows && (
            <>
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  The product record, its attribute values, comments and compliance/inspection links are deleted.
                  History entries are kept. It can only be recovered from a database backup.
                </span>
              </div>

              {inProjects.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <strong>{single ? (single.projects.length === 1 ? "This product is in a project" : `This product is in ${single.projects.length} projects`) : `${inProjects.length} of these ${inProjects.length === 1 ? "is" : "are"} in projects`}</strong> and will be removed from {single && single.projects.length === 1 ? "it" : "them"} too.
                </div>
              )}

              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {rows.map((r) => (
                  <div key={r.id} className="px-3 py-2 text-sm">
                    <p className="text-gray-900">
                      <span className="font-mono text-gray-600">{r.partNumber ?? "(no part number)"}</span>
                      {r.itemName && <span> · {r.itemName}</span>}
                    </p>
                    {r.projects.length > 0 && (
                      <p className="text-xs text-amber-700 mt-0.5">Also removed from: {r.projects.map((p) => p.name).join(", ")}</p>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="text-sm text-gray-700">
                  Type <span className="font-mono font-semibold">{word}</span> to confirm
                </label>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1" autoFocus />
              </div>
            </>
          )}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <Button variant="outline" size="sm" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button
            size="sm"
            onClick={confirmDelete}
            disabled={!rows || rows.length === 0 || deleting || typed.trim() !== word}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
            {deleting ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </div>
    </div>
  );
}
