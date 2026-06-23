"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type Row,
} from "@tanstack/react-table";
import { Plus, Download, Upload, Trash2, Copy, Search, ChevronUp, ChevronDown, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ProductRecord } from "@prisma/client";

interface AttrDef {
  id: string;
  key: string;
  label: string;
  attributeType: string;
  requirement: string;
  maxValues: number;
  lovItems: { value: string; label: string }[];
}

type EavMap = Record<string, string | undefined>;

type ProductRow = ProductRecord & {
  _saveStatus?: "idle" | "saving" | "saved" | "error";
  _eavValues?: EavMap; // key → textValue
};

const CORE_COLUMNS: ColumnDef<ProductRow>[] = [
  {
    id: "rowActions",
    size: 36,
    enableSorting: false,
    enableHiding: false,
    header: () => null,
    cell: () => null, // rendered separately
  },
  {
    accessorKey: "partNumber",
    header: "Part Number",
    size: 140,
    meta: { required: true, section: "Core Data" },
  },
  {
    accessorKey: "modelNumber",
    header: "Model Number",
    size: 130,
    meta: { section: "Core Data" },
  },
  {
    accessorKey: "itemName",
    header: "Item Name",
    size: 220,
    meta: { required: true, section: "Core Data" },
  },
  {
    accessorKey: "brand",
    header: "Brand",
    size: 110,
    meta: { section: "Core Data" },
  },
  {
    accessorKey: "upc",
    header: "UPC",
    size: 130,
    meta: { section: "Core Data" },
  },
  {
    accessorKey: "inventoryStatus",
    header: "Inventory Status",
    size: 140,
    meta: { section: "Status" },
  },
  {
    accessorKey: "warrantyInfo",
    header: "Warranty",
    size: 160,
    meta: { section: "Regulatory" },
  },
  {
    accessorKey: "htsCode",
    header: "HTS Code",
    size: 110,
    meta: { section: "Regulatory" },
  },
  {
    accessorKey: "packSize",
    header: "Pack Size",
    size: 100,
    meta: { section: "Product" },
  },
  {
    accessorKey: "numberOfPieces",
    header: "# Pieces",
    size: 90,
    meta: { section: "Product" },
  },
  {
    accessorKey: "material",
    header: "Material",
    size: 140,
    meta: { section: "Product" },
  },
  {
    accessorKey: "size",
    header: "Size",
    size: 100,
    meta: { section: "Product" },
  },
  {
    accessorKey: "upcHeight",
    header: "UPC H (in)",
    size: 100,
    meta: { section: "Selling Unit" },
  },
  {
    accessorKey: "upcWidth",
    header: "UPC W (in)",
    size: 100,
    meta: { section: "Selling Unit" },
  },
  {
    accessorKey: "upcLength",
    header: "UPC L (in)",
    size: 100,
    meta: { section: "Selling Unit" },
  },
  {
    accessorKey: "upcWeight",
    header: "UPC Wt (lbs)",
    size: 110,
    meta: { section: "Selling Unit" },
  },
  {
    accessorKey: "masterCartonGtin",
    header: "MC GTIN-14",
    size: 130,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "masterCartonHeight",
    header: "MC H (in)",
    size: 90,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "masterCartonWidth",
    header: "MC W (in)",
    size: 90,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "masterCartonLength",
    header: "MC L (in)",
    size: 90,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "masterCartonWeight",
    header: "MC Wt (lbs)",
    size: 100,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "masterCartonQty",
    header: "MC Qty",
    size: 80,
    meta: { section: "Master Carton" },
  },
  {
    accessorKey: "palletGtin",
    header: "Pallet GTIN",
    size: 120,
    meta: { section: "Pallet" },
  },
  {
    accessorKey: "palletQty",
    header: "Pallet Qty",
    size: 90,
    meta: { section: "Pallet" },
  },
];

interface ProductGridProps {
  projectId: string;
  initialProducts: ProductRow[];
  globalAttrs?: AttrDef[];
  categoryAttrs?: AttrDef[];
  canEdit: boolean;
  onExport?: () => void;
  onImport?: () => void;
}

