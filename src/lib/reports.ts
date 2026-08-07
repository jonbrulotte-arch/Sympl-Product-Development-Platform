// Server-side report query builders for the Reports module.
//
// Each builder returns plain row objects; the same rows feed both the JSON
// API (/api/reports/[type]) and the Excel export (/api/reports/[type]/export).
// Non-admin users only see data from projects they own or are members of.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const REPORT_TYPES = [
  "inspections",
  "compliance",
  "overdue-stages",
  "overdue-projects",
  "roadblocks",
  "out-of-sync",
  "pipeline",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LABELS: Record<ReportType, string> = {
  inspections: "Inspections",
  compliance: "Compliance",
  "overdue-stages": "Overdue Workflow Stages",
  "overdue-projects": "Overdue Projects",
  roadblocks: "Roadblocks",
  "out-of-sync": "Out-of-Sync Products",
  pipeline: "Pipeline Summary",
};

export type ReportRow = Record<string, string | number | null>;

export type ReportContext = {
  userId: string;
  isAdmin: boolean;
  filters: Record<string, string>;
};

const STALLED_DAYS = 14;
const MS_PER_DAY = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function fmtDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

// Scoping predicate: which projects can this user see?
function projectScope(ctx: ReportContext): Prisma.ProjectWhereInput {
  if (ctx.isAdmin) return {};
  return { OR: [{ ownerId: ctx.userId }, { members: { some: { userId: ctx.userId } } }] };
}

// ─── Inspections ──────────────────────────────────────────────────────────────

