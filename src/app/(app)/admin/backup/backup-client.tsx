"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import {
  HardDrive, Play, RotateCcw, CheckCircle, XCircle, Clock,
  RefreshCw, ShieldCheck, AlertTriangle, Copy, Terminal,
  Download, Upload, Archive, Trash2,
} from "lucide-react";

type BackupConfig = {
  id: string;
  isEnabled: boolean;
  backupPath: string;
  scheduleType: string;
  scheduleHour: number;
  scheduleMinute: number;
  retainCount: number;
  lastRunAt: string | null;
};

type BackupLog = {
  id: string;
  status: string;
  filePath: string | null;
  fileSizeBytes: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  triggeredBy: string;
  createdAt: string;
};

type BackupKind = "database" | "uploads";

type BackupFile = {
  name: string;
  kind: BackupKind;
  path: string;
  sizeBytes: number;
  createdAt: string;
};

const SCHEDULE_TYPES = [
  { value: "HOURLY", label: "Hourly" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
];

const STATUS_META: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
  SUCCESS:        { icon: <CheckCircle className="h-3.5 w-3.5" />, cls: "text-green-600", label: "Backup succeeded" },
  FAILED:         { icon: <XCircle className="h-3.5 w-3.5" />,    cls: "text-red-600",   label: "Backup failed" },
  RESTORE_SUCCESS:{ icon: <CheckCircle className="h-3.5 w-3.5" />, cls: "text-blue-600",  label: "Restore succeeded" },
  RESTORE_FAILED: { icon: <XCircle className="h-3.5 w-3.5" />,    cls: "text-red-600",   label: "Restore failed" },
};

const KIND_META: Record<BackupKind, { label: string; cls: string }> = {
  database: { label: "Database", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  uploads:  { label: "Files",    cls: "bg-purple-50 text-purple-700 border-purple-200" },
};

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString();
}

