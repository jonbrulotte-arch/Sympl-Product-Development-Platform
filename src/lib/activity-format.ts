// Presentation helpers for ActivityLog entries.
//
// The log stores raw keys and enum values; these turn them into something a
// person reads without having to know the schema.

export type ActivityLogLike = {
  action: string;
  entityType: string;
  fieldKey: string | null;
  oldValue: string | null;
  newValue: string | null;
  source: string | null;
  metadata?: unknown;
  createdAt: Date | string;
};

const ENTITY_LABELS: Record<string, string> = {
  ProductRecord: "product",
  WorkflowStage: "workflow stage",
  WorkflowApproval: "approval",
  Project: "project",
  ComplianceEvent: "compliance event",
  Psir: "inspection report",
  User: "user account",
  Category: "category",
  AttributeDefinition: "attribute",
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType.replace(/([A-Z])/g, " $1").trim().toLowerCase();
}

// Field keys are camelCase columns (partNumber) or a handful of synthetic keys.
const FIELD_LABELS: Record<string, string> = {
  ownerId: "Owner",
  psirId: "Linked inspection",
  complianceEventId: "Linked compliance event",
  dependsOnStageId: "Stage dependency",
  upc: "UPC",
  htsCode: "HTS Code",
  htsCodeCanada: "HTS Code (Canada)",
  password: "Password",
  approval: "Approval",
};

export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bId\b/, "")
    .trim();
}

export function actionTone(action: string): string {
  switch (action) {
    case "DELETED":
    case "REJECTED":
      return "bg-red-50 text-red-700";
    case "CREATED":
    case "APPROVED":
      return "bg-green-50 text-green-700";
    case "STATUS_CHANGED":
    case "SUBMITTED":
      return "bg-amber-50 text-amber-700";
    case "IMPORTED":
    case "EXPORTED":
      return "bg-purple-50 text-purple-700";
    case "ASSIGNED":
      return "bg-indigo-50 text-indigo-700";
    case "ARCHIVED":
    case "RESTORED":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-blue-50 text-blue-700";
  }
}

/** Enum-ish stored values (EXPORT_READY) shown as words. */
export function prettyValue(v: string): string {
  if (/^[A-Z][A-Z_]+$/.test(v)) {
    return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return v;
}

/**
 * What the entry is *about* — a stage name, a deleted product's part number —
 * pulled from metadata when the row itself no longer carries it.
 */
export function subjectFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ["stageName", "partNumber", "itemName", "name", "title"]) {
    const v = m[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

export function commentFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const c = (metadata as Record<string, unknown>).comment;
  return typeof c === "string" && c.trim() ? c : null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now" / "3h ago" / "Aug 7" — exact date once it stops being recent. */
export function relativeTime(date: Date | string): string {
  const then = new Date(date).getTime();
  const diff = Date.now() - then;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
