import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/email";

// Inbox categories — drive the filter tabs on /inbox and the per-user
// preference toggles in Profile → Notification Preferences.
export const NOTIFICATION_CATEGORIES = [
  "ASSIGNMENT",   // added to a project, assigned as approver
  "WORKFLOW",     // votes cast, stages completed, due soon / overdue
  "COMMENT",      // new comments on your projects
  "MENTION",      // @mentions directed at you
  "COMPLIANCE",   // compliance events created / changed on your projects
  "INSPECTION",   // PSIRs created / changed covering your projects
  "GENERAL",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type ChannelPrefs = { inbox: boolean; email: boolean };
export type NotificationPrefs = Partial<Record<NotificationCategory, ChannelPrefs>>;

// Missing keys default to inbox ON, email ON for MENTION/ASSIGNMENT and
// email OFF for the chattier categories — sensible defaults so users aren't
// spammed before they've ever opened preferences.
export function defaultChannelPrefs(category: NotificationCategory): ChannelPrefs {
  const emailByDefault = category === "MENTION" || category === "ASSIGNMENT";
  return { inbox: true, email: emailByDefault };
}

export function resolvePrefs(prefs: NotificationPrefs | null | undefined, category: NotificationCategory): ChannelPrefs {
  const stored = prefs?.[category];
  const defaults = defaultChannelPrefs(category);
  return {
    inbox: stored?.inbox ?? defaults.inbox,
    email: stored?.email ?? defaults.email,
  };
}

type NotificationData = {
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  category?: NotificationCategory;
  link?: string;
  projectId?: string;
  // Optional email body; when omitted, email sends use a simple wrapper
  // around title/message.
  emailHtml?: string;
};

// Preference-aware dispatch: creates inbox notifications for users who have
// the category's inbox channel on, and emails users who have the email
// channel on. Failures never propagate to the caller.
export async function createNotificationForMany(userIds: string[], data: NotificationData) {
  if (userIds.length === 0) return;
  const category = data.category ?? "GENERAL";

  try {
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] }, isActive: true },
      select: {
        id: true,
        email: true,
        userPreferences: { select: { notificationPrefs: true } },
      },
    });

    const inboxIds: string[] = [];
    const emailTo: string[] = [];
    for (const u of users) {
      const channels = resolvePrefs(u.userPreferences?.notificationPrefs as NotificationPrefs | null, category);
      if (channels.inbox) inboxIds.push(u.id);
      if (channels.email) emailTo.push(u.email);
    }

    if (inboxIds.length > 0) {
      await prisma.notification.createMany({
        data: inboxIds.map((userId) => ({
          userId,
          title: data.title,
          message: data.message,
          type: data.type ?? "info",
          category,
          link: data.link ?? null,
          projectId: data.projectId ?? null,
        })),
        skipDuplicates: true,
      });
    }

    const html = data.emailHtml ?? `<p><strong>${data.title}</strong></p><p>${data.message}</p><p style="font-size:12px;color:#888">Sent by Sympl PM${data.link ? ` — open the app and go to ${data.link}` : ""}. Manage notification preferences in your profile.</p>`;
    for (const to of emailTo) {
      await sendMail(to, data.title, html);
    }
  } catch { /* never break the caller */ }
}

export async function createNotification(data: NotificationData & { userId: string }) {
  return createNotificationForMany([data.userId], data);
}

// Owners of the projects containing the given products — used to notify PMs
// when compliance events / inspections touch their projects.
export async function getOwnerIdsForProducts(productIds: string[]): Promise<string[]> {
  if (productIds.length === 0) return [];
  const products = await prisma.productRecord.findMany({
    where: { id: { in: productIds } },
    select: { project: { select: { ownerId: true } } },
  });
  return [...new Set(products.map((p) => p.project.ownerId))];
}
