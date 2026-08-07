import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildReport, REPORT_TYPES, REPORT_LABELS, type ReportType } from "@/lib/reports";
import { buildXlsxResponse } from "@/lib/xlsx-export";
import { isInspectionsEnabled } from "@/lib/app-config";

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type } = await params;
  if (!REPORT_TYPES.includes(type as ReportType)) {
    return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  }
  if (type === "inspections" && !(await isInspectionsEnabled())) {
    return NextResponse.json({ error: "Inspections module is disabled" }, { status: 404 });
  }

  const filters: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { if (v) filters[k] = v; });

  const reportType = type as ReportType;
  const rows = await buildReport(reportType, {
    userId: session.user.id,
    isAdmin: session.user.role === "ADMIN",
    filters,
  });
  const date = new Date().toISOString().slice(0, 10);
  return buildXlsxResponse(rows, REPORT_LABELS[reportType], `sympl-${reportType}-report-${date}.xlsx`);
}
