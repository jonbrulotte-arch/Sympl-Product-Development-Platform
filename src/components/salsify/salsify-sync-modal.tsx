"use client";

import { useState, useEffect } from "react";
import { Zap, RefreshCw, X, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

type SalsifyAttr = {
  id: string;
  key: string;
  label: string;
  salsifyPropertyId: string | null;
  section: { name: string } | null;
};

type Props = {
  /** "project" syncs all products in the project; "product" syncs a single product */
  mode: "project" | "product";
  /** Scopes category-specific attributes to this project's category tree */
  projectId?: string;
  /** When set, shows how many selected products will sync instead of "all" */
  syncProductCount?: number;
  onConfirm: (skipKeys: string[]) => void;
  onClose: () => void;
  syncing: boolean;
};

export function SalsifySyncModal({ mode, projectId, syncProductCount, onConfirm, onClose, syncing }: Props) {
  const [attrs, setAttrs] = useState<SalsifyAttr[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/attributes?salsifyOnly=true${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}`)
      .then((r) => r.json())
      .then((data: SalsifyAttr[]) => {
        setAttrs(data);
        setChecked(new Set(data.map((a) => a.key)));
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (checked.size === attrs.length) setChecked(new Set());
    else setChecked(new Set(attrs.map((a) => a.key)));
  }

  // Group by section
  const groups = attrs.reduce<Record<string, SalsifyAttr[]>>((acc, attr) => {
    const sec = attr.section?.name ?? "General";
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(attr);
    return acc;
  }, {});

  const skipKeys = attrs.filter((a) => !checked.has(a.key)).map((a) => a.key);
  const selectedCount = checked.size;
  const allChecked = checked.size === attrs.length;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center">
            <Zap className="h-4 w-4 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Sync to Salsify</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {mode === "product"
                ? "This product will be synced. Existing Salsify data for checked attributes will be overwritten."
                : syncProductCount != null
                  ? `${syncProductCount} selected product${syncProductCount !== 1 ? "s" : ""} will be synced. Existing Salsify data for checked attributes will be overwritten.`
                  : "All products in this project will be synced. Existing Salsify data for checked attributes will be overwritten."}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Attribute list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Loading attributes…</div>
          ) : attrs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No Salsify-enabled attributes found.<br />Enable Salsify on attributes in Admin → Attributes.</div>
          ) : (
            <div className="space-y-4">
              {/* Select all */}
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {allChecked
                  ? <CheckSquare className="h-4 w-4" />
                  : <Square className="h-4 w-4" />}
                {allChecked ? "Deselect all" : "Select all"}
              </button>

              {Object.entries(groups).map(([section, sectionAttrs]) => (
                <div key={section}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{section}</p>
                  <div className="space-y-1">
                    {sectionAttrs.map((attr) => (
                      <label
                        key={attr.key}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked.has(attr.key)}
                          onChange={() => toggle(attr.key)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="text-sm text-gray-800 font-medium">{attr.label}</span>
                          {attr.salsifyPropertyId && (
                            <span className="ml-2 text-xs text-gray-400 font-mono">→ {attr.salsifyPropertyId}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-500">
            {selectedCount} of {attrs.length} attribute{attrs.length !== 1 ? "s" : ""} will sync
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={syncing}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => onConfirm(skipKeys)}
              disabled={syncing || selectedCount === 0 || loading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : `Sync ${selectedCount} attribute${selectedCount !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
