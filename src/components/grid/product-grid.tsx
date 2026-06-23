"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
import { Plus, Download, Upload, Trash2, Copy, Search, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ProductRecord } from "@prisma/client";

type ProductRow = ProductRecord & {
  _saveStatus?: "idle" | "saving" | "saved" | "error";
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
  canEdit: boolean;
  onExport?: () => void;
  onImport?: () => void;
}

export function ProductGrid({
  projectId,
  initialProducts,
  canEdit,
  onExport,
  onImport,
}: ProductGridProps) {
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const saveTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const saveCell = useCallback(
    async (productId: string, field: string, value: unknown) => {
      const key = `${productId}-${field}`;
      const existing = saveTimeouts.current.get(key);
      if (existing) clearTimeout(existing);

      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, _saveStatus: "saving" } : p))
      );

      const timeout = setTimeout(async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/products/${productId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [field]: value }),
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

  const table = useReactTable({
    data: products,
    columns: CORE_COLUMNS,
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
                {headerGroup.headers.slice(1).map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="border-b border-r border-gray-200 bg-gray-50 px-2 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap select-none"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1 cursor-pointer">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" && <ChevronUp className="h-3 w-3" />}
                      {header.column.getIsSorted() === "desc" && <ChevronDown className="h-3 w-3" />}
                    </div>
                  </th>
                ))}
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
                onCellChange={(field, value) => {
                  setProducts((prev) =>
                    prev.map((p) =>
                      p.id === row.original.id ? { ...p, [field]: value } : p
                    )
                  );
                  if (canEdit) saveCell(row.original.id, field, value);
                }}
                saveStatus={row.original._saveStatus ?? "idle"}
                canEdit={canEdit}
              />
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={CORE_COLUMNS.length + 1} className="py-12 text-center text-gray-400 text-sm">
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
  onCellChange: (field: string, value: unknown) => void;
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

        return (
          <td
            key={cell.id}
            style={{ width: cell.column.getSize() }}
            className={cn(
              "border-r border-gray-100 px-0 py-0 relative",
              editing && "ring-2 ring-inset ring-blue-500 z-10"
            )}
            onClick={() => canEdit && onCellEdit(colId)}
          >
            {editing ? (
              <input
                autoFocus
                className="w-full h-full px-2 py-1 text-sm outline-none bg-white"
                defaultValue={value != null ? String(value) : ""}
                onBlur={(e) => {
                  const newVal = e.target.value;
                  const parsed =
                    typeof value === "number" ? parseFloat(newVal) || 0 : newVal;
                  onCellChange(colId, parsed);
                  onCellBlur();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Tab") {
                    const newVal = e.currentTarget.value;
                    const parsed =
                      typeof value === "number" ? parseFloat(newVal) || 0 : newVal;
                    onCellChange(colId, parsed);
                    onCellBlur();
                  }
                  if (e.key === "Escape") onCellBlur();
                }}
              />
            ) : (
              <div className="px-2 py-1 text-sm text-gray-700 truncate min-h-[32px] flex items-center">
                {value != null ? String(value) : (
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
