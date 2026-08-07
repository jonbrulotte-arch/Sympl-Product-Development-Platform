import path from "path";

// Naming conventions shared by the backup API and scripts/backup.sh.
export const DB_BACKUP_PREFIX = "sympl-backup-";
export const DB_BACKUP_EXT = ".pgenc";
export const UPLOADS_PREFIX = "sympl-uploads-";
export const UPLOADS_EXT = ".tar.gz";

export type BackupKind = "database" | "uploads";

export function classifyBackupFile(name: string): BackupKind | null {
  if (name.startsWith(DB_BACKUP_PREFIX) && name.endsWith(DB_BACKUP_EXT)) return "database";
  if (name.startsWith(UPLOADS_PREFIX) && name.endsWith(UPLOADS_EXT)) return "uploads";
  return null;
}

// Resolves a caller-supplied backup file name to an absolute path inside the
// configured backup directory. Returns null unless the name is a bare filename
// matching a known backup pattern and lands inside the directory — this is the
// only sanitization between an admin-supplied string and the filesystem.
export function resolveBackupFile(
  backupDir: string,
  name: string
): { path: string; kind: BackupKind } | null {
  if (!name || name !== path.basename(name)) return null;
  const kind = classifyBackupFile(name);
  if (!kind) return null;

  const resolvedDir = path.resolve(backupDir);
  const resolved = path.resolve(resolvedDir, name);
  if (!resolved.startsWith(resolvedDir + path.sep)) return null;

  return { path: resolved, kind };
}

// Timestamp fragment used in generated backup file names (filesystem-safe ISO).
export function backupTimestamp(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-");
}
