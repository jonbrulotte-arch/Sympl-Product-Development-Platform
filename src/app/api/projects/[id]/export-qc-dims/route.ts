// QC Dims export — fills the vendor's exact spreadsheet layout for selected products.
//
// NOTE ON THE LIBRARY CHOICE: this is the one place in the codebase that uses
// exceljs to *write*. The sheet's header row is bold, size-10, and grey-filled,
// and SheetJS (lib/xlsx-export.ts) cannot emit cell styling at all — that is a
// SheetJS Pro feature. So we load a committed template that already carries the
// styling, freeze panes, and column widths, and append data rows beneath it.
//
// The "exceljs is for parsing only" rule in lib/xlsx-parse.ts guards the
// hardened parser used on UNTRUSTED uploads. Writing our own committed template
// is a different operation and is not what that rule protects against. Keep
// using buildXlsxResponse (SheetJS) for every other export.

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { checkProjectAccess } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";
import { CORE_FIELDS } from "@/lib/core-fields";
import { buildQcDimsRow, type QcDimsSource } from "@/lib/qc-dims";
import type { ProductRecord } from "@prisma/client";

const CORE_FIELD_BY_KEY = Object.fromEntries(CORE_FIELDS.map((f) => [f.key, f]));

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "src/lib/templates/qc-dims-template.xlsx",
);

/** Core fields live in typed columns on ProductRecord, not the EAV table. */
function readCoreField(p: ProductRecord, key: string): string {
  const field = CORE_FIELD_BY_KEY[key];
  if (!field) return "";
  const v = (p as unknown as Record<string, unknown>)[key];
  if (v === null || v === undefined) return "";
  if (field.type === "boolean") return v ? "Yes" : "No";
  // Decimal is a Prisma object; toString keeps full precision where Number would round.
  return String(v);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Both checks are needed: the permission is global, so on its own it would let
  // a holder export any project's data regardless of membership.
  const access = await checkProjectAccess(projectId, session, "view");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!(await can(session.user.role, "products:export_qc_dims"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const MAX_EXPORT_IDS = 5000;
  const body = await req.json().catch(() => ({}));
  const productIds: string[] = Array.isArray(body?.productIds) ? body.productIds : [];
  if (productIds.length === 0) {
    return NextResponse.json({ error: "No products selected" }, { status: 400 });
  }
  if (productIds.length > MAX_EXPORT_IDS) {
    return NextResponse.json({ error: `Too many products (${productIds.length}). Maximum is ${MAX_EXPORT_IDS}.` }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [products, mappedAttrs] = await Promise.all([
    prisma.productRecord.findMany({
      // Scoped by projectId as well as id, so ids from another project can't be
      // smuggled in through the request body.
      where: { projectId, id: { in: productIds }, isArchived: false },
      include: { attributeValues: true },
      orderBy: [{ rowIndex: "asc" }, { createdAt: "asc" }],
    }),
    prisma.attributeDefinition.findMany({
      where: { qcDimsColumn: { not: null }, isActive: true },
    }),
  ]);

  if (products.length === 0) {
    return NextResponse.json({ error: "No matching products" }, { status: 404 });
  }

  // Built once, not per product — the sibling export route rebuilds this inside
  // its row loop, which is wasted work on large grids.
  const coreByColumn = new Map<string, string>();
  const eavByColumn = new Map<string, string>();
  for (const a of mappedAttrs) {
    if (!a.qcDimsColumn) continue;
    if (CORE_FIELD_BY_KEY[a.key]) coreByColumn.set(a.qcDimsColumn, a.key);
    else eavByColumn.set(a.qcDimsColumn, a.id);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const sheet = workbook.worksheets[0];

  // Explicit row numbers rather than addRow(): the template carries an empty
  // placeholder row 2 left over from stripping the sample data, so addRow()
  // would append at row 3 and leave a blank gap under the header.
  let rowNumber = 2;

  for (const p of products) {
    // Lowest valueIndex wins: QC columns are single-valued, so a multi-value
    // attribute contributes its first entry rather than a joined string.
    const firstValueByDefId = new Map<string, string>();
    for (const av of [...p.attributeValues].sort((a, b) => a.valueIndex - b.valueIndex)) {
      if (firstValueByDefId.has(av.attributeDefinitionId)) continue;
      const raw =
        av.textValue ??
        av.numberValue?.toString() ??
        (av.booleanValue === null || av.booleanValue === undefined
          ? null
          : av.booleanValue ? "Yes" : "No");
      if (raw !== null) firstValueByDefId.set(av.attributeDefinitionId, raw);
    }

    const source: QcDimsSource = {};
    for (const [column, key] of coreByColumn) source[column] = readCoreField(p, key);
    for (const [column, defId] of eavByColumn) {
      source[column] = firstValueByDefId.get(defId) ?? "";
    }

    const row = sheet.getRow(rowNumber++);
    buildQcDimsRow(source).forEach((value, i) => {
      row.getCell(i + 1).value = value;
    });
    row.commit();
  }

  await logActivity({
    userId: session.user.id,
    action: "EXPORTED",
    entityType: "Project",
    entityId: projectId,
    projectId,
    newValue: `QC Dims export — ${products.length} product${products.length === 1 ? "" : "s"}`,
    source: "QC Dims Export",
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  const safeName = project.name.replace(/[^a-z0-9]/gi, "_");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}_QC_Dims_${date}.xlsx"`,
    },
  });
}
