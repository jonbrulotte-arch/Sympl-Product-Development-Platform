import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@prisma/client";

const statusConfig: Record<ProjectStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "purple" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  IN_PROGRESS: { label: "In Progress", variant: "default" },
  NEEDS_REVIEW: { label: "Needs Review", variant: "warning" },
  CHANGES_REQUESTED: { label: "Changes Requested", variant: "destructive" },
  APPROVED: { label: "Approved", variant: "success" },
  EXPORT_READY: { label: "Export Ready", variant: "purple" },
  ARCHIVED: { label: "Archived", variant: "outline" },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
