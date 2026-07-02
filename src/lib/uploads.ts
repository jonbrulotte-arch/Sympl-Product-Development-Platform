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

// Resolves a DB-stored relative path ("uploads/psir/x.pdf") to an absolute
// path inside the private root, rejecting any traversal outside it.
export function resolvePrivateUploadPath(relPath: string): string | null {
  const root = path.join(PRIVATE_UPLOAD_ROOT, "uploads");
  const resolved = path.resolve(PRIVATE_UPLOAD_ROOT, relPath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

// Removes an uploaded file wherever it lives — private root for new uploads,
// legacy public/ for files created before storage was locked down.
export async function deleteUploadFile(relPath: string): Promise<void> {
  const priv = resolvePrivateUploadPath(relPath);
  if (priv) await unlink(priv).catch(() => {});
  // Legacy location (pre-hardening uploads)
  const legacy = path.resolve(LEGACY_PUBLIC_ROOT, relPath);
  if (legacy.startsWith(path.join(LEGACY_PUBLIC_ROOT, "uploads") + path.sep)) {
    await unlink(legacy).catch(() => {});
  }
}
