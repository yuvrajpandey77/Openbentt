/**
 * Phase 8 — Renderer sync API (user-controlled background sync).
 * Desktop IPC; web fallback reports sync unavailable honestly.
 */

export interface SyncConfigView {
  connectorId: string;
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  consecutiveFailures: number;
}

function bridge(): { sync: (op: string, payload?: unknown) => Promise<unknown> } | undefined {
  try {
    const w = window as unknown as {
      openbenttResearch?: { sync?: (op: string, payload?: unknown) => Promise<unknown> };
    };
    return w.openbenttResearch?.sync ? { sync: w.openbenttResearch.sync } : undefined;
  } catch {
    return undefined;
  }
}

export function hasSyncDesktopApi(): boolean {
  return Boolean(bridge());
}

export const syncApi = {
  configs(): Promise<SyncConfigView[]> {
    const b = bridge();
    if (!b) return Promise.resolve([]);
    return b.sync("configs") as Promise<SyncConfigView[]>;
  },
  get(connectorId: string): Promise<SyncConfigView | null> {
    const b = bridge();
    if (!b) return Promise.resolve(null);
    return b.sync("get", { connectorId }) as Promise<SyncConfigView | null>;
  },
  set(connectorId: string, patch: { enabled?: boolean; intervalMinutes?: number }): Promise<SyncConfigView> {
    const b = bridge();
    if (!b) return Promise.reject(new Error("Background sync requires the desktop app."));
    return b.sync("set", { connectorId, ...patch }) as Promise<SyncConfigView>;
  },
  runNow(connectorId: string): Promise<Record<string, unknown>> {
    const b = bridge();
    if (!b) return Promise.reject(new Error("Background sync requires the desktop app."));
    return b.sync("runNow", { connectorId }) as Promise<Record<string, unknown>>;
  },
};
