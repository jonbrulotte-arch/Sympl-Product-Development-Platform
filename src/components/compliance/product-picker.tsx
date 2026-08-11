"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search } from "lucide-react";

export type ProductRef = {
  id: string; partNumber: string | null; itemName: string | null; brand: string | null;
  project: { id: string; name: string };
};

// Search / paste / .xlsx-upload picker shared by the compliance and inspection
// create + edit flows. Callers just render it and read from `selected` — the
// component owns all the network lookups.
export function ProductPicker({
  selected,
  onChange,
}: {
  selected: { id: string; label: string }[];
  onChange: (products: { id: string; label: string }[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductRef[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteStatus, setPasteStatus] = useState<{ found: number; notFound: string[] } | null>(null);
  const [looking, setLooking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Live search
  useEffect(() => {
    if (!search.trim()) { setResults([]); setShowDropdown(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/products?search=${encodeURIComponent(search.trim())}`);
      if (res.ok) {
        const data = await res.json();
        const products: ProductRef[] = data.data ?? [];
        // filter out already-selected
        setResults(products.filter((p) => !selected.find((s) => s.id === p.id)));
        setShowDropdown(true);
      }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [search, selected]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function pick(p: ProductRef) {
    const label = [p.partNumber, p.itemName].filter(Boolean).join(" — ");
    onChange([...selected, { id: p.id, label }]);
    setSearch("");
    setResults([]);
    setShowDropdown(false);
  }

  async function resolvePaste() {
    const tokens = pasteText
      .split(/[\n,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tokens.length) return;
    setLooking(true);
    setPasteStatus(null);

    const notFound: string[] = [];
    const toAdd: { id: string; label: string }[] = [];
    const selectedIds = new Set(selected.map((s) => s.id));

    await Promise.all(
      tokens.map(async (token) => {
        const res = await fetch(`/api/products?search=${encodeURIComponent(token)}`);
        if (!res.ok) { notFound.push(token); return; }
        const data = await res.json();
        const products: ProductRef[] = data.data ?? [];
        // exact part-number match preferred, otherwise first result
        const match = products.find((p) => p.partNumber?.toLowerCase() === token.toLowerCase()) ?? products[0];
        if (!match || selectedIds.has(match.id)) {
          if (!match) notFound.push(token);
          return;
        }
        selectedIds.add(match.id);
        toAdd.push({ id: match.id, label: [match.partNumber, match.itemName].filter(Boolean).join(" — ") });
      })
    );

    onChange([...selected, ...toAdd]);
    setPasteStatus({ found: toAdd.length, notFound });
    setLooking(false);
    if (!notFound.length) { setPasteMode(false); setPasteText(""); }
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      {/* Mode toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { setPasteMode(false); setPasteText(""); setPasteStatus(null); }}
          className={`text-xs font-medium pb-0.5 border-b-2 transition-colors ${!pasteMode ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => { setPasteMode(true); setSearch(""); setResults([]); setShowDropdown(false); }}
          className={`text-xs font-medium pb-0.5 border-b-2 transition-colors ${pasteMode ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Paste / Bulk
        </button>
      </div>

      {!pasteMode ? (
        /* Search mode */
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <Input
            className="pl-8 text-sm text-gray-900 placeholder:text-gray-400"
            placeholder="Search by part number or product name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            autoComplete="off"
          />
          {showDropdown && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-500">No products found for &ldquo;{search}&rdquo;</p>
              ) : results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-gray-500 shrink-0">{p.partNumber ?? "—"}</span>
                    <span className="text-gray-900 truncate">{p.itemName ?? ""}</span>
                  </span>
                  <span className="text-xs text-gray-500 shrink-0">{p.project.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Paste mode */
        <div className="space-y-2">
          <textarea
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setPasteStatus(null); }}
            rows={4}
            placeholder={"Paste part numbers — one per line, or comma/semicolon separated:\n78834-TEST\n90012-DEMO\n11234-WIDGET"}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {pasteStatus && (
            <div className={`text-xs rounded px-3 py-2 ${pasteStatus.notFound.length ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
              {pasteStatus.found > 0 && <span>{pasteStatus.found} product{pasteStatus.found !== 1 ? "s" : ""} added. </span>}
              {pasteStatus.notFound.length > 0 && (
                <span>Could not find: <strong>{pasteStatus.notFound.join(", ")}</strong></span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={resolvePaste} disabled={looking || !pasteText.trim()}>
              {looking ? "Looking up…" : "Add Products"}
            </Button>
            <label className="text-xs text-indigo-600 hover:text-indigo-800 cursor-pointer underline">
              or upload .xlsx
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const fd = new FormData();
                  fd.append("file", f);
                  const res = await fetch("/api/parse-part-numbers", { method: "POST", body: fd });
                  if (res.ok) {
                    const { partNumbers } = await res.json();
                    setPasteText((prev) => [prev.trim(), ...partNumbers].filter(Boolean).join("\n"));
                    setPasteStatus(null);
                  }
                }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selected.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {s.label}
              <button type="button" onClick={() => onChange(selected.filter((x) => x.id !== s.id))} className="text-indigo-400 hover:text-indigo-700">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
