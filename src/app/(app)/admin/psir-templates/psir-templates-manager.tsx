"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, EyeOff, Eye, RotateCcw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PSIR_SHEETS, type PsirSheetKey, type ResolvedPsirLine } from "@/lib/psir-template";
import { categoryPaths, type CategoryOption } from "@/lib/category-paths";
import { Tokenized } from "@/components/psir/tokenized";

type Section = { id: string; name: string; sortOrder: number; isActive: boolean };
type SamplingLevel = { id: string; label: string };

const GLOBAL = "__global__";

type EditorState =
  | { mode: "create"; sheet: PsirSheetKey; sectionId: string | null }
  | { mode: "edit"; line: ResolvedPsirLine }
  | { mode: "override"; line: ResolvedPsirLine };

type FormValues = { name: string; sectionId: string; requirement: string; actualFindings: string; samplingLevel: string; aql: string };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

export function PsirTemplatesManager({ categories }: { categories: CategoryOption[] }) {
  const [scope, setScope] = useState<string>(GLOBAL);
  const [lines, setLines] = useState<ResolvedPsirLine[]>([]);
  const [chainNames, setChainNames] = useState<string[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [levels, setLevels] = useState<SamplingLevel[]>([]);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const paths = useMemo(() => categoryPaths(categories), [categories]);
  const categoryId = scope === GLOBAL ? null : scope;

  const applyLines = useCallback((data: { lines: ResolvedPsirLine[]; chain: { name: string }[] }) => {
    setLines(data.lines);
    setChainNames(data.chain.map((c) => c.name));
    setError(null);
  }, []);

  const linesUrl = `/api/psir-templates/lines${categoryId ? `?categoryId=${categoryId}` : ""}`;
  const loadLines = useCallback(async () => applyLines(await send(linesUrl, "GET")), [applyLines, linesUrl]);

  const loadMeta = useCallback(async () => {
    const [s, l] = await Promise.all([send("/api/psir-templates/sections", "GET"), send("/api/psir-templates/sampling-levels", "GET")]);
    setSections(s);
    setLevels(l);
  }, []);

  useEffect(() => {
    let cancelled = false;
    send(linesUrl, "GET")
      .then((data) => { if (!cancelled) applyLines(data); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoadedScope(scope); });
    return () => { cancelled = true; };
  }, [linesUrl, scope, applyLines]);

  useEffect(() => {
    Promise.all([send("/api/psir-templates/sections", "GET"), send("/api/psir-templates/sampling-levels", "GET")])
      .then(([s, l]) => { setSections(s); setLevels(l); })
      .catch((e) => setError((e as Error).message));
  }, []);

  const loading = loadedScope !== scope;

  const isOwn = (l: ResolvedPsirLine) => l.originCategoryId === categoryId;

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await loadLines();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const toggleHidden = (l: ResolvedPsirLine) =>
    run(() => send("/api/psir-templates/overrides", "PUT", { ...l.ownOverride, lineId: l.id, categoryId, hidden: !l.hidden }));
  const resetOverride = (l: ResolvedPsirLine) =>
    run(() => send(`/api/psir-templates/overrides?lineId=${l.id}&categoryId=${categoryId}`, "DELETE"));
  const deleteLine = (l: ResolvedPsirLine) => {
    if (!confirm(`Delete "${l.name}"? Categories that override it lose their overrides too.`)) return;
    run(() => send(`/api/psir-templates/lines/${l.id}`, "DELETE"));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-96">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Scope</label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={GLOBAL}>Global (all categories)</SelectItem>
              {paths.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-gray-500 pb-2">
          {categoryId
            ? <>Showing what <span className="font-medium text-gray-700">{chainNames.join(" > ")}</span> inherits, plus its own lines. Overrides here apply to this category and everything under it.</>
            : "Global lines appear on every category's PSIR unless a category hides or overrides them."}
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Tabs defaultValue="PSIR_DATA">
        <TabsList>
          {PSIR_SHEETS.map((s) => <TabsTrigger key={s.key} value={s.key}>{s.label}</TabsTrigger>)}
          <TabsTrigger value="settings">Sections &amp; Sampling</TabsTrigger>
        </TabsList>

        {PSIR_SHEETS.map((sheet) => {
          const sheetLines = lines.filter((l) => l.sheet === sheet.key);
          const groups =
            sheet.key === "PSIR_DATA"
              ? sections.filter((s) => s.isActive).map((s) => ({ id: s.id as string | null, name: s.name, lines: sheetLines.filter((l) => l.sectionId === s.id) }))
              : [{ id: null, name: "", lines: sheetLines }];
          return (
            <TabsContent key={sheet.key} value={sheet.key} className="space-y-4">
              {sheet.key !== "PSIR_DATA" && (
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setEditor({ mode: "create", sheet: sheet.key, sectionId: null })}>
                    <Plus className="h-4 w-4 mr-1" /> Add line
                  </Button>
                </div>
              )}
              {loading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : (
                groups.map((g) => (
                  <div key={g.id ?? "all"} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                    {sheet.key === "PSIR_DATA" && (
                      <div className="flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-200">
                        <span className="text-sm font-semibold text-gray-900">{g.name}</span>
                        <Button size="sm" variant="ghost" onClick={() => setEditor({ mode: "create", sheet: sheet.key, sectionId: g.id })}>
                          <Plus className="h-4 w-4 mr-1" /> Add line
                        </Button>
                      </div>
                    )}
                    <LineTable
                      sheet={sheet}
                      lines={g.lines}
                      scoped={!!categoryId}
                      isOwn={isOwn}
                      onEdit={(l) => setEditor(isOwn(l) ? { mode: "edit", line: l } : { mode: "override", line: l })}
                      onDelete={deleteLine}
                      onToggleHidden={toggleHidden}
                      onReset={resetOverride}
                    />
                  </div>
                ))
              )}
            </TabsContent>
          );
        })}

        <TabsContent value="settings">
          <div className="grid gap-6 md:grid-cols-2">
            <SectionsManager sections={sections} onChange={async () => { await loadMeta(); await loadLines(); }} onError={setError} />
            <SamplingManager levels={levels} onChange={loadMeta} onError={setError} />
          </div>
        </TabsContent>
      </Tabs>

      {editor && (
        <LineEditor
          state={editor}
          categoryId={categoryId}
          sections={sections}
          levels={levels}
          onClose={() => setEditor(null)}
          onSaved={async () => { setEditor(null); await loadLines(); }}
        />
      )}
    </div>
  );
}

function LineTable({
  sheet, lines, scoped, isOwn, onEdit, onDelete, onToggleHidden, onReset,
}: {
  sheet: (typeof PSIR_SHEETS)[number];
  lines: ResolvedPsirLine[];
  scoped: boolean;
  isOwn: (l: ResolvedPsirLine) => boolean;
  onEdit: (l: ResolvedPsirLine) => void;
  onDelete: (l: ResolvedPsirLine) => void;
  onToggleHidden: (l: ResolvedPsirLine) => void;
  onReset: (l: ResolvedPsirLine) => void;
}) {
  if (lines.length === 0) return <p className="px-4 py-3 text-sm text-gray-400">No lines.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {[sheet.nameLabel, sheet.requirementLabel, sheet.findingsLabel, "Sampling", "AQL", "Source", ""].map((h) => (
              <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const own = isOwn(l);
            const hasOverride = !!l.ownOverride;
            return (
              <tr key={l.id} className={`border-t border-gray-200 align-top hover:bg-gray-50 ${l.hidden ? "opacity-50" : ""}`}>
                <td className="px-4 py-2 font-medium text-gray-900 whitespace-pre-line min-w-40">{l.name}</td>
                <td className="px-4 py-2 text-gray-700 whitespace-pre-line min-w-64"><Tokenized text={l.requirement} /></td>
                <td className="px-4 py-2 text-gray-700 whitespace-pre-line min-w-40"><Tokenized text={l.actualFindings} /></td>
                <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{l.samplingLevel}</td>
                <td className="px-4 py-2 text-gray-700">{l.aql}</td>
                <td className="px-4 py-2 space-y-1 min-w-32">
                  <Badge variant={l.originCategoryId ? "purple" : "secondary"}>{l.originName}</Badge>
                  {l.hidden && <Badge variant="warning" className="ml-1">Hidden</Badge>}
                  {!own && l.overriddenFields.length > 0 && (
                    <Badge variant={hasOverride ? "default" : "outline"} className="ml-1" title={l.overriddenFields.join(", ")}>
                      {hasOverride ? "Overridden here" : "Overridden above"}
                    </Badge>
                  )}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-right">
                  <IconBtn title={own ? "Edit" : "Override for this category"} onClick={() => onEdit(l)}>
                    {own ? <Pencil className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                  </IconBtn>
                  {scoped && !own && (
                    <IconBtn title={l.hidden ? "Show (mark applicable)" : "Hide (not applicable)"} onClick={() => onToggleHidden(l)}>
                      {l.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </IconBtn>
                  )}
                  {scoped && !own && hasOverride && (
                    <IconBtn title="Reset to inherited" onClick={() => onReset(l)}><RotateCcw className="h-4 w-4" /></IconBtn>
                  )}
                  {own && (
                    <IconBtn title="Delete" onClick={() => onDelete(l)} danger><Trash2 className="h-4 w-4" /></IconBtn>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded-md text-gray-400 hover:bg-gray-100 ${danger ? "hover:text-red-600" : "hover:text-gray-700"}`}
    >
      {children}
    </button>
  );
}

function LineEditor({
  state, categoryId, sections, levels, onClose, onSaved,
}: {
  state: EditorState;
  categoryId: string | null;
  sections: Section[];
  levels: SamplingLevel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const line = state.mode === "create" ? null : state.line;
  const sheet = state.mode === "create" ? state.sheet : state.line.sheet;
  const own = state.mode === "override" ? state.line.ownOverride : null;
  const [v, setV] = useState<FormValues>(() =>
    state.mode === "override"
      ? { name: line!.name, sectionId: line!.sectionId ?? "", requirement: own?.requirement ?? "", actualFindings: own?.actualFindings ?? "", samplingLevel: own?.samplingLevel ?? "", aql: own?.aql ?? "" }
      : { name: line?.name ?? "", sectionId: (state.mode === "create" ? state.sectionId : line?.sectionId) ?? "", requirement: line?.requirement ?? "", actualFindings: line?.actualFindings ?? "", samplingLevel: line?.samplingLevel ?? "", aql: line?.aql ?? "" },
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sheetMeta = PSIR_SHEETS.find((s) => s.key === sheet)!;
  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      if (state.mode === "create") {
        await send("/api/psir-templates/lines", "POST", { ...v, sheet, categoryId, sectionId: v.sectionId || null });
      } else if (state.mode === "edit") {
        await send(`/api/psir-templates/lines/${state.line.id}`, "PATCH", { ...v, sectionId: sheet === "PSIR_DATA" ? v.sectionId : undefined });
      } else {
        await send("/api/psir-templates/overrides", "PUT", {
          lineId: state.line.id, categoryId, hidden: own?.hidden ?? null,
          requirement: v.requirement, actualFindings: v.actualFindings, samplingLevel: v.samplingLevel, aql: v.aql,
        });
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inherit = state.mode === "override";
  const ph = (val: string | null | undefined) => (inherit ? `Inherit: ${val ?? "(blank)"}` : undefined);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {state.mode === "create" ? `Add ${sheetMeta.label} line` : state.mode === "edit" ? "Edit line" : `Override "${line!.name}"`}
          </DialogTitle>
          <DialogDescription>
            {inherit
              ? "Leave a field blank to inherit it. Overrides apply to this category and its sub-categories."
              : "Use {Token Name} in Requirement or Actual Findings to create a fill-in field on the PSIR Generator."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!inherit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{sheetMeta.nameLabel}</label>
              <Textarea rows={1} value={v.name} onChange={set("name")} />
            </div>
          )}
          {!inherit && sheet === "PSIR_DATA" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Section</label>
              <Select value={v.sectionId} onValueChange={(sectionId) => setV({ ...v, sectionId })}>
                <SelectTrigger><SelectValue placeholder="Choose a section" /></SelectTrigger>
                <SelectContent>
                  {sections.filter((s) => s.isActive).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{sheetMeta.requirementLabel}</label>
            <Textarea rows={3} value={v.requirement} onChange={set("requirement")} placeholder={ph(line?.requirement)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{sheetMeta.findingsLabel}</label>
            <Textarea rows={2} value={v.actualFindings} onChange={set("actualFindings")} placeholder={ph(line?.actualFindings)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Sampling Level</label>
              <Input list="psir-sampling-levels" value={v.samplingLevel} onChange={set("samplingLevel")} placeholder={ph(line?.samplingLevel) ?? "Pick or type"} />
              <datalist id="psir-sampling-levels">
                {levels.map((l) => <option key={l.id} value={l.label} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">AQL</label>
              <Input value={v.aql} onChange={set("aql")} placeholder={ph(line?.aql)} />
            </div>
          </div>
          {err && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{err}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || (!inherit && (!v.name.trim() || (sheet === "PSIR_DATA" && !v.sectionId)))}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionsManager({ sections, onChange, onError }: { sections: Section[]; onChange: () => Promise<void>; onError: (m: string) => void }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await onChange(); } catch (e) { onError((e as Error).message); }
  }
  const move = (i: number, dir: -1 | 1) => {
    const a = sections[i], b = sections[i + dir];
    if (!a || !b) return;
    act(() => Promise.all([
      send(`/api/psir-templates/sections/${a.id}`, "PATCH", { sortOrder: b.sortOrder }),
      send(`/api/psir-templates/sections/${b.id}`, "PATCH", { sortOrder: a.sortOrder }),
    ]));
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <h2 className="text-base font-semibold text-gray-900">PSIR Data Sections</h2>
      <p className="text-xs text-gray-500">Sections are numbered in this order on the export (1, 2, 3 …). Empty sections are skipped.</p>
      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
        {sections.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            {editing?.id === s.id ? (
              <>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8" />
                <Button size="sm" onClick={() => act(async () => { await send(`/api/psir-templates/sections/${s.id}`, "PATCH", { name: editing.name }); setEditing(null); })}>Save</Button>
              </>
            ) : (
              <>
                <span className={`flex-1 ${s.isActive ? "text-gray-900" : "text-gray-400 line-through"}`}>{s.name}</span>
                <IconBtn title="Move up" onClick={() => move(i, -1)}>↑</IconBtn>
                <IconBtn title="Move down" onClick={() => move(i, 1)}>↓</IconBtn>
                <IconBtn title="Rename" onClick={() => setEditing({ id: s.id, name: s.name })}><Pencil className="h-4 w-4" /></IconBtn>
                <IconBtn title={s.isActive ? "Deactivate" : "Activate"} onClick={() => act(() => send(`/api/psir-templates/sections/${s.id}`, "PATCH", { isActive: !s.isActive }))}>
                  {s.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </IconBtn>
                <IconBtn title="Delete" danger onClick={() => confirm(`Delete section "${s.name}"?`) && act(() => send(`/api/psir-templates/sections/${s.id}`, "DELETE"))}>
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New section name" />
        <Button disabled={!name.trim()} onClick={() => act(async () => { await send("/api/psir-templates/sections", "POST", { name }); setName(""); })}>Add</Button>
      </div>
    </div>
  );
}

function SamplingManager({ levels, onChange, onError }: { levels: SamplingLevel[]; onChange: () => Promise<void>; onError: (m: string) => void }) {
  const [label, setLabel] = useState("");
  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await onChange(); } catch (e) { onError((e as Error).message); }
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Sampling Levels</h2>
      <p className="text-xs text-gray-500">Offered as suggestions on each line. Lines can still use free text.</p>
      <div className="flex flex-wrap gap-2">
        {levels.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-800">
            {l.label}
            <button type="button" title="Remove" onClick={() => act(() => send(`/api/psir-templates/sampling-levels/${l.id}`, "DELETE"))} className="text-gray-400 hover:text-red-600">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. S-2 or 1 per Batch" />
        <Button disabled={!label.trim()} onClick={() => act(async () => { await send("/api/psir-templates/sampling-levels", "POST", { label }); setLabel(""); })}>Add</Button>
      </div>
    </div>
  );
}
