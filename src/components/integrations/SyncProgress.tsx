/**
 * Phase 7 — Sync progress display.
 * Stages mirror the unified lifecycle DISCOVER → … → AUDIT; counts come
 * from the real sync operation (never invented). No secrets in logs.
 */
import { useEffect, useState } from "react";
import { toolApi } from "@/lib/tools/toolApi";

const STAGES = ["DISCOVER", "FETCH", "NORMALIZE", "IDENTITY", "DEDUPLICATE", "IMPORT", "INDEX", "ONTOLOGY", "AUDIT"] as const;

interface Props {
  connectorId: string;
  lastRun?: { status?: string; counts?: Record<string, number>; startedAt?: string; completedAt?: string; error?: string } | null;
  syncing: boolean;
  onSyncNow: () => void;
}

export function SyncProgress({ connectorId, lastRun, syncing, onSyncNow }: Props) {
  const [auditCount, setAuditCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    toolApi
      .audit({ toolId: "connector.unified_search", limit: 1 })
      .then((rows) => {
        if (!cancelled) setAuditCount(rows.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connectorId]);

  const counts = lastRun?.counts ?? {};
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Sync</h4>
        <button
          type="button"
          disabled={syncing}
          onClick={onSyncNow}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {syncing ? (
        <ol className="mt-2 space-y-1" aria-live="polite">
          {STAGES.map((s) => (
            <li key={s} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
              {s.charAt(0) + s.slice(1).toLowerCase()}…
            </li>
          ))}
        </ol>
      ) : lastRun ? (
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
          {["seen", "imported", "updated", "failed"].map((k) => (
            <div key={k} className="rounded-lg bg-muted/50 px-2 py-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-sm font-semibold">{counts[k] ?? counts[{ seen: "seen", imported: "created", updated: "updated", failed: "failed" }[k] as string] ?? 0}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Never synced.</p>
      )}
      {lastRun?.error && <p className="mt-2 text-xs text-destructive">{lastRun.error}</p>}
      {auditCount !== null && (
        <p className="mt-2 text-[11px] text-muted-foreground">Audited operations on record: {auditCount}+</p>
      )}
    </div>
  );
}
