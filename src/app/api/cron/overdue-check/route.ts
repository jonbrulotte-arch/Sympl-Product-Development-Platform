import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { createHash } from "crypto";
import { createNotificationForMany } from "@/lib/notifications";

// Scans for compliance events and workflow stages that have gone past their
// due date and notifies the people responsible — once per item, tracked via
// overdueNotifiedAt. The app has no built-in scheduler, so this endpoint is
// meant to be hit by an external cron job (same pattern as backups):
//
//   */30 * * * * curl -s -X POST https://your-server/api/cron/overdue-check \
//     -H "Authorization: Bearer sbk_<backup-api-token>"
//
// Accepts an admin session or the backup API token as authorization.
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user?.id && (await can(session.user.role, "admin:settings"))) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match) {
    const tokenHash = createHash("sha256").update(match[1]).digest("hex");
    const cronSecret = process.env.CRON_API_TOKEN;
    if (cronSecret) {
      const expected = createHash("sha256").update(cronSecret).digest("hex");
      if (expected === tokenHash) return true;
    }
    const config = await prisma.backupConfig.findFirst({ select: { apiTokenHash: true } });
    if (config?.apiTokenHash && config.apiTokenHash === tokenHash) return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  let complianceNotified = 0;
  let stagesNotified = 0;

  // ─── Overdue compliance events ──────────────────────────────────────────────
  const overdueEvents = await prisma.complianceEvent.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      dueDate: { lt: now },
      overdueNotifiedAt: null,
    },
    include: {
      createdBy: { select: { id: true, email: true, name: true } },
      products: {
        select: { product: { select: { project: { select: { ownerId: true, name: true } } } } },
      },
    },
  });

  for (const ev of overdueEvents) {
    // Notify the event creator plus the owners of every affected project
    const recipients = [...new Set([
      ev.createdById,
      ...ev.products.map((p) => p.product.project.ownerId),
    ])];

    await createNotificationForMany(recipients, {
      title: "Compliance event overdue",
      message: `"${ev.title}" was due ${ev.dueDate!.toLocaleDateString()} and is still ${ev.status.toLowerCase().replace("_", " ")}.`,
      type: "error",
      category: "COMPLIANCE",
      link: "/compliance",
    });

    await prisma.complianceEvent.update({
      where: { id: ev.id },
      data: { overdueNotifiedAt: now },
    });
    complianceNotified++;
  }

  // ─── Overdue workflow stages ────────────────────────────────────────────────
  const overdueStages = await prisma.workflowStage.findMany({
    where: {
      status: { in: ["PENDING", "IN_REVIEW"] },
      dueDate: { lt: now },
      overdueNotifiedAt: null,
    },
    include: {
      project: { select: { id: true, name: true, ownerId: true } },
      approvals: {
        where: { status: "PENDING" },
        include: { approver: { select: { id: true, email: true, name: true } } },
      },
    },
  });

  for (const stage of overdueStages) {
    // Notify pending approvers plus the project owner
    const pendingApprovers = stage.approvals.map((a) => a.approver);
    const recipients = [...new Set([
      stage.project.ownerId,
      ...pendingApprovers.map((a) => a.id),
    ])];

    await createNotificationForMany(recipients, {
      title: "Workflow stage overdue",
      message: `"${stage.name}" in ${stage.project.name} was due ${stage.dueDate!.toLocaleDateString()} and is still awaiting approval.`,
      type: "warning",
      category: "WORKFLOW",
      link: `/projects/${stage.project.id}?tab=workflow`,
      projectId: stage.project.id,
    });

    await prisma.workflowStage.update({
      where: { id: stage.id },
      data: { overdueNotifiedAt: now },
    });
    stagesNotified++;
  }

  // ─── Due soon (within 3 days) ───────────────────────────────────────────────
  const soonCutoff = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  let dueSoonNotified = 0;

  const dueSoonStages = await prisma.workflowStage.findMany({
    where: {
      status: { in: ["PENDING", "IN_REVIEW"] },
      dueDate: { gt: now, lte: soonCutoff },
      dueSoonNotifiedAt: null,
    },
    include: {
      project: { select: { id: true, name: true, ownerId: true } },
      approvals: { where: { status: "PENDING" }, select: { approverId: true } },
    },
  });

  for (const stage of dueSoonStages) {
    const recipients = [...new Set([stage.project.ownerId, ...stage.approvals.map((a) => a.approverId)])];
    await createNotificationForMany(recipients, {
      title: "Workflow stage due soon",
      message: `"${stage.name}" in ${stage.project.name} is due ${stage.dueDate!.toLocaleDateString()}.`,
      type: "warning",
      category: "WORKFLOW",
      link: `/projects/${stage.project.id}?tab=workflow`,
      projectId: stage.project.id,
    });
    await prisma.workflowStage.update({ where: { id: stage.id }, data: { dueSoonNotifiedAt: now } });
    dueSoonNotified++;
  }

  const dueSoonEvents = await prisma.complianceEvent.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      dueDate: { gt: now, lte: soonCutoff },
      dueSoonNotifiedAt: null,
    },
    include: {
      products: { select: { product: { select: { project: { select: { ownerId: true } } } } } },
    },
  });

  for (const ev of dueSoonEvents) {
    const recipients = [...new Set([ev.createdById, ...ev.products.map((p) => p.product.project.ownerId)])];
    await createNotificationForMany(recipients, {
      title: "Compliance event due soon",
      message: `"${ev.title}" is due ${ev.dueDate!.toLocaleDateString()} and is still ${ev.status.toLowerCase().replace("_", " ")}.`,
      type: "warning",
      category: "COMPLIANCE",
      link: "/compliance",
    });
    await prisma.complianceEvent.update({ where: { id: ev.id }, data: { dueSoonNotifiedAt: now } });
    dueSoonNotified++;
  }

  return NextResponse.json({
    checkedAt: now.toISOString(),
    complianceEventsNotified: complianceNotified,
    workflowStagesNotified: stagesNotified,
    dueSoonNotified,
  });
}
