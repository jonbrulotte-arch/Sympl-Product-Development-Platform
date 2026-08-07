import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { createHash } from "crypto";
import { sendMail, wrap } from "@/lib/email";

// Leadership digest — pipeline by status, compliance risk summary, and
// approvals aging — emailed to all active Admins and Product Managers.
// Triggered by an external cron job (weekly is typical), same auth pattern
// as backups and the overdue check:
//
//   0 7 * * 1 curl -s -X POST https://your-server/api/cron/digest \
//     -H "Authorization: Bearer sbk_<backup-api-token>"
//
// GET with an admin session returns the HTML for preview without sending.

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user?.id && (await can(session.user.role, "admin:settings"))) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match) {
    const tokenHash = createHash("sha256").update(match[1]).digest("hex");
    const config = await prisma.backupConfig.findFirst({ select: { apiTokenHash: true } });
    if (config?.apiTokenHash && config.apiTokenHash === tokenHash) return true;
  }
  return false;
}

async function buildDigestHtml(): Promise<string> {
  const now = new Date();

  const [projectsByStatus, openCompliance, overdueCompliance, pendingApprovals] = await Promise.all([
    prisma.project.groupBy({
      by: ["status"],
      where: { isArchived: false },
      _count: { _all: true },
    }),
    prisma.complianceEvent.groupBy({
      by: ["severity"],
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      _count: { _all: true },
    }),
    prisma.complianceEvent.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: now } },
    }),
    prisma.workflowApproval.findMany({
      where: { status: "PENDING", stage: { status: { in: ["PENDING", "IN_REVIEW"] } } },
      include: {
        approver: { select: { name: true, email: true } },
        stage: { select: { name: true, createdAt: true, dueDate: true, project: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
      take: 25,
    }),
  ]);

  const statusOrder = ["DRAFT", "IN_PROGRESS", "NEEDS_REVIEW", "CHANGES_REQUESTED", "APPROVED", "EXPORT_READY"];
  const statusRows = statusOrder
    .map((s) => ({ status: s, count: projectsByStatus.find((p) => p.status === s)?._count._all ?? 0 }))
    .concat(
      projectsByStatus
        .filter((p) => !statusOrder.includes(p.status))
        .map((p) => ({ status: p.status, count: p._count._all }))
    );

  const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const severityRows = severityOrder
    .map((s) => ({ severity: s, count: openCompliance.find((c) => c.severity === s)?._count._all ?? 0 }))
    .filter((r) => r.count > 0);

  const daysWaiting = (d: Date) => Math.floor((now.getTime() - d.getTime()) / 86_400_000);

  const td = 'style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;color:#333"';
  const th = 'style="padding:6px 12px;border-bottom:2px solid #ddd;font-size:12px;color:#666;text-align:left;text-transform:uppercase"';

  return wrap("Weekly Digest", `
    <p style="font-size:13px;color:#666">${now.toLocaleDateString()} — pipeline, compliance risk, and approvals aging.</p>

    <h2 style="font-size:15px;margin-top:24px">Pipeline by Status</h2>
    <table style="border-collapse:collapse;width:100%">
      <tr><th ${th}>Status</th><th ${th}>Projects</th></tr>
      ${statusRows.map((r) => `<tr><td ${td}>${r.status.replace(/_/g, " ")}</td><td ${td}>${r.count}</td></tr>`).join("")}
    </table>

    <h2 style="font-size:15px;margin-top:24px">Compliance Risk</h2>
    ${overdueCompliance > 0 ? `<p style="font-size:13px;color:#b91c1c;font-weight:bold">⚠ ${overdueCompliance} open event${overdueCompliance !== 1 ? "s" : ""} past due date</p>` : `<p style="font-size:13px;color:#15803d">No overdue compliance events.</p>`}
    ${severityRows.length ? `
    <table style="border-collapse:collapse;width:100%">
      <tr><th ${th}>Severity</th><th ${th}>Open Events</th></tr>
      ${severityRows.map((r) => `<tr><td ${td}>${r.severity}</td><td ${td}>${r.count}</td></tr>`).join("")}
    </table>` : `<p style="font-size:13px;color:#666">No open compliance events.</p>`}

    <h2 style="font-size:15px;margin-top:24px">Approvals Aging</h2>
    ${pendingApprovals.length ? `
    <table style="border-collapse:collapse;width:100%">
      <tr><th ${th}>Project</th><th ${th}>Stage</th><th ${th}>Waiting On</th><th ${th}>Days</th></tr>
      ${pendingApprovals.map((a) => {
        const days = daysWaiting(a.stage.createdAt);
        const overdue = a.stage.dueDate && a.stage.dueDate < now;
        return `<tr>
          <td ${td}>${a.stage.project.name}</td>
          <td ${td}>${a.stage.name}${overdue ? ' <span style="color:#b91c1c;font-weight:bold">(overdue)</span>' : ""}</td>
          <td ${td}>${a.approver.name ?? a.approver.email}</td>
          <td ${td}>${days}</td>
        </tr>`;
      }).join("")}
    </table>` : `<p style="font-size:13px;color:#15803d">No approvals waiting.</p>`}

    <p style="font-size:11px;color:#999;margin-top:32px">Generated by Sympl PM. Open the dashboard for live detail.</p>
  `);
}

// Preview (admin session only) — returns the HTML without sending anything
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const html = await buildDigestHtml();
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const html = await buildDigestHtml();

  const recipients = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "PRODUCT_MANAGER"] } },
    select: { email: true },
  });

  for (const r of recipients) {
    await sendMail(r.email, `Sympl PM Digest — ${new Date().toLocaleDateString()}`, html);
  }

  return NextResponse.json({ sent: recipients.length, at: new Date().toISOString() });
}
