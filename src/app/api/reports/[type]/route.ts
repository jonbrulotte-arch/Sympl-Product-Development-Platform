import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildReport, REPORT_TYPES, type ReportType } from "@/lib/reports";
import { isInspectionsEnabled } from "@/lib/app-config";
import { seesAllProjects } from "@/lib/permissions";

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

  const rows = await buildReport(type as ReportType, {
    userId: session.user.id,
    seesAllProjects: seesAllProjects(session.user.role),
    filters,
  });
  return NextResponse.json({ rows });
}
