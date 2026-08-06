"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SalsifyConfig {
  organizationId: string;
  channelId: string;
  isEnabled: boolean;
  salsifyDebugEnabled: boolean;
}

export function SalsifySettingsClient() {
  const [config, setConfig] = useState<SalsifyConfig>({
    organizationId: "",
    channelId: "",
    isEnabled: false,
    salsifyDebugEnabled: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/salsify")
      .then((r) => r.json())
      .then((data) => {
        if (data) setConfig(data);
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/salsify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Save failed");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <img src="https://www.salsify.com/favicon.ico" alt="" className="h-5 w-5" />
          Salsify Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.isEnabled}
              onChange={(e) => setConfig((c) => ({ ...c, isEnabled: e.target.checked }))}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm font-medium text-gray-700">Enable Salsify Sync</span>
            {config.isEnabled && (
              <span className="text-xs text-green-600 font-medium">● Active</span>
            )}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.salsifyDebugEnabled}
              onChange={(e) => setConfig((c) => ({ ...c, salsifyDebugEnabled: e.target.checked }))}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm font-medium text-gray-700">Enable Salsify Debug</span>
            <span className="text-xs text-gray-400">— shows Salsify Log &amp; Debug in the sidebar</span>
          </label>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
              Salsify API keys are set per user, not here. Each person adds their own key
              under <strong>My Profile → Salsify API Key</strong>, and every sync authenticates
              as the user who ran it. Users without a key will be prompted to add one.
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Organization ID</label>
            <Input
              placeholder="e.g. your-org-name"
              value={config.organizationId}
              onChange={(e) => setConfig((c) => ({ ...c, organizationId: e.target.value }))}
            />
            <p className="text-xs text-gray-400 mt-1">
              Your Salsify organization identifier (slug)
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Channel ID (optional)</label>
            <Input
              placeholder="Leave blank to use default channel"
              value={config.channelId ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, channelId: e.target.value }))}
            />
          </div>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
          {saved && <span className="text-sm text-green-600">Settings saved</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>

        <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-800 space-y-1">
          <p className="font-medium">How Salsify sync works:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Configure attribute definitions with &quot;Salsify Property ID&quot; in Admin → Attributes</li>
            <li>Enable attributes for Salsify sync using the &quot;Enabled for Salsify&quot; toggle</li>
            <li>When a project reaches &quot;Export Ready&quot; status, a &quot;Sync to Salsify&quot; button appears</li>
            <li>Clicking sync sends all product data for Salsify-enabled attributes to your org</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
