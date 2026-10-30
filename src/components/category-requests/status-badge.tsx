import { Badge } from "@/components/ui/badge";

const VARIANT = {
  PENDING: "warning",
  NEEDS_INFO: "purple",
  APPROVED: "default",
  REJECTED: "destructive",
  COMPLETED: "success",
} as const;
const LABEL = { PENDING: "Pending", NEEDS_INFO: "Needs Info", APPROVED: "Approved", REJECTED: "Rejected", COMPLETED: "Completed" } as const;

export type RequestStatus = keyof typeof VARIANT;

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
