import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { createHash } from "crypto";
import { createNotificationForMany } from "@/lib/notifications";
import { sendMail } from "@/lib/email";

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
      link: "/compliance",
    });

    // Best-effort email to the creator
    if (ev.createdBy.email) {
      await sendMail(
        ev.createdBy.email,
        `Overdue compliance event: ${ev.title}`,
        `<p>The compliance event <strong>${ev.title}</strong> was due ${ev.dueDate!.toLocaleDateString()} and is still open.</p><p>Review it in Sympl PM → Compliance.</p>`
      );
    }

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
      link: `/projects/${stage.project.id}?tab=workflow`,
      projectId: stage.project.id,
    });

    for (const approver of pendingApprovers) {
      if (approver.email) {
        await sendMail(
          approver.email,
          `Approval overdue: ${stage.name} — ${stage.project.name}`,
          `<p>The workflow stage <strong>${stage.name}</strong> in project <strong>${stage.project.name}</strong> was due ${stage.dueDate!.toLocaleDateString()} and is waiting on your approval.</p>`
        );
      }
    }

    await prisma.workflowStage.update({
      where: { id: stage.id },
      data: { overdueNotifiedAt: now },
    });
    stagesNotified++;
  }

  return NextResponse.json({
    checkedAt: now.toISOString(),
    complianceEventsNotified: complianceNotified,
    workflowStagesNotified: stagesNotified,
  });
}
