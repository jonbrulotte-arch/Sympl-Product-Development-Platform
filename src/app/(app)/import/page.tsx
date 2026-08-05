"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Suspense } from "react";
import { CORE_FIELDS, CORE_FIELD_KEYS } from "@/lib/core-fields";

// Hardcoded core field labels as fallback for unseeded installs
const SYMPL_FIELDS_FALLBACK = CORE_FIELDS.map((f) => ({ key: f.key, label: f.label }));
const CORE_FIELD_KEY_SET = new Set(CORE_FIELD_KEYS);

type AttrOption = { key: string; label: string };

// Auto-detect mappings from Excel column headers.
// Uses DB attribute labels (which the export also uses) so round-tripping
// always works. Falls back to hardcoded CORE_FIELDS labels only when no
// DB definitions exist (unseeded install).
function autoDetect(
  headers: string[],
  coreFields: AttrOption[],
  extraFields: AttrOption[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Prefer DB labels; fall back to hardcoded list if no core defs exist
  const effectiveCore = coreFields.length > 0 ? coreFields : SYMPL_FIELDS_FALLBACK;
  const allFields = [...effectiveCore, ...extraFields].sort(
    (a, b) => normalize(b.label).length - normalize(a.label).length
  );

  // Track which target keys have been claimed so two headers can't map to the same field
  const usedKeys = new Set<string>();

  for (const header of headers) {
    const norm = normalize(header);
    // Exact match pass
    for (const field of allFields) {
      if (usedKeys.has(field.key)) continue;
      if (norm === normalize(field.label)) {
        mapping[header] = field.key;
        usedKeys.add(field.key);
        break;
      }
    }
    if (mapping[header]) continue;
    // Partial match pass (longer fields checked first thanks to sort above)
    for (const field of allFields) {
      if (usedKeys.has(field.key)) continue;
      const fieldNorm = normalize(field.label);
      if (norm.includes(fieldNorm) || fieldNorm.includes(norm)) {
        mapping[header] = field.key;
        usedKeys.add(field.key);
        break;
      }
    }
  }
  return mapping;
}

type Step = "upload" | "preview" | "mapping" | "verify" | "importing" | "complete";

type DryRunResult = {
  totalRows: number;
  wouldCreate: number;
  wouldUpdate: number;
  changes: {
    row: number;
    partNumber: string | null;
    action: "create" | "update";
    fieldChanges: { field: string; from: string; to: string }[];
  }[];
  attrDiagnostics?: {
    mappedAttrColumns: number;
    attrCellsWithValue: number;
    unresolvedAttrKeys: string[];
  };
};

interface PreviewData {
  sheets: string[];
  selectedSheet: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

interface Project { id: string; name: string; }

function ImportWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get("projectId");

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<{
    importedRows: number; errorRows: number; totalRows: number;
    createdRows?: number; updatedRows?: number;
    attrValuesWritten?: number; attrValuesCleared?: number;
    unresolvedAttrKeys?: string[];
    errors: { row: number; errors: string[] }[];
  } | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId ?? "");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [attrFields, setAttrFields] = useState<AttrOption[]>([]);
  const [coreFieldsFromDb, setCoreFieldsFromDb] = useState<AttrOption[]>([]);
  // Auto-detect must wait for attribute definitions — if it runs against an
  // empty list, every custom-attribute column silently maps to "Skip".
  const attrsPromiseRef = useRef<Promise<{ core: AttrOption[]; extras: AttrOption[] }> | null>(null);
  const previewRef = useRef<PreviewData | null>(null);

  const projectId = selectedProjectId || initialProjectId;

  useEffect(() => {
    if (initialProjectId) return;
    setProjectsLoading(true);
    fetch("/api/projects?pageSize=200")
      .then((r) => r.json())
      .then((d) => setProjects(Array.isArray(d.data) ? d.data : []))
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, [initialProjectId]);

  // Scoped to the destination project when one is known: unrelated categories
  // can legitimately have attributes with the same label (e.g. "Drive Size"
  // on both Sockets and Driver Bits), and an unscoped list makes auto-detect
  // pick whichever definition it sees first — silently importing values under
  // the wrong attribute. Re-runs (and re-maps) when the destination changes.
  useEffect(() => {
    const promise = fetch(`/api/attributes${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`)
      .then((r) => r.json())
      .then((data: { key: string; label: string; isCore: boolean; maxValues: number }[]) => {
        if (!Array.isArray(data)) return { core: [], extras: [] };

        // Core fields backed by real ProductRecord columns — use their DB
        // labels for auto-mapping so export→import round-trips perfectly
        // even if labels were customized in the admin.
        const coreFromDb: AttrOption[] = data
          .filter((a) => CORE_FIELD_KEY_SET.has(a.key))
          .map((a) => ({ key: a.key, label: a.label }));
        setCoreFieldsFromDb(coreFromDb);

        // Non-core (EAV) attributes
        const custom = data.filter((a) => !CORE_FIELD_KEY_SET.has(a.key));
        const options: AttrOption[] = [];
        for (const a of custom) {
          if (a.maxValues > 1) {
            for (let i = 1; i <= a.maxValues; i++) {
              options.push({ key: `attr:${a.key}:${i - 1}`, label: `${a.label} ${i}` });
            }
          } else {
            options.push({ key: `attr:${a.key}:0`, label: a.label });
          }
        }
        setAttrFields(options);
        return { core: coreFromDb, extras: options };
      })
      .catch(() => ({ core: [], extras: [] }));
    attrsPromiseRef.current = promise;
    // A file may already be uploaded when the destination project is chosen —
    // re-run auto-detect against the correctly scoped attribute list.
    promise.then(({ core, extras }) => {
      if (attrsPromiseRef.current === promise && previewRef.current) {
        setMapping(autoDetect(previewRef.current.headers, core, extras));
      }
    });
  }, [projectId]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      const created = await res.json();
      setProjects((prev) => [created, ...prev]);
      setSelectedProjectId(created.id);
      setNewProjectName("");
    } catch {
      setError("Failed to create project. Please try again.");
    } finally {
      setCreatingProject(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", f);
    formData.append("phase", "preview");

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed to parse file");
      const data = await res.json();
      // Wait for attribute definitions before auto-detecting — running against
      // a not-yet-loaded list would leave custom-attribute columns unmapped.
      const attrs = (await attrsPromiseRef.current) ?? { core: [], extras: [] };
      setPreview(data);
      previewRef.current = data;
      setMapping(autoDetect(data.headers, attrs.core, attrs.extras));
      setStep("preview");
    } catch {
      setError("Failed to parse the file. Please ensure it is a valid Excel (.xlsx) file.");
    } finally {
      setLoading(false);
    }
  };

  const buildImportForm = (phase: string) => {
    const formData = new FormData();
    formData.append("file", file!);
    formData.append("phase", phase);
    formData.append("projectId", projectId!);
    formData.append("sheetName", preview!.selectedSheet);
    formData.append("columnMapping", JSON.stringify(mapping));
    return formData;
  };

  // Dry run first — show what will be created vs. updated before writing
  const handleVerify = async () => {
    if (!file || !preview || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/import", { method: "POST", body: buildImportForm("dryrun") });
      if (!res.ok) throw new Error("Dry run failed");
      setDryRun(await res.json());
      setStep("verify");
    } catch {
      setError("Could not analyze the import. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !preview || !projectId) return;
    setLoading(true);
    setStep("importing");

    try {
      const res = await fetch("/api/import", { method: "POST", body: buildImportForm("import") });
      if (!res.ok) throw new Error("Import failed");
      const data = await res.json();
      setImportResult(data);
      setStep("complete");
    } catch {
      setError("Import failed. Please try again.");
      setStep("mapping");
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { id: "upload", label: "Upload" },
    { id: "preview", label: "Preview" },
    { id: "mapping", label: "Map Columns" },
    { id: "verify", label: "Verify" },
    { id: "importing", label: "Importing" },
    { id: "complete", label: "Complete" },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import Products</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload an Excel file to import product data{projectId ? " into this project" : ""}
        </p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold",
              i < stepIndex ? "bg-green-100 text-green-700" :
              i === stepIndex ? "bg-blue-600 text-white" :
              "bg-gray-100 text-gray-400"
            )}>
              {i < stepIndex ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn("text-sm", i === stepIndex ? "font-medium text-gray-900" : "text-gray-400")}>
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="h-px w-8 bg-gray-200" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Step: Upload */}
      {step === "upload" && (
        <Card>
          <CardContent className="p-8">
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">Upload Excel File</h3>
              <p className="text-sm text-gray-500 mb-4">Click to browse or drag and drop your .xlsx file here</p>
              <Button variant="outline" disabled={loading}>
                <Upload className="h-4 w-4" />
                {loading ? "Processing..." : "Choose File"}
              </Button>
              <p className="text-xs text-gray-400 mt-4">Supports .xlsx files up to 50MB</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
          </CardContent>
        </Card>
      )}

      {/* Step: Preview */}
      {step === "preview" && preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>File Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">File</p>
                  <p className="font-medium">{file?.name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Sheet</p>
                  <p className="font-medium">{preview.selectedSheet}</p>
                </div>
                <div>
                  <p className="text-gray-500">Rows detected</p>
                  <p className="font-medium">{preview.totalRows}</p>
                </div>
              </div>

              {/* Sample data table */}
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      {preview.headers.slice(0, 10).map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sampleRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {preview.headers.slice(0, 10).map((h) => (
                          <td key={h} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[120px] truncate">{row[h] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("upload")}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={() => setStep("mapping")}>
              Map Columns <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Mapping */}
      {step === "mapping" && preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Map Columns to Sympl Fields</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  We&apos;ve auto-detected {Object.values(mapping).filter(Boolean).length} of {preview.headers.length} column mappings.
                  Review and adjust as needed.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {preview.headers.map((header) => (
                  <div key={header} className="flex items-center gap-3">
                    <div className="flex-1 text-sm text-gray-700 font-medium truncate">{header}</div>
                    <div className="text-gray-400 text-xs">→</div>
                    <select
                      className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      value={mapping[header] ?? ""}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [header]: e.target.value }))}
                    >
                      <option value="">— Skip —</option>
                      <optgroup label="Core Fields">
                        {(coreFieldsFromDb.length > 0 ? coreFieldsFromDb : SYMPL_FIELDS_FALLBACK).map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </optgroup>
                      {attrFields.length > 0 && (
                        <optgroup label="Custom Attributes">
                          {attrFields.map((f) => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {!initialProjectId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Select Destination Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {projectsLoading ? (
                  <p className="text-sm text-gray-500">Loading projects…</p>
                ) : (
                  <select
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                  >
                    <option value="">— Choose a project —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-xs text-gray-400">or create new</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="New project name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <Button
                    variant="outline"
                    disabled={!newProjectName.trim() || creatingProject}
                    onClick={handleCreateProject}
                  >
                    {creatingProject ? "Creating…" : "Create"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("preview")}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={handleVerify} disabled={loading || !projectId}>
              {!projectId ? "Select a project to continue" : loading ? "Analyzing…" : "Review Changes"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Verify (dry run) */}
      {step === "verify" && dryRun && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review Before Importing</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Nothing has been written yet. Here&apos;s what this import will do:
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{dryRun.wouldCreate}</p>
                  <p className="text-sm text-green-600">New products</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">{dryRun.wouldUpdate}</p>
                  <p className="text-sm text-blue-600">Updates to existing</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-700">{dryRun.totalRows}</p>
                  <p className="text-sm text-gray-600">Total rows</p>
                </div>
              </div>

              {dryRun.attrDiagnostics && (
                <div className={cn(
                  "text-sm rounded-lg border p-3",
                  dryRun.attrDiagnostics.mappedAttrColumns === 0 || dryRun.attrDiagnostics.unresolvedAttrKeys.length > 0
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-gray-200 bg-gray-50 text-gray-600"
                )}>
                  <p>
                    {dryRun.attrDiagnostics.mappedAttrColumns} custom attribute column{dryRun.attrDiagnostics.mappedAttrColumns === 1 ? "" : "s"} mapped,{" "}
                    {dryRun.attrDiagnostics.attrCellsWithValue} non-empty attribute cell{dryRun.attrDiagnostics.attrCellsWithValue === 1 ? "" : "s"} in the sheet.
                    {dryRun.attrDiagnostics.mappedAttrColumns === 0 && " No custom attributes will be imported — check the Map Columns step."}
                  </p>
                  {dryRun.attrDiagnostics.unresolvedAttrKeys.length > 0 && (
                    <p className="mt-1">
                      These mapped attributes don&apos;t match any active attribute definition and will be skipped:{" "}
                      <span className="font-mono">{dryRun.attrDiagnostics.unresolvedAttrKeys.join(", ")}</span>
                    </p>
                  )}
                </div>
              )}

              {dryRun.changes.length > 0 && (
                <div className="border border-gray-200 rounded-lg max-h-80 overflow-y-auto divide-y divide-gray-100">
                  {dryRun.changes.map((c, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-full font-medium",
                          c.action === "create" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                        )}>
                          {c.action === "create" ? "NEW" : "UPDATE"}
                        </span>
                        <span className="font-mono text-gray-700">{c.partNumber ?? `Row ${c.row}`}</span>
                        {c.action === "update" && c.fieldChanges.length === 0 && (
                          <span className="text-gray-400">no field changes</span>
                        )}
                      </div>
                      {c.fieldChanges.length > 0 && (
                        <div className="mt-1 ml-1 space-y-0.5">
                          {c.fieldChanges.slice(0, 8).map((fc, j) => (
                            <p key={j} className="text-gray-500">
                              <span className="text-gray-700">{fc.field}:</span>{" "}
                              <span className="line-through text-red-400">{fc.from || "—"}</span>{" "}
                              → <span className="text-green-700">{fc.to || "—"}</span>
                            </p>
                          ))}
                          {c.fieldChanges.length > 8 && (
                            <p className="text-gray-400">+{c.fieldChanges.length - 8} more field{c.fieldChanges.length - 8 !== 1 ? "s" : ""}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("mapping")}>
              <ArrowLeft className="h-4 w-4" /> Back to Mapping
            </Button>
            <Button onClick={handleImport} disabled={loading}>
              Confirm &amp; Import <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === "importing" && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700">Importing products...</h3>
            <p className="text-sm text-gray-500 mt-2">This may take a moment for large files.</p>
          </CardContent>
        </Card>
      )}

      {/* Step: Complete */}
      {step === "complete" && importResult && (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Import Complete</h3>
            <div className="grid grid-cols-3 gap-4 my-6">
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-green-700">{importResult.importedRows}</p>
                <p className="text-sm text-green-600">Imported</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-700">{importResult.totalRows}</p>
                <p className="text-sm text-gray-600">Total rows</p>
              </div>
              <div className={cn("rounded-lg p-4", importResult.errorRows > 0 ? "bg-red-50" : "bg-gray-50")}>
                <p className={cn("text-2xl font-bold", importResult.errorRows > 0 ? "text-red-700" : "text-gray-400")}>{importResult.errorRows}</p>
                <p className={cn("text-sm", importResult.errorRows > 0 ? "text-red-600" : "text-gray-400")}>Errors</p>
              </div>
            </div>

            {(importResult.createdRows !== undefined || importResult.updatedRows !== undefined) && (
              <p className="text-sm text-gray-500 mb-4">
                {importResult.createdRows ?? 0} new product{importResult.createdRows === 1 ? "" : "s"} created,{" "}
                {importResult.updatedRows ?? 0} existing product{importResult.updatedRows === 1 ? "" : "s"} updated
              </p>
            )}

            {importResult.attrValuesWritten !== undefined && (
              <p className="text-sm text-gray-500 mb-4">
                {importResult.attrValuesWritten} attribute value{importResult.attrValuesWritten === 1 ? "" : "s"} written
                {(importResult.attrValuesCleared ?? 0) > 0 && `, ${importResult.attrValuesCleared} cleared by blank cells`}
              </p>
            )}

            {(importResult.unresolvedAttrKeys?.length ?? 0) > 0 && (
              <div className="text-left mb-4 border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
                These mapped attributes no longer exist (or are inactive) and were skipped:{" "}
                <span className="font-mono">{importResult.unresolvedAttrKeys!.join(", ")}</span>
              </div>
            )}

            {importResult.errors.length > 0 && (
              <div className="text-left mb-6 max-h-48 overflow-y-auto border border-red-200 rounded-lg p-3">
                {importResult.errors.map((e, i) => (
                  <div key={i} className="text-sm text-red-700">Row {e.row}: {e.errors.join(", ")}</div>
                ))}
              </div>
            )}

            <div className="flex justify-center gap-3">
              {projectId && (
                <Button onClick={() => router.push(`/projects/${projectId}`)}>
                  View Project
                </Button>
              )}
              <Button variant="outline" onClick={() => {
                setStep("upload");
                setFile(null);
                setPreview(null);
                previewRef.current = null;
                setMapping({});
                setDryRun(null);
                setImportResult(null);
              }}>
                Import Another File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ImportPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <ImportWizardContent />
    </Suspense>
  );
}
