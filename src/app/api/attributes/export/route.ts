import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:attributes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attrs = await prisma.attributeDefinition.findMany({
    where: { isActive: true },
    include: {
      section: true,
      category: true,
      lovItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ section: { sortOrder: "asc" } }, { sectionId: "asc" }, { sortOrder: "asc" }],
  });

  const rows = attrs.map((a) => ({
    key: a.key,
    label: a.label,
    description: a.description ?? "",
    type: a.attributeType,
    requirement: a.requirement,
    maxValues: a.maxValues,
    sortOrder: a.sortOrder,
    section: a.section?.name ?? "",
    category: a.category?.name ?? "",
    salsifyEnabled: a.salsifyEnabled ? "true" : "false",
    salsifyPropertyId: a.salsifyPropertyId ?? "",
    salsifyLocale: a.salsifyLocale ?? "",
    qcDimsColumn: a.qcDimsColumn ?? "",
    // LOV items: value::label between the pair, ;; between entries. The `|`
    // and `:` used by earlier versions collided with category paths and value
    // strings that legitimately contain those characters.
    lovValues: a.lovItems.map((l) => `${l.value}::${l.label}`).join(";;"),
  }));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attributes");

  const keys = Object.keys(rows[0] ?? {}) as (keyof (typeof rows)[0])[];
  ws.columns = keys.map((k) => ({
    header: k,
    key: k,
    width: Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)),
  }));

  for (const row of rows) {
    ws.addRow(row);
  }

  const buf = Buffer.from(await wb.xlsx.writeBuffer());

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attribute-definitions-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
