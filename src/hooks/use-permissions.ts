"use client";

import { useEffect, useState } from "react";
import type { Permission } from "@/lib/permissions";

// Client-side view of the signed-in user's grants, for hiding actions the API
// would refuse. Presentation only — every one of these is enforced server-side,
// so a stale or tampered result can't grant anything.
export function usePermissions() {
  const [permissions, setPermissions] = useState<Set<Permission> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPermissions(new Set((data.permissions ?? []) as Permission[]));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return {
    /** Null until loaded — treat as "unknown", not "denied". */
    permissions,
    loaded: permissions !== null,
    can: (p: Permission) => permissions?.has(p) ?? false,
  };
}
