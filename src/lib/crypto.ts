import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const KEY_ENV = "ENCRYPTION_KEY"; // 64-char hex string

let _warnedNoKey = false;

function getKey(): Buffer | null {
  const hex = process.env[KEY_ENV];
  if (!hex) {
    if (!_warnedNoKey) {
      console.warn(
        `${KEY_ENV} environment variable is not set — field encryption is disabled (pass-through). ` +
          "Set a 64-character hex string for production."
      );
      _warnedNoKey = true;
    }
    return null;
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(encoded: string): string {
  const key = getKey();
  if (!key) return encoded;
  // Legacy plaintext values pass through
  if (!isEncrypted(encoded)) return encoded;
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

// Returns true if the value looks like it was encrypted (base64, right minimum length)
export function isEncrypted(value: string): boolean {
  if (value.length < 40) return false; // iv(12) + tag(16) + at least 1 byte = 29 bytes = ~40 base64 chars
  try {
    Buffer.from(value, "base64");
    return true;
  } catch {
    return false;
  }
}
