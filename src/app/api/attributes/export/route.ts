import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attrs = await prisma.attributeDefinition.findMany({
    where: { isActive: true },
    include: {
      section: true,
      category: true,
      lovItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
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
    // LOV items encoded as value:label pairs separated by |
    lovValues: a.lovItems.map((l) => `${l.value}:${l.label}`).join("|"),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto-size columns
  const colWidths = Object.keys(rows[0] ?? {}).map((k) => ({
    wch: Math.max(k.length, ...rows.map((r) => String(r[k as keyof typeof r] ?? "").length)),
  }));
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attributes");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attribute-definitions-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
