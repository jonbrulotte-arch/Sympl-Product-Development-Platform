"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HardDrive, Play, RotateCcw, CheckCircle, XCircle, Clock,
  RefreshCw, ShieldCheck, AlertTriangle, Key, Copy, Eye, EyeOff, Trash2,
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

type BackupFile = {
  name: string;
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

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
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
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"config" | "logs" | "restore">("config");
  const [hasToken, setHasToken] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [tokenWorking, setTokenWorking] = useState(false);

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
        setHasToken(!!data.config.hasApiToken);
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

  async function restore(filePath: string) {
    if (!confirm(`Restore from ${filePath.split("/").pop()}?\n\nThis will overwrite ALL current data. This cannot be undone.`)) return;
    setRestoring(filePath);
    setRestoreMsg(null);
    const res = await fetch("/api/admin/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    });
    const data = await res.json();
    setRestoreMsg(res.ok
      ? { ok: true, text: "Restore completed successfully. Please reload the application." }
      : { ok: false, text: data.error ?? "Restore failed" }
    );
    await load();
    setRestoring(null);
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-gray-500" /> Backup & Restore
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Encrypted local backups of the PostgreSQL database.</p>
        </div>
        <Button onClick={runBackup} disabled={running || !config} size="sm">
          <Play className={`h-3.5 w-3.5 mr-1.5 ${running ? "animate-pulse" : ""}`} />
          {running ? "Running…" : "Run Now"}
        </Button>
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
            <div className="text-gray-400 text-xs ml-auto">Last run: {fmtDate(config.lastRunAt)}</div>
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
              <p className="text-xs text-gray-400 mt-1">Must be writable by the Node.js process.</p>
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

          {/* API Token */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-medium text-gray-800">API Token</h3>
              <span className="text-xs text-gray-400">for automation / external triggers</span>
            </div>

            {newToken ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  Copy this token now — it will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      readOnly
                      type={showToken ? "text" : "password"}
                      value={newToken}
                      className="w-full font-mono text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2 pr-8 text-gray-800"
                    />
                    <button
                      onClick={() => setShowToken((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { navigator.clipboard.writeText(newToken); }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setNewToken(null)}>Done</Button>
                </div>
              </div>
            ) : hasToken ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">A token is active. Use it as <code className="font-mono bg-gray-100 px-1 rounded">Authorization: Bearer &lt;token&gt;</code> when calling <code className="font-mono bg-gray-100 px-1 rounded">POST /api/admin/backup/run</code>.</p>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={tokenWorking}
                    onClick={async () => {
                      if (!confirm("This will invalidate the current token. Generate a new one?")) return;
                      setTokenWorking(true);
                      const res = await fetch("/api/admin/backup/token", { method: "POST" });
                      if (res.ok) { const d = await res.json(); setNewToken(d.token); setHasToken(true); setShowToken(false); }
                      setTokenWorking(false);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={tokenWorking}
                    onClick={async () => {
                      if (!confirm("Revoke the API token? Automations using it will stop working.")) return;
                      setTokenWorking(true);
                      await fetch("/api/admin/backup/token", { method: "DELETE" });
                      setHasToken(false);
                      setTokenWorking(false);
                    }}
                    className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Revoke
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">No token active. Generate one to trigger backups from external automations.</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={tokenWorking}
                  onClick={async () => {
                    setTokenWorking(true);
                    const res = await fetch("/api/admin/backup/token", { method: "POST" });
                    if (res.ok) { const d = await res.json(); setNewToken(d.token); setHasToken(true); setShowToken(false); }
                    setTokenWorking(false);
                  }}
                >
                  <Key className="h-3.5 w-3.5 mr-1" /> Generate Token
                </Button>
              </div>
            )}
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
            <div className="text-center py-12 text-gray-400 text-sm">No backup activity yet.</div>
          ) : logs.map((log) => {
            const meta = STATUS_META[log.status] ?? { icon: <Clock className="h-3.5 w-3.5" />, cls: "text-gray-500", label: log.status };
            return (
              <div key={log.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-2 text-sm font-medium ${meta.cls}`}>
                    {meta.icon} {meta.label}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{log.triggeredBy.replace(/_/g, " ")}</span>
                    {log.fileSizeBytes && <span>{fmt(Number(log.fileSizeBytes))}</span>}
                    {log.durationMs && <span>{log.durationMs}ms</span>}
                    <span>{fmtDate(log.createdAt)}</span>
                  </div>
                </div>
                {log.filePath && (
                  <p className="text-xs font-mono text-gray-400 mt-1 truncate">{log.filePath}</p>
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
              {restoreMsg.text}
            </div>
          )}

          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Restoring will <strong>permanently overwrite all current data</strong> with the backup snapshot. This action cannot be undone.</span>
          </div>

          {files.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No backup files found in {config?.backupPath ?? "backup directory"}.</div>
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.path} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 font-mono">{f.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmt(f.sizeBytes)} · {fmtDate(f.createdAt)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    disabled={restoring === f.path}
                    onClick={() => restore(f.path)}
                  >
                    <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${restoring === f.path ? "animate-spin" : ""}`} />
                    {restoring === f.path ? "Restoring…" : "Restore"}
                  </Button>
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