export function ProductGrid({
  projectId,
  initialProducts,
  globalAttrs = [],
  categoryAttrs = [],
  canEdit,
  onExport,
  onImport,
}: ProductGridProps) {
  // Enrich products with _eavValues map for EAV column access
  const enriched = (initialProducts as (ProductRow & { attributeValues?: { attributeDefinition: { key: string }; textValue?: string | null }[] })[]).map((p) => ({
    ...p,
    _eavValues: Object.fromEntries(
      (p.attributeValues ?? []).map((av) => [av.attributeDefinition.key, av.textValue ?? undefined])
    ),
  }));

  const [products, setProducts] = useState<ProductRow[]>(enriched);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const saveTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const saveCell = useCallback(
    async (productId: string, field: string, value: unknown, attrDef?: AttrDef) => {
      const key = `${productId}-${field}`;
      const existing = saveTimeouts.current.get(key);
      if (existing) clearTimeout(existing);

      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, _saveStatus: "saving" } : p))
      );

      const timeout = setTimeout(async () => {
        try {
          const body = attrDef
            ? {
                attributeValues: [{
                  attributeDefinitionId: attrDef.id,
                  textValue: value != null ? String(value) : "",
                }],
              }
            : { [field]: value };

          const res = await fetch(`/api/projects/${projectId}/products/${productId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error("Save failed");
          setProducts((prev) =>
            prev.map((p) => (p.id === productId ? { ...p, _saveStatus: "saved" } : p))
          );
          setTimeout(() => {
            setProducts((prev) =>
              prev.map((p) => (p.id === productId ? { ...p, _saveStatus: "idle" } : p))
            );
          }, 1500);
        } catch {
          setProducts((prev) =>
            prev.map((p) => (p.id === productId ? { ...p, _saveStatus: "error" } : p))
          );
        }
        saveTimeouts.current.delete(key);
      }, 500);

      saveTimeouts.current.set(key, timeout);
    },
    [projectId]
  );

  const addRow = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const newProduct = await res.json();
      setProducts((prev) => [...prev, { ...newProduct, _saveStatus: "idle" }]);
    }
  }, [projectId]);

  const deleteSelected = useCallback(async () => {
    if (selectedRows.size === 0) return;
    const ids = [...selectedRows];
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/projects/${projectId}/products/${id}`, { method: "DELETE" })
      )
    );
    setProducts((prev) => prev.filter((p) => !selectedRows.has(p.id)));
    setSelectedRows(new Set());
  }, [selectedRows, projectId]);

  const duplicateSelected = useCallback(async () => {
    for (const id of selectedRows) {
      const product = products.find((p) => p.id === id);
      if (!product) continue;
      const res = await fetch(`/api/projects/${projectId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...product,
          id: undefined,
          partNumber: product.partNumber ? `${product.partNumber}-COPY` : undefined,
          isDuplicate: true,
          sourceProductId: id,
        }),
      });
      if (res.ok) {
        const newProduct = await res.json();
        setProducts((prev) => [...prev, { ...newProduct, _saveStatus: "idle" }]);
      }
    }
    setSelectedRows(new Set());
  }, [selectedRows, products, projectId]);

  const allAttrs = useMemo(() => [...globalAttrs, ...categoryAttrs], [globalAttrs, categoryAttrs]);

  const eavColumns = useMemo<ColumnDef<ProductRow>[]>(
    () =>
      allAttrs.map((attr) => ({
        id: `eav_${attr.key}`,
        header: attr.label,
        size: 160,
        meta: { section: "Category Specifications", eav: true, attrDef: attr },
        accessorFn: (row: ProductRow) => (row as ProductRow & { _eavValues?: EavMap })._eavValues?.[attr.key] ?? "",
      })),
    [allAttrs]
  );

  const columns = useMemo(() => [...CORE_COLUMNS, ...eavColumns], [eavColumns]);

  const table = useReactTable({
    data: products,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
  });

  // Cleanup timeouts
  useEffect(() => {
    const timeouts = saveTimeouts.current;
    return () => { timeouts.forEach(clearTimeout); };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 p-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
          {selectedRows.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{selectedRows.size} selected</span>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setBulkEditOpen(true)}>
                  <Edit3 className="h-3.5 w-3.5" />
                  Bulk Edit
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={duplicateSelected}>
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </Button>
              <Button size="sm" variant="destructive" onClick={deleteSelected}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onImport && (
            <Button size="sm" variant="outline" onClick={onImport}>
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
          )}
          {onExport && (
            <Button size="sm" variant="outline" onClick={onExport}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {/* Checkbox column */}
                <th className="w-9 border-b border-r border-gray-200 bg-gray-50 px-2">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedRows.size === products.length && products.length > 0}
                    onChange={(e) => {
                      setSelectedRows(e.target.checked ? new Set(products.map((p) => p.id)) : new Set());
                    }}
                  />
                </th>
                {headerGroup.headers.slice(1).map((header) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const isEav = !!(header.column.columnDef.meta as any)?.eav;
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={cn(
                        "border-b border-r border-gray-200 px-2 py-2 text-left text-xs font-semibold whitespace-nowrap select-none",
                        isEav ? "bg-amber-50 text-amber-800" : "bg-gray-50 text-gray-600"
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1 cursor-pointer">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" && <ChevronUp className="h-3 w-3" />}
                        {header.column.getIsSorted() === "desc" && <ChevronDown className="h-3 w-3" />}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <GridRow
                key={row.id}
                row={row}
                selected={selectedRows.has(row.original.id)}
                onSelect={(checked) => {
                  setSelectedRows((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(row.original.id);
                    else next.delete(row.original.id);
                    return next;
                  });
                }}
                editingCell={editingCell}
                onCellEdit={(columnId) => setEditingCell({ rowId: row.id, columnId })}
                onCellBlur={() => setEditingCell(null)}
                onCellChange={(field, value, attrDef) => {
                  setProducts((prev) =>
                    prev.map((p) => {
                      if (p.id !== row.original.id) return p;
                      if (attrDef) {
                        return { ...p, _eavValues: { ...(p as ProductRow & { _eavValues?: EavMap })._eavValues, [attrDef.key]: String(value) } };
                      }
                      return { ...p, [field]: value };
                    })
                  );
                  if (canEdit) saveCell(row.original.id, field, value, attrDef);
                }}
                saveStatus={row.original._saveStatus ?? "idle"}
                canEdit={canEdit}
              />
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="py-12 text-center text-gray-400 text-sm">
                  No products yet.{canEdit && " Click \"Add Row\" to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-white text-xs text-gray-500">
        <span>{table.getFilteredRowModel().rows.length} of {products.length} products</span>
        <span>
          {products.some((p) => p._saveStatus === "saving") && "Saving..."}
          {products.every((p) => p._saveStatus !== "saving") &&
            products.some((p) => p._saveStatus === "saved") && "All changes saved"}
          {products.some((p) => p._saveStatus === "error") && (
            <span className="text-red-500">Save error — please retry</span>
          )}
        </span>
      </div>

      {bulkEditOpen && (
        <BulkEditDialog
          selectedIds={[...selectedRows]}
          products={products}
          allAttrs={allAttrs}
          projectId={projectId}
          onClose={() => setBulkEditOpen(false)}
          onApplied={(updatedProducts) => {
            setProducts((prev) =>
              prev.map((p) => {
                const u = updatedProducts.find((u) => u.id === p.id);
                return u ? { ...p, ...u } : p;
              })
            );
            setSelectedRows(new Set());
            setBulkEditOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Individual row component ──────────────────────────────────────────────────

interface GridRowProps {
  row: Row<ProductRow>;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  editingCell: { rowId: string; columnId: string } | null;
  onCellEdit: (columnId: string) => void;
  onCellBlur: () => void;
  onCellChange: (field: string, value: unknown, attrDef?: AttrDef) => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
  canEdit: boolean;
}

function GridRow({
  row,
  selected,
  onSelect,
  editingCell,
  onCellEdit,
  onCellBlur,
  onCellChange,
  saveStatus,
  canEdit,
}: GridRowProps) {
  const isEditing = (colId: string) =>
    editingCell?.rowId === row.id && editingCell?.columnId === colId;

  return (
    <tr
      className={cn(
        "group border-b border-gray-100 hover:bg-blue-50/30 transition-colors",
        selected && "bg-blue-50",
        saveStatus === "saving" && "opacity-70",
        saveStatus === "error" && "bg-red-50"
      )}
    >
      {/* Checkbox */}
      <td className="border-r border-gray-100 px-2 py-1 text-center">
        <div className="flex items-center gap-1">
          <input
            type="checkbox"
            className="rounded"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
          />
          {saveStatus === "saving" && (
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          )}
          {saveStatus === "saved" && (
            <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
          )}
          {saveStatus === "error" && (
            <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
          )}
        </div>
      </td>

      {/* Data cells */}
      {row.getVisibleCells().slice(1).map((cell) => {
        const value = cell.getValue();
        const colId = cell.column.id;
        const editing = isEditing(colId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attrDef: AttrDef | undefined = (cell.column.columnDef.meta as any)?.attrDef;
        const isEav = !!attrDef;

        const commit = (raw: string) => {
          if (isEav) {
            onCellChange(colId, raw, attrDef);
          } else {
            const parsed = typeof value === "number" ? parseFloat(raw) || 0 : raw;
            onCellChange(colId, parsed);
          }
          onCellBlur();
        };

        return (
          <td
            key={cell.id}
            style={{ width: cell.column.getSize() }}
            className={cn(
              "border-r border-gray-100 px-0 py-0 relative",
              isEav && "bg-amber-50/40",
              editing && "ring-2 ring-inset ring-blue-500 z-10"
            )}
            onClick={() => canEdit && onCellEdit(colId)}
          >
            {editing ? (
              attrDef?.lovItems?.length ? (
                <select
                  autoFocus
                  className="w-full h-full px-2 py-1 text-sm outline-none bg-white"
                  defaultValue={value != null ? String(value) : ""}
                  onChange={(e) => commit(e.target.value)}
                  onBlur={(e) => commit(e.target.value)}
                >
                  <option value="">—</option>
                  {attrDef.lovItems.map((lov) => (
                    <option key={lov.value} value={lov.value}>{lov.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  autoFocus
                  className="w-full h-full px-2 py-1 text-sm outline-none bg-white"
                  defaultValue={value != null ? String(value) : ""}
                  onBlur={(e) => commit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Tab") commit(e.currentTarget.value);
                    if (e.key === "Escape") onCellBlur();
                  }}
                />
              )
            ) : (
              <div className={cn("px-2 py-1 text-sm truncate min-h-[32px] flex items-center", isEav ? "text-amber-900" : "text-gray-700")}>
                {value != null && String(value) !== "" ? (() => {
                  if (attrDef?.lovItems?.length) {
                    return attrDef.lovItems.find((l) => l.value === String(value))?.label ?? String(value);
                  }
                  return String(value);
                })() : (
                  <span className="text-gray-300 italic text-xs">—</span>
                )}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ─── Bulk Edit Dialog ─────────────────────────────────────────────────────────

const BULK_CORE_FIELDS = [
  { key: "brand", label: "Brand", type: "TEXT" },
  { key: "inventoryStatus", label: "Inventory Status", type: "TEXT" },
  { key: "warrantyInfo", label: "Warranty Info", type: "TEXT" },
  { key: "htsCode", label: "HTS Code", type: "TEXT" },
  { key: "packSize", label: "Pack Size", type: "TEXT" },
  { key: "material", label: "Material", type: "TEXT" },
  { key: "size", label: "Size", type: "TEXT" },
];

interface BulkEditDialogProps {
  selectedIds: string[];
  products: ProductRow[];
  allAttrs: AttrDef[];
  projectId: string;
  onClose: () => void;
  onApplied: (updated: ProductRow[]) => void;
}

function BulkEditDialog({ selectedIds, allAttrs, projectId, onClose, onApplied }: BulkEditDialogProps) {
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const selectedAttr = allAttrs.find((a) => `eav_${a.key}` === field);
  const selectedCore = BULK_CORE_FIELDS.find((f) => f.key === field);

  const apply = async () => {
    if (!field) return;
    setApplying(true);
    setResult(null);
    let succeeded = 0;
    let failed = 0;

    await Promise.all(
      selectedIds.map(async (productId) => {
        const body = selectedAttr
          ? { attributeValues: [{ attributeDefinitionId: selectedAttr.id, textValue: value }] }
          : { [field]: value };
        const res = await fetch(`/api/projects/${projectId}/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) succeeded++;
        else failed++;
      })
    );

    setResult(`${succeeded} saved${failed ? `, ${failed} failed` : ""}`);
    setApplying(false);
    if (!failed) setTimeout(onClose, 1200);
    onApplied([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Bulk Edit — {selectedIds.length} product(s)</h3>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">Field to edit</label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            value={field}
            onChange={(e) => { setField(e.target.value); setValue(""); }}
          >
            <option value="">— select a field —</option>
            <optgroup label="Core Fields">
              {BULK_CORE_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </optgroup>
            {allAttrs.length > 0 && (
              <optgroup label="Attributes">
                {allAttrs.map((a) => (
                  <option key={a.id} value={`eav_${a.key}`}>{a.label}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {field && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">New value</label>
            {selectedAttr?.lovItems?.length ? (
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">—</option>
                {selectedAttr.lovItems.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={selectedCore?.type === "NUMBER" ? "number" : "text"}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter value..."
              />
            )}
          </div>
        )}

        {result && <p className="text-xs text-gray-600">{result}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800" onClick={onClose}>Cancel</button>
          <button
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            onClick={apply}
            disabled={!field || applying}
          >
            {applying ? "Applying…" : "Apply to All Selected"}
          </button>
        </div>
      </div>
    </div>
  );
}
