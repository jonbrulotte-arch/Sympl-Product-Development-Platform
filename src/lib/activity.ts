import { prisma } from "@/lib/prisma";
import type { ActivityAction } from "@prisma/client";

export async function logActivity({
  userId,
  action,
  entityType,
  entityId,
  projectId,
  productId,
  fieldKey,
  oldValue,
  newValue,
  source,
  metadata,
}: {
  userId: string;
  action: ActivityAction;
  entityType: string;
  entityId: string;
  projectId?: string;
  productId?: string;
  fieldKey?: string;
  oldValue?: string;
  newValue?: string;
  source?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}) {
  return prisma.activityLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      projectId,
      productId,
      fieldKey,
      oldValue,
      newValue,
      source,
      metadata,
    },
  });
}
