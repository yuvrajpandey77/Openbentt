import React, { useEffect, useState } from "react";
import { isDesktopApp } from "@/lib/isDesktopApp";

type PersistenceState = "clean" | "pending" | "saving" | "failed";

interface PersistenceStatus {
  state: PersistenceState;
  lastError: string | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  retryCount: number;
  hasUnsavedChanges: boolean;
}

type ResearchPersistenceBridge = {
  persistenceStatus?: () => Promise<PersistenceStatus>;
};

/**
 * Desktop-only, non-blocking banner for failed notebook writes.
 * The status channel is best-effort diagnostics: web mode and older desktop
 * builds (without the bridge method) render nothing.
 */
export function PersistenceStatusBanner() {
  const [status, setStatus] = useState<PersistenceStatus | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !isDesktopApp()) return;
    const bridge = window.openbenttResearch as unknown as ResearchPersistenceBridge | undefined;
    const readStatus = bridge?.persistenceStatus;
    if (typeof readStatus !== "function") return;

    let active = true;
    const poll = async () => {
      try {
        const next = await readStatus();
        if (active) setStatus(next && typeof next === "object" ? next : null);
      } catch {
        // Never let a diagnostics poll break the renderer.
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (!status || status.state !== "failed") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-2 z-[var(--z-toast,60)] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-sm backdrop-blur-sm"
    >
      <strong className="font-semibold">Notebook changes are not saved.</strong>{" "}
      {status.hasUnsavedChanges
        ? "Keep the app open while retries run; do not close it yet. "
        : ""}
      {status.lastError ? `Details: ${status.lastError.slice(0, 180)}` : null}
    </div>
  );
}

export default PersistenceStatusBanner;
