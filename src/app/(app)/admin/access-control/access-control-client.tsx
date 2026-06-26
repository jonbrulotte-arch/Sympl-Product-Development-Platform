"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Permission, PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type PermissionMeta = typeof PERMISSIONS;

interface Props {
  matrix: Record<string, Record<Permission, boolean>>;
  permissions: PermissionMeta;
  roles: string[];
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  PRODUCT_MANAGER: "Product Manager",
  CONTRIBUTOR: "Contributor",
  REVIEWER: "Reviewer",
  APPROVER: "Approver",
  VIEWER: "Viewer",
};

// These are always locked for ADMIN to prevent self-lockout
const ADMIN_LOCKED = new Set(["admin:users", "admin:settings"]);

export function AccessControlClient({ matrix, permissions, roles }: Props) {
  const [local, setLocal] = useState<Record<string, Record<Permission, boolean>>>(
    JSON.parse(JSON.stringify(matrix))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permKeys = Object.keys(permissions) as Permission[];

  const toggle = (role: string, perm: Permission) => {
    if (role === "ADMIN" && ADMIN_LOCKED.has(perm)) return;
    setLocal((prev) => ({
      ...prev,
      [role]: { ...prev[role], [perm]: !prev[role][perm] },
    }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const d = await res.json();
        setError(d.error ?? "Save failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  // Group permissions by prefix
  const groups: Record<string, Permission[]> = {};
  for (const p of permKeys) {
    const group = p.split(":")[0];
    if (!groups[group]) groups[group] = [];
    groups[group].push(p);
  }

  const groupLabels: Record<string, string> = {
    admin: "Admin Modules",
    projects: "Projects",
    products: "Products",
  };

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 font-semibold text-gray-700 w-64">Permission</th>
              {roles.map((role) => (
                <th key={role} className="px-4 py-3 text-center font-semibold text-gray-700 min-w-[100px]">
                  {ROLE_LABELS[role] ?? role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([group, perms]) => (
              <>
                <tr key={`group-${group}`} className="border-b border-gray-100 bg-gray-50/60">
                  <td colSpan={roles.length + 1} className="px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {groupLabels[group] ?? group}
                  </td>
                </tr>
                {perms.map((perm) => {
                  const meta = permissions[perm];
                  return (
                    <tr key={perm} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-800">{meta.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{meta.description}</div>
                      </td>
                      {roles.map((role) => {
                        const locked = role === "ADMIN" && ADMIN_LOCKED.has(perm);
                        const granted = local[role]?.[perm] ?? false;
                        return (
                          <td key={role} className="px-4 py-3 text-center">
                            <button
                              onClick={() => toggle(role, perm)}
                              disabled={locked}
                              title={locked ? "Cannot remove from Admin to prevent lockout" : undefined}
                              className={cn(
                                "w-9 h-5 rounded-full transition-colors relative inline-flex items-center shrink-0",
                                granted ? "bg-blue-600" : "bg-gray-200",
                                locked && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              <span className={cn(
                                "inline-block w-4 h-4 rounded-full bg-white shadow transition-transform",
                                granted ? "translate-x-4" : "translate-x-0.5"
                              )} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
        {saved && <span className="text-sm text-green-600">Changes saved</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
        <p className="text-xs text-gray-400 ml-auto">Changes take effect within 30 seconds (cache TTL).</p>
      </div>

      <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
        <strong>Note:</strong> Admin always retains <em>Manage Users</em> and <em>Global Settings</em> to prevent self-lockout. All other permissions can be freely adjusted.
      </div>
    </div>
  );
}
