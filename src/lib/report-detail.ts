// Drill-down detail behind a report row.
//
// Every report row carries a `_detail` query string; the client posts it back
// to /api/reports/[type]/detail and renders whatever comes out with one
// generic drawer. Builders return the same shape regardless of report, so
// adding context to a report never means touching the UI.
//
// Scoping is re-checked here rather than trusted from the row: a row id is
// user-supplied input by the time it comes back.

import { prisma } from "@/lib/prisma";
import { projectScope, type ReportContext, type ReportType } from "@/lib/reports";
import { ProjectStatus } from "@prisma/client";

export type Tone = "gray" | "green" | "yellow" | "red" | "blue";

export type DetailLink = { label: string; href: string; external?: boolean };

export type DetailItem = {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  href?: string | null;
  /** Open in a new tab rather than client-side navigation (file downloads). */
  external?: boolean;
  tone?: Tone;
};

export type DetailSection = {
  title: string;
  empty?: string;
  items: DetailItem[];
};

export type ReportDetail = {
  title: string;
  subtitle?: string | null;
  badges?: { label: string; tone: Tone }[];
  meta: { label: string; value: string | null }[];
  links: DetailLink[];
  sections: DetailSection[];
};

const MS_PER_DAY = 86_400_000;

function fmtDate(d: Date | null | undefined): string | null {
  return d ? d.toLocaleDateString() : null;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function person(u: { name: string | null; email: string }): string {
  return u.name ?? u.email;
}

function fmtBytes(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Attachments are served by the authenticated /uploads handler, which sets
// Content-Disposition from the stored name. Link out rather than routing so
// the download doesn't try to render as a page.
function attachmentItems(
  docs: { originalName: string; filePath: string; fileSize: number | null; createdAt: Date }[]
): DetailItem[] {
  return docs.map((d) => ({
    title: d.originalName,
    subtitle: fmtDate(d.createdAt),
    meta: fmtBytes(d.fileSize),
    href: `/${d.filePath}`,
    external: true,
  }));
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function severityTone(severity: string): Tone {
  return severity === "CRITICAL" || severity === "HIGH" ? "red" : severity === "MEDIUM" ? "yellow" : "gray";
}

function statusTone(status: string): Tone {
  if (["APPROVED", "RESOLVED", "CLOSED", "PASS", "EXPORT_READY"].includes(status)) return "green";
  if (["REJECTED", "FAIL", "CHANGES_REQUESTED"].includes(status)) return "red";
  if (["IN_REVIEW", "NEEDS_REVIEW", "IN_PROGRESS", "PENDING"].includes(status)) return "yellow";
  return "gray";
}

// ─── Inspections ──────────────────────────────────────────────────────────────

async function inspectionDetail(id: string, ctx: ReportContext): Promise<ReportDetail | null> {
  const psir = await prisma.psir.findFirst({
    where: {
      id,
      ...(ctx.seesAllProjects ? {} : { products: { some: { product: { project: projectScope(ctx) } } } }),
    },
    include: {
      createdBy: { select: { name: true, email: true } },
      products: {
        include: {
          product: {
            select: {
              id: true, partNumber: true, itemName: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      },
      documents: { select: { id: true, originalName: true, filePath: true, fileSize: true, createdAt: true } },
      workflowStages: {
        select: { id: true, name: true, status: true, project: { select: { id: true, name: true } } },
      },
    },
  });
  if (!psir) return null;

  return {
    title: psir.title,
    subtitle: psir.referenceNumber ? `Reference ${psir.referenceNumber}` : null,
    badges: [
      { label: psir.result, tone: statusTone(psir.result) },
      { label: titleCase(psir.status), tone: statusTone(psir.status) },
    ],
    meta: [
      { label: "Inspection date", value: fmtDate(psir.inspectionDate) },
      { label: "Inspector", value: psir.inspector },
      { label: "Company", value: psir.inspectionCompany },
      { label: "Factory", value: psir.factory },
      { label: "Country of origin", value: psir.countryOfOrigin },
      { label: "Created by", value: `${person(psir.createdBy)} · ${fmtDate(psir.createdAt)}` },
      ...(psir.notes ? [{ label: "Notes", value: psir.notes }] : []),
    ],
    links: [{ label: "Open inspection report", href: `/psir/${psir.id}` }],
    sections: [
      {
        title: `Linked products (${psir.products.length})`,
        empty: "No products linked to this inspection.",
        items: psir.products.map((pp) => ({
          title: pp.product.partNumber ?? pp.product.id,
          subtitle: pp.product.itemName,
          meta: pp.product.project.name,
          href: `/products/${pp.product.id}`,
        })),
      },
      {
        title: `Workflow stages waiting on this inspection (${psir.workflowStages.length})`,
        empty: "No workflow stage depends on this inspection.",
        items: psir.workflowStages.map((s) => ({
          title: s.name,
          subtitle: s.project.name,
          meta: titleCase(s.status),
          tone: statusTone(s.status),
          href: `/projects/${s.project.id}?tab=workflow`,
        })),
      },
      {
        title: `Attachments (${psir.documents.length})`,
        empty: "No attachments.",
        items: attachmentItems(psir.documents),
      },
    ],
  };
}

// ─── Compliance ───────────────────────────────────────────────────────────────

async function complianceDetail(id: string, ctx: ReportContext): Promise<ReportDetail | null> {
  const now = new Date();
  const event = await prisma.complianceEvent.findFirst({
    where: {
      id,
      ...(ctx.seesAllProjects ? {} : { products: { some: { product: { project: projectScope(ctx) } } } }),
    },
    include: {
      type: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
      products: {
        include: {
          product: {
            select: {
              id: true, partNumber: true, itemName: true,
              project: { select: { id: true, name: true, owner: { select: { name: true, email: true } } } },
            },
          },
        },
      },
      documents: { select: { id: true, originalName: true, filePath: true, fileSize: true, createdAt: true } },
      workflowStages: {
        select: { id: true, name: true, status: true, project: { select: { id: true, name: true } } },
      },
    },
  });
  if (!event) return null;

  const overdue =
    event.dueDate && event.dueDate < now && !["RESOLVED", "CLOSED"].includes(event.status)
      ? daysBetween(event.dueDate, now)
      : null;

  // One row per affected project, so a PM can see who needs to act.
  const byProject = new Map<string, { id: string; name: string; owner: string; products: number }>();
  for (const ep of event.products) {
    const proj = ep.product.project;
    const entry = byProject.get(proj.id) ?? { id: proj.id, name: proj.name, owner: person(proj.owner), products: 0 };
    entry.products++;
    byProject.set(proj.id, entry);
  }

  return {
    title: event.title,
    subtitle: event.type.name,
    badges: [
      { label: event.severity, tone: severityTone(event.severity) },
      { label: titleCase(event.status), tone: statusTone(event.status) },
      ...(overdue !== null ? [{ label: `${overdue} days overdue`, tone: "red" as Tone }] : []),
    ],
    meta: [
      { label: "Due date", value: fmtDate(event.dueDate) },
      { label: "Resolved", value: fmtDate(event.resolvedAt) },
      { label: "Created by", value: `${person(event.createdBy)} · ${fmtDate(event.createdAt)}` },
      ...(event.description ? [{ label: "Description", value: event.description }] : []),
      ...(event.notes ? [{ label: "Notes", value: event.notes }] : []),
    ],
    links: [{ label: "Open compliance event", href: `/compliance/${event.id}` }],
    sections: [
      {
        title: `Affected projects (${byProject.size})`,
        empty: "No projects affected.",
        items: [...byProject.values()].map((p) => ({
          title: p.name,
          subtitle: `Owner: ${p.owner}`,
          meta: `${p.products} product${p.products !== 1 ? "s" : ""}`,
          href: `/projects/${p.id}`,
        })),
      },
      {
        title: `Affected products (${event.products.length})`,
        empty: "No products linked to this event.",
        items: event.products.map((ep) => ({
          title: ep.product.partNumber ?? ep.product.id,
          subtitle: ep.product.itemName,
          meta: ep.product.project.name,
          href: `/products/${ep.product.id}`,
        })),
      },
      {
        title: `Workflow stages waiting on this event (${event.workflowStages.length})`,
        empty: "No workflow stage depends on this event.",
        items: event.workflowStages.map((s) => ({
          title: s.name,
          subtitle: s.project.name,
          meta: titleCase(s.status),
          tone: statusTone(s.status),
          href: `/projects/${s.project.id}?tab=workflow`,
        })),
      },
      {
        title: `Attachments (${event.documents.length})`,
        empty: "No attachments.",
        items: attachmentItems(event.documents),
      },
    ],
  };
}

// ─── Workflow stage (overdue stages + roadblock stage/approval rows) ──────────

async function stageDetail(id: string, ctx: ReportContext): Promise<ReportDetail | null> {
  const now = new Date();
  const stage = await prisma.workflowStage.findFirst({
    where: { id, project: projectScope(ctx) },
    include: {
      project: {
        select: {
          id: true, name: true, status: true,
          owner: { select: { name: true, email: true } },
        },
      },
      approvals: {
        include: { approver: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      dependsOnStage: { select: { id: true, name: true, status: true } },
      complianceEvent: { select: { id: true, title: true, status: true, severity: true } },
      psir: { select: { id: true, title: true, result: true, referenceNumber: true } },
    },
  });
  if (!stage) return null;

  const overdue = stage.dueDate && stage.dueDate < now ? daysBetween(stage.dueDate, now) : null;

  const blockers: DetailItem[] = [];
  if (stage.dependsOnStage) {
    const satisfied = ["APPROVED", "SKIPPED"].includes(stage.dependsOnStage.status);
    blockers.push({
      title: stage.dependsOnStage.name,
      subtitle: "Depends on workflow stage",
      meta: titleCase(stage.dependsOnStage.status),
      tone: satisfied ? "green" : "red",
      href: `/projects/${stage.project.id}?tab=workflow`,
    });
  }
  if (stage.complianceEvent) {
    const satisfied = ["RESOLVED", "CLOSED"].includes(stage.complianceEvent.status);
    blockers.push({
      title: stage.complianceEvent.title,
      subtitle: `Depends on compliance event · ${stage.complianceEvent.severity}`,
      meta: titleCase(stage.complianceEvent.status),
      tone: satisfied ? "green" : "red",
      href: `/compliance/${stage.complianceEvent.id}`,
    });
  }
  if (stage.psir) {
    const satisfied = stage.psir.result === "PASS";
    blockers.push({
      title: stage.psir.title,
      subtitle: `Depends on inspection${stage.psir.referenceNumber ? ` · ${stage.psir.referenceNumber}` : ""}`,
      meta: stage.psir.result,
      tone: satisfied ? "green" : "red",
      href: `/psir/${stage.psir.id}`,
    });
  }

  return {
    title: stage.name,
    subtitle: stage.project.name,
    badges: [
      { label: titleCase(stage.status), tone: statusTone(stage.status) },
      ...(overdue !== null ? [{ label: `${overdue} days overdue`, tone: "red" as Tone }] : []),
    ],
    meta: [
      { label: "Due date", value: fmtDate(stage.dueDate) },
      { label: "Project owner", value: person(stage.project.owner) },
      { label: "Project status", value: titleCase(stage.project.status) },
      { label: "Required", value: stage.isRequired ? "Yes" : "No" },
      { label: "Stage opened", value: fmtDate(stage.createdAt) },
      ...(stage.description ? [{ label: "Description", value: stage.description }] : []),
    ],
    links: [
      { label: "Open workflow", href: `/projects/${stage.project.id}?tab=workflow` },
      { label: stage.project.name, href: `/projects/${stage.project.id}` },
    ],
    sections: [
      {
        title: `Approvers (${stage.approvals.length})`,
        empty: "No approvers assigned — this stage cannot progress until someone is.",
        items: stage.approvals.map((a) => ({
          title: person(a.approver),
          subtitle: a.comments,
          meta:
            a.status === "PENDING"
              ? `Waiting ${daysBetween(a.createdAt, now)} days`
              : `${titleCase(a.status)}${a.reviewedAt ? ` · ${fmtDate(a.reviewedAt)}` : ""}`,
          tone: statusTone(a.status),
        })),
      },
      {
        title: `Dependencies (${blockers.length})`,
        empty: "This stage has no declared dependencies.",
        items: blockers,
      },
    ],
  };
}

// ─── Project (overdue projects + roadblock stalled-project rows) ─────────────

async function projectDetail(id: string, ctx: ReportContext): Promise<ReportDetail | null> {
  const now = new Date();
  const project = await prisma.project.findFirst({
    where: { id, ...projectScope(ctx) },
    include: {
      owner: { select: { name: true, email: true } },
      category: { select: { name: true } },
      members: { include: { user: { select: { name: true, email: true, role: true } } } },
      workflowStages: {
        where: { status: { in: ["PENDING", "IN_REVIEW"] } },
        orderBy: { sortOrder: "asc" },
        include: { approvals: { where: { status: "PENDING" }, select: { id: true } } },
      },
      _count: { select: { products: { where: { isArchived: false } } } },
    },
  });
  if (!project) return null;

  const overdue =
    project.targetLaunchDate && project.targetLaunchDate < now
      ? daysBetween(project.targetLaunchDate, now)
      : null;

  const recent = await prisma.activityLog.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true, action: true, entityType: true, fieldKey: true,
      oldValue: true, newValue: true, createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  return {
    title: project.name,
    subtitle: [project.brand, project.retailer].filter(Boolean).join(" · ") || null,
    badges: [
      { label: titleCase(project.status), tone: statusTone(project.status) },
      ...(overdue !== null ? [{ label: `${overdue} days past launch`, tone: "red" as Tone }] : []),
    ],
    meta: [
      { label: "Owner", value: person(project.owner) },
      { label: "Target launch", value: fmtDate(project.targetLaunchDate) },
      { label: "Category", value: project.category?.name ?? null },
      { label: "Channel", value: project.channel },
      { label: "Products", value: String(project._count.products) },
      { label: "Last activity", value: `${fmtDate(project.updatedAt)} (${daysBetween(project.updatedAt, now)} days ago)` },
      ...(project.description ? [{ label: "Description", value: project.description }] : []),
    ],
    links: [
      { label: "Open project", href: `/projects/${project.id}` },
      { label: "Workflow", href: `/projects/${project.id}?tab=workflow` },
      { label: "Products", href: `/projects/${project.id}?tab=products` },
    ],
    sections: [
      {
        title: `Open workflow stages (${project.workflowStages.length})`,
        empty: "No open stages — nothing is waiting on approval.",
        items: project.workflowStages.map((s) => ({
          title: s.name,
          subtitle: s.dueDate
            ? s.dueDate < now
              ? `Overdue by ${daysBetween(s.dueDate, now)} days`
              : `Due ${fmtDate(s.dueDate)}`
            : "No due date",
          meta: `${titleCase(s.status)} · ${s.approvals.length} pending`,
          tone: s.dueDate && s.dueDate < now ? "red" : statusTone(s.status),
          href: `/projects/${project.id}?tab=workflow`,
        })),
      },
      {
        title: `Team (${project.members.length + 1})`,
        items: [
          { title: person(project.owner), subtitle: "Owner", meta: "Full access" },
          ...project.members.map((m) => ({
            title: person(m.user),
            subtitle: titleCase(m.user.role),
            meta: m.canEdit ? "Can edit" : "Read only",
          })),
        ],
      },
      {
        title: "Recent activity",
        empty: "No activity recorded.",
        items: recent.map((log) => ({
          title: `${titleCase(log.action)} · ${log.entityType}${log.fieldKey ? ` · ${log.fieldKey}` : ""}`,
          subtitle:
            log.oldValue != null || log.newValue != null
              ? `${log.oldValue ?? "empty"} → ${log.newValue ?? "empty"}`
              : null,
          meta: `${person(log.user)} · ${log.createdAt.toLocaleString()}`,
        })),
      },
    ],
  };
}

// ─── Pipeline bucket (status + owner) ────────────────────────────────────────

async function pipelineDetail(
  status: string,
  ownerId: string,
  ctx: ReportContext
): Promise<ReportDetail | null> {
  const now = new Date();
  if (!Object.values(ProjectStatus).includes(status as ProjectStatus)) return null;
  const projects = await prisma.project.findMany({
    where: { isArchived: false, status: status as ProjectStatus, ownerId, ...projectScope(ctx) },
    include: {
      owner: { select: { name: true, email: true } },
      _count: {
        select: {
          products: { where: { isArchived: false } },
          workflowStages: { where: { status: { in: ["PENDING", "IN_REVIEW"] } } },
        },
      },
    },
    orderBy: { updatedAt: "asc" },
  });
  if (projects.length === 0) return null;

  const owner = person(projects[0].owner);
  const totalProducts = projects.reduce((n, p) => n + p._count.products, 0);
  const avgIdle = Math.round(
    projects.reduce((n, p) => n + daysBetween(p.updatedAt, now), 0) / projects.length
  );

  return {
    title: `${titleCase(status)} — ${owner}`,
    subtitle: `${projects.length} project${projects.length !== 1 ? "s" : ""} in this bucket`,
    badges: [{ label: titleCase(status), tone: statusTone(status) }],
    meta: [
      { label: "Owner", value: owner },
      { label: "Projects", value: String(projects.length) },
      { label: "Products", value: String(totalProducts) },
      { label: "Avg days since update", value: String(avgIdle) },
    ],
    links: [{ label: "All projects", href: "/projects" }],
    sections: [
      {
        title: "Projects",
        items: projects.map((p) => ({
          title: p.name,
          subtitle: [p.brand, p.retailer].filter(Boolean).join(" · ") || null,
          meta: `${p._count.products} products · ${p._count.workflowStages} open stages · idle ${daysBetween(p.updatedAt, now)}d`,
          tone: p.targetLaunchDate && p.targetLaunchDate < now ? "red" : undefined,
          href: `/projects/${p.id}`,
        })),
      },
    ],
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function buildReportDetail(
  type: ReportType,
  params: URLSearchParams,
  ctx: ReportContext
): Promise<ReportDetail | null> {
  const id = params.get("id") ?? "";

  switch (type) {
    case "inspections":
      return id ? inspectionDetail(id, ctx) : null;
    case "compliance":
      return id ? complianceDetail(id, ctx) : null;
    case "overdue-stages":
      return id ? stageDetail(id, ctx) : null;
    case "overdue-projects":
      return id ? projectDetail(id, ctx) : null;
    case "roadblocks": {
      if (!id) return null;
      switch (params.get("kind")) {
        case "stage": return stageDetail(id, ctx);
        case "project": return projectDetail(id, ctx);
        case "inspection": return inspectionDetail(id, ctx);
        default: return null;
      }
    }
    case "pipeline": {
      const status = params.get("status");
      const ownerId = params.get("ownerId");
      return status && ownerId ? pipelineDetail(status, ownerId, ctx) : null;
    }
    // Out-of-sync has its own detail endpoint — it needs per-field sync actions.
    case "out-of-sync":
      return null;
  }
}
