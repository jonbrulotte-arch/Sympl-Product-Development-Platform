import { createHmac } from "crypto";

/**
 * Returns a 32-byte Buffer for AES-256-GCM backup encryption.
 *
 * Priority:
 *  1. BACKUP_ENCRYPTION_KEY env var (hex string, min 32 chars)
 *  2. NEXTAUTH_SECRET derived via HMAC-SHA256 with a fixed info label
 *
 * Using HKDF-style derivation keeps the backup key separate from the raw
 * NEXTAUTH_SECRET even though it originates from the same material.
 */
export function getBackupKey(): Buffer {
  const explicit = process.env.BACKUP_ENCRYPTION_KEY;
  if (explicit && explicit.length >= 32) {
    // Accept hex (64 chars → 32 bytes) or raw string (padded/truncated)
    if (/^[0-9a-fA-F]{64}$/.test(explicit)) {
      return Buffer.from(explicit, "hex");
    }
    return Buffer.from(explicit.slice(0, 32).padEnd(32, "0"));
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("No encryption key available — set BACKUP_ENCRYPTION_KEY or NEXTAUTH_SECRET");

  console.warn(
    "BACKUP_ENCRYPTION_KEY is not set — falling back to NEXTAUTH_SECRET. Set a dedicated backup key for production."
  );

  // HMAC-SHA256(NEXTAUTH_SECRET, "sympl-backup-v1") → 32 bytes
  return createHmac("sha256", secret).update("sympl-backup-v1").digest();
}
