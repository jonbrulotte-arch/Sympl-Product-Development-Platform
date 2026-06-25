import { prisma } from "@/lib/prisma";

export async function createNotification(data: {
  userId: string;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  link?: string;
  projectId?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type ?? "info",
      link: data.link ?? null,
      projectId: data.projectId ?? null,
    },
  }).catch(() => {}); // never let notification errors break the caller
}

export async function createNotificationForMany(userIds: string[], data: {
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  link?: string;
  projectId?: string;
}) {
  if (userIds.length === 0) return;
  return prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      title: data.title,
      message: data.message,
      type: data.type ?? "info",
      link: data.link ?? null,
      projectId: data.projectId ?? null,
    })),
    skipDuplicates: true,
  }).catch(() => {});
}
