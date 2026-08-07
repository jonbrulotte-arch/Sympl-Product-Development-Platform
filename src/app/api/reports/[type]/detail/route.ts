import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { REPORT_TYPES, type ReportType } from "@/lib/reports";
import { buildReportDetail } from "@/lib/report-detail";
import { isInspectionsEnabled } from "@/lib/app-config";
import { seesAllProjects } from "@/lib/permissions";

// Drill-down behind a report row. The row's `_detail` query string is passed
// through verbatim; the builders re-apply project scoping to whatever ids it
// names, so a hand-crafted request can't reach another user's data.
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

  const detail = await buildReportDetail(type as ReportType, req.nextUrl.searchParams, {
    userId: session.user.id,
    seesAllProjects: seesAllProjects(session.user.role),
    filters: {},
  });
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(detail);
}
