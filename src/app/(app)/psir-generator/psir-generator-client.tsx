"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Save, Search, FolderOpen, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tokenized } from "@/components/psir/tokenized";
import { categoryPaths, type CategoryOption } from "@/lib/psir-categories";
import { extractTokens, numberPsirDataLines, PSIR_SHEETS, type ResolvedPsirLine } from "@/lib/psir-template";
import { formatDateTime } from "@/lib/utils";

type SavedProduct = {
  id: string;
  partNumber: string;
  description: string | null;
  categoryId: string;
  tokenValues: Record<string, string>;
  updatedAt: string;
  category: { id: string; name: string; parent: { id: string; name: string } | null };
  updatedBy: { name: string | null; email: string } | null;
  createdBy: { name: string | null; email: string };
};

type Group = { key: string; title: string; lines: (ResolvedPsirLine & { number?: string })[]; tokens: string[] };

const NONE = "__none__";

export function PsirGeneratorClient({ categories }: { categories: CategoryOption[] }) {
  const paths = useMemo(() => categoryPaths(categories), [categories]);
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const topLevel = paths.filter((p) => p.depth === 0);

  const [topId, setTopId] = useState("");
  const [subId, setSubId] = useState(NONE);
  const [resolved, setResolved] = useState<{ categoryId: string; lines: ResolvedPsirLine[] } | null>(null);
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"export" | "save" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<SavedProduct[]>([]);
  const [search, setSearch] = useState("");

  const subOptions = useMemo(() => {
    if (!topId) return [];
    const top = paths.find((p) => p.id === topId);
    return paths.filter((p) => p.id !== topId && top && p.label.startsWith(`${top.label} > `));
  }, [paths, topId]);

  const categoryId = subId !== NONE ? subId : topId;

  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    fetch(`/api/psir-generator/resolve?categoryId=${categoryId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => { if (!cancelled) setResolved({ categoryId, lines: data.lines }); })
      .catch(() => {
        if (cancelled) return;
        setResolved({ categoryId, lines: [] });
        setMessage({ kind: "error", text: "Could not load the PSIR template for that category." });
      });
    return () => { cancelled = true; };
  }, [categoryId]);

  const loadingLines = !!categoryId && resolved?.categoryId !== categoryId;
  const lines = useMemo(() => (resolved && resolved.categoryId === categoryId ? resolved.lines : []), [resolved, categoryId]);

  const loadSaved = useCallback(async (q: string) => {
    const res = await fetch(`/api/psir-generator/products${q ? `?search=${encodeURIComponent(q)}` : ""}`);
    if (res.ok) setSaved(await res.json());
  }, []);
  useEffect(() => {
    fetch("/api/psir-generator/products")
      .then((r) => (r.ok ? r.json() : []))
      .then(setSaved)
      .catch(() => {});
  }, []);

  // Each token is shown once, in the first group that uses it.
  const groups = useMemo<Group[]>(() => {
    const seen = new Set<string>();
    const out: Group[] = [];
    const push = (key: string, title: string, gl: Group["lines"]) => {
      const tokens = extractTokens(gl.flatMap((l) => [l.requirement, l.actualFindings])).filter((t) => !seen.has(t));
      tokens.forEach((t) => seen.add(t));
      if (gl.length) out.push({ key, title, lines: gl, tokens });
    };
    for (const s of numberPsirDataLines(lines)) push(`data-${s.number}`, `${s.number}. ${s.name}`, s.lines);
    for (const sheet of PSIR_SHEETS.filter((s) => s.key !== "PSIR_DATA")) {
      push(sheet.key, sheet.label, lines.filter((l) => l.sheet === sheet.key));
    }
    return out;
  }, [lines]);

  const allTokens = groups.flatMap((g) => g.tokens);
  const filled = allTokens.filter((t) => values[t]?.trim()).length;

  function selectCategory(id: string) {
    const cat = byId.get(id);
    if (!cat) return;
    const chain: string[] = [];
    let cur: CategoryOption | undefined = cat;
    while (cur) { chain.unshift(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
    setTopId(chain[0]);
    setSubId(chain.length > 1 ? id : NONE);
  }

  async function exportXlsx() {
    setBusy("export");
    setMessage(null);
    try {
      const res = await fetch("/api/psir-generator/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, partNumber, description, tokenValues: values }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export failed");
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "PSIR.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function saveProduct() {
    setBusy("save");
    setMessage(null);
    try {
      const tokenValues = Object.fromEntries(allTokens.filter((t) => values[t]?.trim()).map((t) => [t, values[t].trim()]));
      const res = await fetch("/api/psir-generator/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partNumber, description, categoryId, tokenValues }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      setMessage({ kind: "ok", text: `Saved ${partNumber.trim()} to the PSIR Product Database.` });
      loadSaved(search);
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function openSaved(p: SavedProduct) {
    selectCategory(p.categoryId);
    setPartNumber(p.partNumber);
    setDescription(p.description ?? "");
    setValues(p.tokenValues ?? {});
    setMessage({ kind: "ok", text: `Loaded ${p.partNumber}.` });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteSaved(p: SavedProduct) {
    if (!confirm(`Delete ${p.partNumber} from the PSIR Product Database?`)) return;
    await fetch(`/api/psir-generator/products/${encodeURIComponent(p.partNumber)}`, { method: "DELETE" });
    loadSaved(search);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
            <Select value={topId} onValueChange={(v) => { setTopId(v); setSubId(NONE); }}>
              <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
              <SelectContent>
                {topLevel.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Sub-Category</label>
            <Select value={subId} onValueChange={setSubId} disabled={!topId || subOptions.length === 0}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{subOptions.length ? "None (use category template)" : "No sub-categories"}</SelectItem>
                {subOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label.split(" > ").slice(1).join(" > ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Part Number <span className="text-gray-400 font-normal">(optional)</span></label>
            <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="e.g. 13001" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Product Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. SPY-CSB-7-1/4, 24T Framing" />
          </div>
        </div>

        {message && (
          <div className={message.kind === "error"
            ? "rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            : "rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800"}>
            {message.text}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={exportXlsx} disabled={!categoryId || busy !== null || loadingLines}>
            <Download className="h-4 w-4 mr-1.5" /> {busy === "export" ? "Generating…" : "Export PSIR"}
          </Button>
          {partNumber.trim() && (
            <Button variant="outline" onClick={saveProduct} disabled={!categoryId || busy !== null}>
              <Save className="h-4 w-4 mr-1.5" /> {busy === "save" ? "Saving…" : "Save to PSIR Product Database"}
            </Button>
          )}
          {categoryId && !loadingLines && (
            <span className="text-sm text-gray-500">
              {lines.length} lines · {filled}/{allTokens.length} fields filled. Unfilled fields export as {"{Field Name}"}.
            </span>
          )}
        </div>
      </div>

      {categoryId && (loadingLines ? (
        <p className="text-sm text-gray-500">Loading template…</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-gray-500">No PSIR lines are configured for this category yet. Add them in Admin &gt; PSIR Templates.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.key} className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setOpen({ ...open, [g.key]: !open[g.key] })}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                {open[g.key] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                <span className="text-sm font-semibold text-gray-900 flex-1">{g.title}</span>
                <Badge variant="secondary">{g.lines.length} lines</Badge>
                {g.tokens.length > 0 && (
                  <Badge variant={g.tokens.every((t) => values[t]?.trim()) ? "success" : "default"}>
                    {g.tokens.filter((t) => values[t]?.trim()).length}/{g.tokens.length} fields
                  </Badge>
                )}
              </button>
              {g.tokens.length > 0 && (
                <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                  {g.tokens.map((t) => (
                    <div key={t}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t}</label>
                      <Input value={values[t] ?? ""} onChange={(e) => setValues({ ...values, [t]: e.target.value })} />
                    </div>
                  ))}
                </div>
              )}
              {open[g.key] && (
                <div className="border-t border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {g.lines.map((l) => (
                        <tr key={l.id} className="border-t border-gray-100 first:border-t-0 align-top">
                          {l.number && <td className="px-4 py-2 text-gray-500 w-12">{l.number}</td>}
                          <td className="px-4 py-2 font-medium text-gray-900 whitespace-pre-line w-56">{l.name}</td>
                          <td className="px-4 py-2 text-gray-700 whitespace-pre-line"><Tokenized text={l.requirement} values={values} /></td>
                          <td className="px-4 py-2 text-gray-500 whitespace-pre-line w-48"><Tokenized text={l.actualFindings} values={values} /></td>
                          <td className="px-4 py-2 text-gray-500 whitespace-nowrap w-28">{l.samplingLevel}</td>
                          <td className="px-4 py-2 text-gray-500 w-14">{l.aql}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">PSIR Product Database</h2>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); loadSaved(search); }}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search part number or description" className="w-72" />
            <Button type="submit" variant="outline" size="icon" title="Search"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        {saved.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">No saved PSIR products.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Part Number", "Description", "Category", "Updated", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {saved.map((p) => (
                  <tr key={p.id} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.partNumber}</td>
                    <td className="px-4 py-3 text-gray-700">{p.description}</td>
                    <td className="px-4 py-3 text-gray-700">{p.category.parent ? `${p.category.parent.name} > ` : ""}{p.category.name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDateTime(p.updatedAt)} · {(p.updatedBy ?? p.createdBy).name ?? (p.updatedBy ?? p.createdBy).email}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => openSaved(p)}><FolderOpen className="h-4 w-4 mr-1" /> Open</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteSaved(p)} title="Delete"><Trash2 className="h-4 w-4 text-gray-400" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