export async function inspectionsReport(ctx: ReportContext): Promise<ReportRow[]> {
  const { result, status, from, to } = ctx.filters;
  const psirs = await prisma.psir.findMany({
    where: {
      ...(result ? { result } : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? { inspectionDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
      ...(ctx.isAdmin ? {} : { products: { some: { product: { project: projectScope(ctx) } } } }),
    },
    include: {
      createdBy: { select: { name: true, email: true } },
      _count: { select: { products: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return psirs.map((p) => ({
    "Reference #": p.referenceNumber ?? null,
    Title: p.title,
    Result: p.result,
    Status: p.status,
    "Inspection Date": fmtDate(p.inspectionDate),
    Inspector: p.inspector ?? null,
    Company: p.inspectionCompany ?? null,
    Factory: p.factory ?? null,
    Country: p.countryOfOrigin ?? null,
    Products: p._count.products,
    "Created By": p.createdBy.name ?? p.createdBy.email,
    Created: fmtDate(p.createdAt),
  }));
}

// ─── Compliance ───────────────────────────────────────────────────────────────

export async function complianceReport(ctx: ReportContext): Promise<ReportRow[]> {
  const { status, severity, overdueOnly } = ctx.filters;
  const now = new Date();
  const events = await prisma.complianceEvent.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
      ...(overdueOnly === "true"
        ? { dueDate: { lt: now }, status: { in: ["OPEN", "IN_PROGRESS"] } }
        : {}),
      ...(ctx.isAdmin ? {} : { products: { some: { product: { project: projectScope(ctx) } } } }),
    },
    include: {
      type: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
      _count: { select: { products: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  return events.map((e) => ({
    Title: e.title,
    Type: e.type.name,
    Severity: e.severity,
    Status: e.status,
    "Due Date": fmtDate(e.dueDate),
    "Days Overdue":
      e.dueDate && e.dueDate < now && !["RESOLVED", "CLOSED"].includes(e.status)
        ? daysBetween(e.dueDate, now)
        : null,
    Resolved: fmtDate(e.resolvedAt),
    Products: e._count.products,
    "Created By": e.createdBy.name ?? e.createdBy.email,
    Created: fmtDate(e.createdAt),
  }));
}

// ─── Overdue Workflow Stages ──────────────────────────────────────────────────

export async function overdueStagesReport(ctx: ReportContext): Promise<ReportRow[]> {
  const now = new Date();
  const stages = await prisma.workflowStage.findMany({
    where: {
      status: { in: ["PENDING", "IN_REVIEW"] },
      dueDate: { lt: now },
      project: { isArchived: false, ...projectScope(ctx) },
    },
    include: {
      project: { select: { name: true, owner: { select: { name: true, email: true } } } },
      approvals: { where: { status: "PENDING" }, include: { approver: { select: { name: true, email: true } } } },
    },
    orderBy: { dueDate: "asc" },
  });
  return stages.map((s) => ({
    Stage: s.name,
    Project: s.project.name,
    Status: s.status,
    "Due Date": fmtDate(s.dueDate),
    "Days Overdue": s.dueDate ? daysBetween(s.dueDate, now) : null,
    "Pending Approvers": s.approvals.map((a) => a.approver.name ?? a.approver.email).join(", ") || null,
    "Project Owner": s.project.owner.name ?? s.project.owner.email,
  }));
}

// ─── Overdue Projects ─────────────────────────────────────────────────────────

export async function overdueProjectsReport(ctx: ReportContext): Promise<ReportRow[]> {
  const now = new Date();
  const projects = await prisma.project.findMany({
    where: {
      isArchived: false,
      targetLaunchDate: { lt: now },
      status: { notIn: ["APPROVED", "EXPORT_READY", "ARCHIVED"] },
      ...projectScope(ctx),
    },
    include: {
      owner: { select: { name: true, email: true } },
      _count: {
        select: {
          products: { where: { isArchived: false } },
          workflowStages: { where: { status: { in: ["PENDING", "IN_REVIEW"] } } },
        },
      },
    },
    orderBy: { targetLaunchDate: "asc" },
  });
  return projects.map((p) => ({
    Project: p.name,
    Status: p.status,
    Owner: p.owner.name ?? p.owner.email,
    Brand: p.brand ?? null,
    "Target Launch": fmtDate(p.targetLaunchDate),
    "Days Overdue": p.targetLaunchDate ? daysBetween(p.targetLaunchDate, now) : null,
    "Open Stages": p._count.workflowStages,
    Products: p._count.products,
  }));
}

// ─── Roadblocks ───────────────────────────────────────────────────────────────

export async function roadblocksReport(ctx: ReportContext): Promise<ReportRow[]> {
  const now = new Date();
  const stalledCutoff = new Date(now.getTime() - STALLED_DAYS * MS_PER_DAY);
  const rows: ReportRow[] = [];

  // 1. Blocked stages: dependency (stage / compliance event / inspection) not satisfied
  const blockedStages = await prisma.workflowStage.findMany({
    where: {
      status: { in: ["PENDING", "IN_REVIEW"] },
      project: { isArchived: false, ...projectScope(ctx) },
      OR: [
        { dependsOnStage: { status: { notIn: ["APPROVED", "SKIPPED"] } } },
        { complianceEvent: { status: { notIn: ["RESOLVED", "CLOSED"] } } },
        { psir: { result: { not: "PASS" } } },
      ],
    },
    include: {
      project: { select: { name: true, owner: { select: { name: true, email: true } } } },
      dependsOnStage: { select: { name: true, status: true } },
      complianceEvent: { select: { title: true, status: true } },
      psir: { select: { title: true, result: true } },
    },
  });
  for (const s of blockedStages) {
    const blocker = s.dependsOnStage
      ? `Stage "${s.dependsOnStage.name}" (${s.dependsOnStage.status})`
      : s.complianceEvent
        ? `Compliance "${s.complianceEvent.title}" (${s.complianceEvent.status})`
        : s.psir
          ? `Inspection "${s.psir.title}" (${s.psir.result})`
          : "";
    rows.push({
      "Roadblock Type": "Blocked Stage",
      Item: s.name,
      Project: s.project.name,
      Detail: `Waiting on ${blocker}`,
      "Days Blocked": daysBetween(s.updatedAt, now),
      Owner: s.project.owner.name ?? s.project.owner.email,
    });
  }

  // 2. Stalled projects
  const stalled = await prisma.project.findMany({
    where: {
      isArchived: false,
      OR: [
        { status: { in: ["NEEDS_REVIEW", "CHANGES_REQUESTED"] } },
        { status: { in: ["DRAFT", "IN_PROGRESS"] }, updatedAt: { lt: stalledCutoff } },
      ],
      AND: [projectScope(ctx)],
    },
    include: { owner: { select: { name: true, email: true } } },
  });
  for (const p of stalled) {
    rows.push({
      "Roadblock Type": "Stalled Project",
      Item: p.name,
      Project: p.name,
      Detail:
        p.status === "NEEDS_REVIEW" || p.status === "CHANGES_REQUESTED"
          ? `Status ${p.status.replace(/_/g, " ")}`
          : `No activity for ${daysBetween(p.updatedAt, now)} days`,
      "Days Blocked": daysBetween(p.updatedAt, now),
      Owner: p.owner.name ?? p.owner.email,
    });
  }

  // 3. Failed inspections
  const failed = await prisma.psir.findMany({
    where: {
      result: "FAIL",
      ...(ctx.isAdmin ? {} : { products: { some: { product: { project: projectScope(ctx) } } } }),
    },
    include: {
      products: {
        include: { product: { select: { project: { select: { name: true, owner: { select: { name: true, email: true } } } } } } },
        take: 1,
      },
    },
  });
  for (const psir of failed) {
    const proj = psir.products[0]?.product.project;
    rows.push({
      "Roadblock Type": "Failed Inspection",
      Item: psir.title,
      Project: proj?.name ?? null,
      Detail: psir.referenceNumber ? `Ref ${psir.referenceNumber} — FAIL` : "Inspection result FAIL",
      "Days Blocked": daysBetween(psir.updatedAt, now),
      Owner: proj ? (proj.owner.name ?? proj.owner.email) : null,
    });
  }

  // 4. Aging pending approvals
  const approvals = await prisma.workflowApproval.findMany({
    where: {
      status: "PENDING",
      stage: { status: { in: ["PENDING", "IN_REVIEW"] }, project: { isArchived: false, ...projectScope(ctx) } },
    },
    include: {
      approver: { select: { name: true, email: true } },
      stage: { select: { name: true, project: { select: { name: true, owner: { select: { name: true, email: true } } } } } },
    },
  });
  for (const a of approvals) {
    rows.push({
      "Roadblock Type": "Pending Approval",
      Item: a.stage.name,
      Project: a.stage.project.name,
      Detail: `Awaiting vote from ${a.approver.name ?? a.approver.email}`,
      "Days Blocked": daysBetween(a.createdAt, now),
      Owner: a.stage.project.owner.name ?? a.stage.project.owner.email,
    });
  }

  return rows.sort((a, b) => Number(b["Days Blocked"] ?? 0) - Number(a["Days Blocked"] ?? 0));
}

// ─── Out-of-Sync Products (Salsify drift) ─────────────────────────────────────

export async function outOfSyncReport(ctx: ReportContext): Promise<ReportRow[]> {
  const products = await prisma.productRecord.findMany({
    where: {
      isArchived: false,
      project: { isArchived: false, ...projectScope(ctx) },
      OR: [
        // Synced before but edited since (Salsify is stale)
        { salsifyLastSyncedAt: { not: null } },
        // Never synced while the project is export-ready
        { salsifyLastSyncedAt: null, project: { status: "EXPORT_READY" } },
      ],
    },
    select: {
      partNumber: true,
      itemName: true,
      updatedAt: true,
      salsifyLastSyncedAt: true,
      project: { select: { name: true, status: true } },
    },
  });
  const rows: ReportRow[] = [];
  for (const p of products) {
    const drift = p.salsifyLastSyncedAt
      ? p.updatedAt > p.salsifyLastSyncedAt
        ? "Changed"
        : null
      : "Never synced";
    if (!drift) continue;
    rows.push({
      "Part Number": p.partNumber ?? null,
      "Item Name": p.itemName ?? null,
      Project: p.project.name,
      "Project Status": p.project.status,
      "Drift Status": drift,
      "Last Synced": fmtDate(p.salsifyLastSyncedAt),
      "Last Updated": fmtDate(p.updatedAt),
    });
  }
  return rows;
}

// ─── Pipeline Summary ─────────────────────────────────────────────────────────

export async function pipelineReport(ctx: ReportContext): Promise<ReportRow[]> {
  const now = new Date();
  const projects = await prisma.project.findMany({
    where: { isArchived: false, ...projectScope(ctx) },
    include: {
      owner: { select: { name: true, email: true } },
      _count: { select: { products: { where: { isArchived: false } } } },
    },
  });
  type Agg = { count: number; products: number; totalDays: number };
  const byKey = new Map<string, Agg>();
  for (const p of projects) {
    const owner = p.owner.name ?? p.owner.email;
    const key = `${p.status}|${owner}`;
    const agg = byKey.get(key) ?? { count: 0, products: 0, totalDays: 0 };
    agg.count++;
    agg.products += p._count.products;
    agg.totalDays += daysBetween(p.updatedAt, now);
    byKey.set(key, agg);
  }
  return [...byKey.entries()]
    .map(([key, agg]) => {
      const [status, owner] = key.split("|");
      return {
        Status: status,
        Owner: owner,
        Projects: agg.count,
        Products: agg.products,
        "Avg Days Since Update": Math.round(agg.totalDays / agg.count),
      };
    })
    .sort((a, b) => String(a.Status).localeCompare(String(b.Status)) || String(a.Owner).localeCompare(String(b.Owner)));
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function buildReport(type: ReportType, ctx: ReportContext): Promise<ReportRow[]> {
  switch (type) {
    case "inspections": return inspectionsReport(ctx);
    case "compliance": return complianceReport(ctx);
    case "overdue-stages": return overdueStagesReport(ctx);
    case "overdue-projects": return overdueProjectsReport(ctx);
    case "roadblocks": return roadblocksReport(ctx);
    case "out-of-sync": return outOfSyncReport(ctx);
    case "pipeline": return pipelineReport(ctx);
  }
}
