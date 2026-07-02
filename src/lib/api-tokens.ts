import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";

// Scoped API tokens (prefix "spt_") for external integrations — ERP/BI tools
// pulling product data without a browser session. Only the SHA-256 hash is
// stored; the plaintext token is shown once at creation.

export function generateApiToken(): { token: string; tokenHash: string } {
  const token = `spt_${randomBytes(24).toString("hex")}`;
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Validates a Bearer token from the request against the given scope.
// Returns the token record's id when valid, null otherwise.
export async function authenticateApiToken(req: Request, requiredScope: string): Promise<string | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(spt_.+)$/i);
  if (!match) return null;

  const record = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(match[1]) },
    select: { id: true, scope: true, revokedAt: true },
  });
  if (!record || record.revokedAt || record.scope !== requiredScope) return null;

  prisma.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return record.id;
}
