"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck } from "lucide-react";

export function ModulesSettingsClient() {
  const [inspectionsEnabled, setInspectionsEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/modules")
      .then((r) => r.json())
      .then((data) => {
        if (typeof data?.inspectionsEnabled === "boolean") setInspectionsEnabled(data.inspectionsEnabled);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function toggle(next: boolean) {
    setInspectionsEnabled(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionsEnabled: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Save failed");
        setInspectionsEnabled(!next);
      }
    } catch {
      setError("Network error");
      setInspectionsEnabled(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-violet-600" />
          Inspections Module
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={inspectionsEnabled}
            disabled={!loaded || saving}
            onChange={(e) => toggle(e.target.checked)}
            className="h-4 w-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span>
            <span className="text-sm font-medium text-gray-900 block">Enable Inspections module</span>
            <span className="text-xs text-gray-500 block mt-0.5">
              When disabled, the Inspections module is hidden platform-wide: the sidebar entry,
              inspection pages, the Inspections tab on product records, the Inspection Attributes admin
              page, and inspection reports. All inspection data is retained — re-enabling restores
              everything exactly as it was.
            </span>
          </span>
        </label>
        {!inspectionsEnabled && loaded && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Inspections module is currently disabled. Existing inspection reports and attributes are
            preserved but hidden from all users.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
