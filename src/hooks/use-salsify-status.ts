"use client";

import { useEffect, useState } from "react";

export type SalsifyStatus = {
  /** Salsify is switched on and has an organization ID. */
  enabled: boolean;
  /** The signed-in user has a personal API key on file. */
  hasApiKey: boolean;
  /** Both of the above — a sync can actually succeed. */
  ready: boolean;
  /** Why it isn't ready, phrased for the person reading it. */
  blockedReason: string | null;
};

// Whether a sync would work, known before the user clicks rather than after.
// The server re-checks all of this on every sync — this only decides what the
// button says.
export function useSalsifyStatus() {
  const [status, setStatus] = useState<SalsifyStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.salsify) return;
        setStatus(data.salsify as SalsifyStatus);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return {
    status,
    /** Null until loaded — assume workable so the button isn't wrongly disabled. */
    ready: status?.ready ?? true,
    blockedReason: status?.blockedReason ?? null,
    hasApiKey: status?.hasApiKey ?? true,
  };
}
