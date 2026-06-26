import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { execFile } from "child_process";
import { promisify } from "util";
import { createCipheriv, createHash, randomBytes } from "crypto";
import { getBackupKey } from "@/lib/backup-key";
import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const execFileAsync = promisify(execFile);

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Accept admin session
  const session = await auth();
  if (session?.user?.id && (await can(session.user.role, "admin:backup"))) return true;

  // Accept Bearer token
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match) {
    const tokenHash = createHash("sha256").update(match[1]).digest("hex");
    const config = await prisma.backupConfig.findFirst({ select: { apiTokenHash: true } });
    if (config?.apiTokenHash && config.apiTokenHash === tokenHash) return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const triggeredBy: string = body.triggeredBy ?? "API";

  const config = await prisma.backupConfig.findFirst();
  if (!config) {
    return NextResponse.json({ error: "Backup not configured" }, { status: 400 });
  }

  let keyBuf: Buffer;
  try { keyBuf = getBackupKey(); } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  const start = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `sympl-backup-${timestamp}.pgenc`;
  const backupDir = config.backupPath;
  let filePath = path.join(backupDir, fileName);

  try {
    mkdirSync(backupDir, { recursive: true });

    const dbUrl = process.env.DATABASE_URL ?? "";
    // pg_dump to stdout
    const { stdout } = await execFileAsync("pg_dump", ["--no-password", "--format=custom", dbUrl], {
      encoding: "buffer",
      maxBuffer: 512 * 1024 * 1024, // 512 MB
    });

    // Encrypt with AES-256-GCM: [16 iv][16 authTag][ciphertext]
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", keyBuf, iv);
    const encrypted = Buffer.concat([cipher.update(stdout), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const payload = Buffer.concat([iv, authTag, encrypted]);

    const ws = createWriteStream(filePath);
    await pipeline(Readable.from(payload), ws);

    const fileSize = statSync(filePath).size;

    // Prune old backups beyond retainCount
    const allBackups = readdirSync(backupDir)
      .filter((f) => f.startsWith("sympl-backup-") && f.endsWith(".pgenc"))
      .map((f) => ({ name: f, mtime: statSync(path.join(backupDir, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const old of allBackups.slice(config.retainCount)) {
      unlinkSync(path.join(backupDir, old.name));
    }

    const log = await prisma.backupLog.create({
      data: {
        status: "SUCCESS",
        filePath,
        fileSizeBytes: BigInt(fileSize),
        durationMs: Date.now() - start,
        triggeredBy,
      },
    });

    await prisma.backupConfig.update({
      where: { id: config.id },
      data: { lastRunAt: new Date() },
    });

    return NextResponse.json({ success: true, filePath, fileSizeBytes: fileSize, durationMs: log.durationMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.backupLog.create({
      data: {
        status: "FAILED",
        filePath,
        durationMs: Date.now() - start,
        errorMessage: message,
        triggeredBy,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
