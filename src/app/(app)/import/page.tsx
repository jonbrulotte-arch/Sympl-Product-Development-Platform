"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Suspense } from "react";

// Core field mappings
const SYMPL_FIELDS = [
  { key: "partNumber", label: "Part Number" },
  { key: "modelNumber", label: "Model Number" },
  { key: "itemName", label: "Item Name" },
  { key: "brand", label: "Brand" },
  { key: "upc", label: "UPC" },
  { key: "inventoryStatus", label: "Inventory Status" },
  { key: "warrantyInfo", label: "Warranty" },
  { key: "htsCode", label: "HTS Code" },
  { key: "htsCodeCanada", label: "HTS Code (Canada)" },
  { key: "productComposition", label: "Product Composition" },
  { key: "packagingType", label: "Packaging Type" },
  { key: "packSize", label: "Pack Size" },
  { key: "numberOfPieces", label: "Number of Pieces" },
  { key: "individualOrSet", label: "Individual/Set" },
  { key: "material", label: "Material" },
  { key: "size", label: "Size" },
  { key: "jspCategory", label: "JSP Category" },
  { key: "masterCartonGtin", label: "Master Carton GTIN-14" },
  { key: "palletGtin", label: "Pallet GTIN" },
  { key: "upcHeight", label: "UPC Height (in)" },
  { key: "upcWidth", label: "UPC Width (in)" },
  { key: "upcLength", label: "UPC Length (in)" },
  { key: "upcWeight", label: "UPC Weight (lbs)" },
  { key: "itemHeight", label: "Item Height (in)" },
  { key: "itemWidth", label: "Item Width (in)" },
  { key: "itemLength", label: "Item Length (in)" },
  { key: "itemWeight", label: "Item Weight (lbs)" },
  { key: "masterCartonHeight", label: "Master Carton Height (in)" },
  { key: "masterCartonWidth", label: "Master Carton Width (in)" },
  { key: "masterCartonLength", label: "Master Carton Length (in)" },
  { key: "masterCartonWeight", label: "Master Carton Weight (lbs)" },
  { key: "masterCartonQty", label: "Master Carton Qty" },
  { key: "palletHeight", label: "Pallet Height (in)" },
  { key: "palletWidth", label: "Pallet Width (in)" },
  { key: "palletLength", label: "Pallet Length (in)" },
  { key: "palletWeight", label: "Pallet Weight (lbs)" },
  { key: "palletQty", label: "Pallet Qty" },
];

// Auto-detect mappings from Excel column headers
function autoDetect(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const header of headers) {
    const norm = normalize(header);
    for (const field of SYMPL_FIELDS) {
      const fieldNorm = normalize(field.label);
      if (norm === fieldNorm || norm.includes(fieldNorm) || fieldNorm.includes(norm)) {
        mapping[header] = field.key;
        break;
      }
    }
  }
  return mapping;
}

type Step = "upload" | "preview" | "mapping" | "importing" | "complete";

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
    errors: { row: number; errors: string[] }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId ?? "");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

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
      setPreview(data);
      setMapping(autoDetect(data.headers));
      setStep("preview");
    } catch {
      setError("Failed to parse the file. Please ensure it is a valid Excel (.xlsx) file.");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !preview || !projectId) return;
    setLoading(true);
    setStep("importing");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("phase", "import");
    formData.append("projectId", projectId);
    formData.append("sheetName", preview.selectedSheet);
    formData.append("columnMapping", JSON.stringify(mapping));

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
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
                      className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      value={mapping[header] ?? ""}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [header]: e.target.value }))}
                    >
                      <option value="">— Skip —</option>
                      {SYMPL_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
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
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
            <Button onClick={handleImport} disabled={loading || !projectId}>
              {!projectId ? "Select a project to continue" : "Start Import"} <ArrowRight className="h-4 w-4" />
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
                setMapping({});
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
