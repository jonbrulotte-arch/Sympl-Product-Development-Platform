import path from "path";
import { unlink } from "fs/promises";

// Attachments are stored OUTSIDE public/ so the Next static server can never
// hand them out without a session. URLs keep the historical "/uploads/..."
// shape; src/app/uploads/[...path]/route.ts serves them after an auth check.
// (Files still sitting in public/uploads from before this change are served
// statically and bypass auth until moved: `mv public/uploads/* data/uploads/`.)
export const PRIVATE_UPLOAD_ROOT = path.join(process.cwd(), "data");
const LEGACY_PUBLIC_ROOT = path.join(process.cwd(), "public");

export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20 MB

// Extension allowlist. Notably excludes .html/.svg/.xml — anything a browser
// would execute or run scripts from when served from our origin.
const ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic",
  ".pdf",
  ".doc", ".docx", ".xls", ".xlsx", ".csv", ".ppt", ".pptx",
  ".txt", ".rtf", ".md",
  ".zip",
  ".eml", ".msg",
]);

export function isAllowedUploadName(fileName: string): boolean {
  return ALLOWED_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

// Types a browser may render inline safely; everything else is forced to
// download so an uploaded file can never execute in the app's origin.
const INLINE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
};

export function contentTypeFor(fileName: string): { mime: string; inline: boolean } {
  const ext = path.extname(fileName).toLowerCase();
  const inlineMime = INLINE_MIME[ext];
  if (inlineMime) return { mime: inlineMime, inline: true };
  return { mime: "application/octet-stream", inline: false };
}

// Callers hold these paths in three shapes: "uploads/psir/x.pdf" from the DB,
// "/uploads/2026-08/x.pdf" from a comment attachment URL, and occasionally a
// full "http://host/uploads/..." href. A leading slash is the dangerous one —
// path.resolve ignores its base entirely when the second argument is absolute,
// so "/uploads/x" silently resolved to the filesystem root and every delete
// became a no-op. Normalize to a bare relative path before resolving.
export function toRelativeUploadPath(input: string): string | null {
  let value = input.trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try { value = new URL(value).pathname; } catch { return null; }
  }
  value = decodeURIComponent(value).replace(/^\/+/, "");
  if (!value || value.includes("\0")) return null;
  return value;
}

// Resolves a stored upload path to an absolute path inside the private root,
// rejecting any traversal outside it.
export function resolvePrivateUploadPath(relPath: string): string | null {
  const normalized = toRelativeUploadPath(relPath);
  if (!normalized) return null;

  const root = path.join(PRIVATE_UPLOAD_ROOT, "uploads");
  const resolved = path.resolve(PRIVATE_UPLOAD_ROOT, normalized);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

// Comment attachments are embedded in the comment body as an HTML comment
// holding a JSON array. Returns the relative paths ("uploads/…") of every
// attachment, ready for deleteUploadFile.
export function parseCommentAttachments(content: string): string[] {
  const match = content.match(/<!--attachments:(\[.*?\])-->/s);
  if (!match) return [];
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((a) => (a && typeof a === "object" ? (a as { url?: unknown }).url : undefined))
      .filter((u): u is string => typeof u === "string" && u.trim() !== "")
      .map((u) => toRelativeUploadPath(u))
      .filter((u): u is string => !!u && u.startsWith("uploads/"));
  } catch {
    return [];
  }
}

async function tryUnlink(target: string): Promise<boolean> {
  try {
    await unlink(target);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // A missing file is the expected case for the legacy location, and for
    // anything already cleaned up. Anything else is a real problem worth seeing.
    if (code !== "ENOENT") {
      console.error(`[uploads] failed to delete ${target}: ${code ?? err}`);
    }
    return false;
  }
}

// Removes an uploaded file wherever it lives — private root for new uploads,
// legacy public/ for files created before storage was locked down. Returns
// whether anything was actually removed, and logs when nothing was, so a
// silent no-op can't masquerade as a successful cleanup.
export async function deleteUploadFile(relPath: string): Promise<boolean> {
  const normalized = toRelativeUploadPath(relPath);
  if (!normalized) {
    console.warn(`[uploads] unusable path, skipping delete: ${JSON.stringify(relPath)}`);
    return false;
  }

  let deleted = false;

  const priv = resolvePrivateUploadPath(normalized);
  if (priv) deleted = await tryUnlink(priv);

  // Legacy location (pre-hardening uploads)
  const legacy = path.resolve(LEGACY_PUBLIC_ROOT, normalized);
  if (legacy.startsWith(path.join(LEGACY_PUBLIC_ROOT, "uploads") + path.sep)) {
    if (await tryUnlink(legacy)) deleted = true;
  }

  if (!deleted) {
    console.warn(`[uploads] nothing deleted for ${normalized} (looked in ${priv ?? "<rejected>"})`);
  }
  return deleted;
}
