import { prisma } from "@/lib/prisma";

export type SalsifyCredentials = {
  apiKey: string;
  organizationId: string;
  channelId: string | null;
};

type Resolved =
  | { ok: true; credentials: SalsifyCredentials }
  | { ok: false; error: string; status: number };

// Salsify authenticates as the person who triggered the action, so the key
// comes from the user while org/channel stay global in admin settings.
export async function resolveSalsifyCredentials(userId: string): Promise<Resolved> {
  const [config, user] = await Promise.all([
    prisma.salsifyConfig.findFirst({ where: { isEnabled: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { salsifyApiKey: true } }),
  ]);

  if (!config) {
    return { ok: false, error: "Salsify is not enabled. An admin must enable it in Admin → Settings.", status: 400 };
  }
  if (!config.organizationId) {
    return { ok: false, error: "Salsify organization ID is not set. An admin must configure it in Admin → Settings.", status: 400 };
  }

  const apiKey = user?.salsifyApiKey?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "No Salsify API key on your account. Add your personal key in My Profile → Salsify API Key.",
      status: 400,
    };
  }

  return {
    ok: true,
    credentials: { apiKey, organizationId: config.organizationId, channelId: config.channelId },
  };
}

// Shown in place of the key everywhere it is read back.
export function maskApiKey(key: string | null | undefined): string {
  if (!key) return "";
  return "••••••••" + key.slice(-4);
}