export function BackupClient() {
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [logs, setLogs] = useState<BackupLog[]>([]);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"config" | "logs" | "restore">("config");

  // Form state
  const [form, setForm] = useState({
    isEnabled: false,
    backupPath: "/var/backups/sympl",
    scheduleType: "DAILY",
    scheduleHour: 2,
    scheduleMinute: 0,
    retainCount: 7,
  });

  async function load() {
    const [cfgRes, restoreRes] = await Promise.all([
      fetch("/api/admin/backup"),
      fetch("/api/admin/backup/restore"),
    ]);
    if (cfgRes.ok) {
      const data = await cfgRes.json();
      setConfig(data.config);
      setLogs(data.logs ?? []);
      if (data.config) {
        setForm({
          isEnabled: data.config.isEnabled,
          backupPath: data.config.backupPath,
          scheduleType: data.config.scheduleType,
          scheduleHour: data.config.scheduleHour,
          scheduleMinute: data.config.scheduleMinute,
          retainCount: data.config.retainCount,
        });
      }
    }
    if (restoreRes.ok) {
      const d = await restoreRes.json();
      setFiles(d.files ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/admin/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) await load();
    setSaving(false);
  }

  async function runBackup() {
    setRunning(true);
    setRunMsg(null);
    const res = await fetch("/api/admin/backup/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggeredBy: "MANUAL" }),
    });
    const data = await res.json();
    setRunMsg(res.ok
      ? { ok: true, text: `Backup complete — ${fmt(data.fileSizeBytes ?? 0)} in ${data.durationMs}ms` }
      : { ok: false, text: data.error ?? "Backup failed" }
    );
    await load();
    setRunning(false);
  }

  async function archiveFiles() {
    setArchiving(true);
    setRunMsg(null);
    const res = await fetch("/api/admin/backup/files", { method: "POST" });
    const data = await res.json();
    setRunMsg(res.ok
      ? { ok: true, text: `Files archived — ${data.name} (${fmt(data.sizeBytes ?? 0)})` }
      : { ok: false, text: data.error ?? "File archive failed" }
    );
    await load();
    setArchiving(false);
  }

  async function restore(file: BackupFile) {
    const warning = file.kind === "uploads"
      ? `Restore uploaded files from ${file.name}?\n\nFiles in the archive will overwrite files with the same name on this server.`
      : `Restore from ${file.name}?\n\nThis will overwrite ALL current database data. This cannot be undone.`;
    if (!confirm(warning)) return;

    setRestoring(file.name);
    setRestoreMsg(null);
    const res = await fetch("/api/admin/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name }),
    });
    const data = await res.json();
    const counts = data.restored
      ? ` Now holding ${data.restored.projects} project(s) and ${data.restored.products} product(s).`
      : "";
    setRestoreMsg(res.ok
      ? {
          ok: true,
          text: file.kind === "uploads"
            ? "Uploaded files restored successfully."
            : `Database restored successfully.${counts} Please reload the application.`,
        }
      : { ok: false, text: data.error ?? "Restore failed" }
    );
    await load();
    setRestoring(null);
  }

  async function deleteFile(file: BackupFile) {
    if (!confirm(`Delete ${file.name}?\n\nThe file will be permanently removed from the server and can no longer be restored or downloaded.`)) return;

    setDeleting(file.name);
    setRestoreMsg(null);
    const res = await fetch("/api/admin/backup/restore", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name }),
    });
    if (res.ok) {
      setRestoreMsg({ ok: true, text: `Deleted ${file.name}.` });
    } else {
      const data = await res.json().catch(() => ({}));
      setRestoreMsg({ ok: false, text: data.error ?? "Delete failed" });
    }
    await load();
    setDeleting(null);
  }

  // Raw-body upload via XHR so large dumps report real progress.
  function uploadBackup(file: File) {
    setUploadMsg(null);
    setUploadPct(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/backup/upload?name=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = async () => {
      setUploadPct(null);
      let data: { error?: string; kind?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadMsg({ ok: true, text: `Uploaded ${file.name}. Select it below to restore.` });
        await load();
      } else if (xhr.status === 413) {
        // Typically rejected by a reverse proxy before reaching the app —
        // nginx's client_max_body_size defaults to 1 MB.
        setUploadMsg({
          ok: false,
          text: "Upload rejected: file too large (413). If Sympl runs behind a reverse proxy (nginx/Apache), raise its body-size limit — e.g. nginx client_max_body_size — to at least the snapshot size.",
        });
      } else if (xhr.status === 504 || xhr.status === 502) {
        setUploadMsg({
          ok: false,
          text: `Upload interrupted (${xhr.status} from the proxy). For large snapshots, raise the reverse proxy's timeout (e.g. nginx proxy_read_timeout / proxy_send_timeout), then check the list below — the file may not have been saved.`,
        });
      } else {
        setUploadMsg({ ok: false, text: data.error ?? `Upload failed (${xhr.status})` });
      }
    };
    xhr.onerror = () => {
      setUploadPct(null);
      setUploadMsg({ ok: false, text: "Upload failed — connection error" });
    };
    xhr.send(file);
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-gray-500" /> Backup & Restore
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Encrypted database backups and uploaded file archives.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={archiveFiles} disabled={archiving || !config} size="sm" variant="outline">
            <Archive className={`h-3.5 w-3.5 mr-1.5 ${archiving ? "animate-pulse" : ""}`} />
            {archiving ? "Archiving…" : "Archive Files"}
          </Button>
          <Button onClick={runBackup} disabled={running || !config} size="sm">
            <Play className={`h-3.5 w-3.5 mr-1.5 ${running ? "animate-pulse" : ""}`} />
            {running ? "Running…" : "Back Up Database"}
          </Button>
        </div>
      </div>

      {runMsg && (
        <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${runMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {runMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          {runMsg.text}
        </div>
      )}

      {/* Status bar */}
      {config && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${config.isEnabled ? "bg-green-500" : "bg-gray-300"}`} />
            <span className="text-gray-700 font-medium">{config.isEnabled ? "Enabled" : "Disabled"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <Clock className="h-3.5 w-3.5" />
            Schedule: <span className="font-medium text-gray-700">{config.scheduleType}</span>
            {config.scheduleType !== "HOURLY" && (
              <span>at {String(config.scheduleHour).padStart(2, "0")}:{String(config.scheduleMinute).padStart(2, "0")}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            AES-256-GCM encrypted
          </div>
          {config.lastRunAt && (
            <div className="text-gray-500 text-xs ml-auto">Last run: {fmtDate(config.lastRunAt)}</div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-0">
        {(["config", "logs", "restore"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {t === "logs" ? `Activity Log (${logs.length})` : t === "restore" ? `Restore (${files.length} files)` : "Configuration"}
          </button>
        ))}
      </div>

      {/* Config tab */}
      {activeTab === "config" && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={form.isEnabled} onChange={(e) => setForm(f => ({ ...f, isEnabled: e.target.checked }))} />
              <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </label>
            <span className="text-sm font-medium text-gray-700">Enable scheduled backups</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Backup Directory</label>
              <Input value={form.backupPath} onChange={(e) => setForm(f => ({ ...f, backupPath: e.target.value }))} placeholder="/var/backups/sympl" />
              <p className="text-xs text-gray-500 mt-1">Must be writable by the Node.js process.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Schedule</label>
              <select
                value={form.scheduleType}
                onChange={(e) => setForm(f => ({ ...f, scheduleType: e.target.value }))}
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SCHEDULE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {form.scheduleType !== "HOURLY" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Time (24h)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={0} max={23}
                    value={form.scheduleHour}
                    onChange={(e) => setForm(f => ({ ...f, scheduleHour: Number(e.target.value) }))}
                    className="w-20 text-center"
                  />
                  <span className="text-gray-500">:</span>
                  <Input
                    type="number" min={0} max={59}
                    value={form.scheduleMinute}
                    onChange={(e) => setForm(f => ({ ...f, scheduleMinute: Number(e.target.value) }))}
                    className="w-20 text-center"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Retain last N backups</label>
              <Input
                type="number" min={1} max={90}
                value={form.retainCount}
                onChange={(e) => setForm(f => ({ ...f, retainCount: Number(e.target.value) }))}
                className="w-24"
              />
            </div>
          </div>

          {/* Cron Setup */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-medium text-gray-800">Cron Job Setup</h3>
                <span className="text-xs text-gray-500">backs up database + uploaded files</span>
              </div>
              <p className="text-xs text-gray-500">
                Add this line to your server&apos;s crontab (<code className="font-mono bg-gray-100 px-1 rounded">crontab -e</code>) to run
                automated backups. The script calls the API for the encrypted database dump and separately archives
                the <code className="font-mono bg-gray-100 px-1 rounded">data/uploads/</code> directory.
              </p>
              {(() => {
                const min = form.scheduleMinute;
                const hr = form.scheduleHour;
                const cron = form.scheduleType === "HOURLY" ? `${min} * * * *`
                  : form.scheduleType === "WEEKLY" ? `${min} ${hr} * * 0`
                  : `${min} ${hr} * * *`;
                const cmd = `${cron} /opt/sympl/scripts/backup.sh https://YOUR_APP_URL <API_TOKEN> ${form.backupPath}`;
                return (
                  <div className="flex items-start gap-2">
                    <code className="flex-1 text-xs font-mono bg-gray-900 text-green-400 rounded-lg px-4 py-3 block whitespace-pre-wrap break-all select-all">
                      {cmd}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 mt-1"
                      onClick={async () => {
                        if (!(await copyToClipboard(cmd))) window.prompt("Copy this command:", cmd);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })()}
              <p className="text-xs text-gray-500">
                Replace <code className="font-mono bg-gray-100 px-1 rounded">YOUR_APP_URL</code> with your application URL,
                and <code className="font-mono bg-gray-100 px-1 rounded">&lt;API_TOKEN&gt;</code> with the automation token from{" "}
                <a href="/admin/api-tokens" className="text-indigo-600 hover:underline">Admin → API Tokens</a>.
                Copy <code className="font-mono bg-gray-100 px-1 rounded">scripts/backup.sh</code> to <code className="font-mono bg-gray-100 px-1 rounded">/opt/sympl/scripts/</code> on
                your server and make it executable (<code className="font-mono bg-gray-100 px-1 rounded">chmod +x</code>).
              </p>
            </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? "Saving…" : "Save Configuration"}
            </Button>
          </div>
        </div>
      )}

      {/* Logs tab */}
      {activeTab === "logs" && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">No backup activity yet.</div>
          ) : logs.map((log) => {
            const meta = STATUS_META[log.status] ?? { icon: <Clock className="h-3.5 w-3.5" />, cls: "text-gray-500", label: log.status };
            return (
              <div key={log.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-2 text-sm font-medium ${meta.cls}`}>
                    {meta.icon} {meta.label}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{log.triggeredBy.replace(/_/g, " ")}</span>
                    {log.fileSizeBytes && <span>{fmt(Number(log.fileSizeBytes))}</span>}
                    {log.durationMs && <span>{log.durationMs}ms</span>}
                    <span>{fmtDate(log.createdAt)}</span>
                  </div>
                </div>
                {log.filePath && (
                  <p className="text-xs font-mono text-gray-500 mt-1 truncate">{log.filePath}</p>
                )}
                {log.errorMessage && (
                  <p className="text-xs text-red-600 mt-1 line-clamp-3">{log.errorMessage}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Restore tab */}
      {activeTab === "restore" && (
        <div className="space-y-4">
          {restoreMsg && (
            <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${restoreMsg.ok ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {restoreMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              <span className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{restoreMsg.text}</span>
            </div>
          )}

          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Restoring a <strong>database</strong> snapshot will permanently overwrite all current data and cannot be undone. Restoring a <strong>files</strong> archive overwrites uploaded files of the same name, leaving other files in place.</span>
          </div>

          {/* Upload — for migrating a snapshot from another server */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-medium text-gray-800">Upload a Snapshot</h3>
              <span className="text-xs text-gray-500">for migrating from another server</span>
            </div>
            <p className="text-xs text-gray-500">
              Upload a <code className="font-mono bg-gray-100 px-1 rounded">.pgenc</code> database backup or
              a <code className="font-mono bg-gray-100 px-1 rounded">.tar.gz</code> files archive downloaded from
              another Sympl server. It is added to the list below, where you can restore it.
            </p>

            {uploadMsg && (
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${uploadMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {uploadMsg.ok ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                {uploadMsg.text}
              </div>
            )}

            {uploadPct !== null ? (
              <div className="space-y-1.5">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${uploadPct}%` }} />
                </div>
                <p className="text-xs text-gray-500">Uploading… {uploadPct}%</p>
              </div>
            ) : (
              <label className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-md px-3 py-1.5 cursor-pointer hover:bg-gray-50 text-gray-700">
                <Upload className="h-3.5 w-3.5" />
                Choose file…
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadBackup(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}

            <p className="text-xs text-gray-500">
              A database backup can only be decrypted on a server with the same <code className="font-mono bg-gray-100 px-1 rounded">BACKUP_ENCRYPTION_KEY</code> (or <code className="font-mono bg-gray-100 px-1 rounded">NEXTAUTH_SECRET</code>) as the server that created it.
            </p>
          </div>

          {files.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">No backup files found in {config?.backupPath ?? "backup directory"}.</div>
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.path} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${KIND_META[f.kind].cls}`}>
                        {KIND_META[f.kind].label}
                      </span>
                      <p className="text-sm font-medium text-gray-800 font-mono truncate">{f.name}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{fmt(f.sizeBytes)} · {fmtDate(f.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/api/admin/backup/download?name=${encodeURIComponent(f.name)}`}
                      download
                      className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                      disabled={restoring === f.name}
                      onClick={() => restore(f)}
                    >
                      <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${restoring === f.name ? "animate-spin" : ""}`} />
                      {restoring === f.name ? "Restoring…" : "Restore"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                      disabled={deleting === f.name}
                      onClick={() => deleteFile(f)}
                      title="Delete this backup file"
                    >
                      <Trash2 className={`h-3.5 w-3.5 ${deleting === f.name ? "animate-pulse" : ""}`} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
