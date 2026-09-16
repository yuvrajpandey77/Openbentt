/**
 * Phase 4 — Sync state machine (explicit transitions, no polling daemon).
 * States: never_synced → syncing → synced | partial | failed.
 * Missing external records mark items stale; nothing is ever auto-deleted.
 */
import type { SyncState, SyncStatus } from "@/lib/connectors/connectorTypes";

export function initialSyncState(connectorId: string, scope?: string): SyncState {
  return {
    connectorId, scope, status: "never_synced",
    itemsSeen: 0, itemsCreated: 0, itemsUpdated: 0, itemsFailed: 0,
  };
}

const TRANSITIONS: Record<SyncStatus, SyncStatus[]> = {
  never_synced: ["syncing"],
  syncing: ["synced", "partial", "failed"],
  synced: ["syncing"],
  partial: ["syncing"],
  failed: ["syncing"],
};

export function canTransition(from: SyncStatus, to: SyncStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionSync(state: SyncState, to: SyncStatus, patch?: Partial<SyncState>): SyncState {
  if (!canTransition(state.status, to)) {
    throw new Error(`Invalid sync transition ${state.status} -> ${to}`);
  }
  const now = new Date().toISOString();
  const next: SyncState = {
    ...state, ...patch, status: to,
    lastAttemptAt: to === "syncing" ? now : state.lastAttemptAt ?? now,
    lastSuccessAt: to === "synced" || to === "partial" ? now : state.lastSuccessAt,
  };
  return next;
}

/** Derive terminal status from item counts (no silent loss). */
export function terminalStatusForCounts(seen: number, failed: number): SyncStatus {
  if (seen === 0 && failed === 0) return "synced";
  if (failed === 0) return "synced";
  if (failed < seen) return "partial";
  return "failed";
}

export type ConnectorItemStatus = "seen" | "stale" | "not_seen";

/** Mark items not observed in the latest sync as stale (never delete). */
export function markStaleItems<T extends { externalId: string }>(
  previous: Map<string, T>, seenIds: Set<string>
): { id: string; status: ConnectorItemStatus }[] {
  const out: { id: string; status: ConnectorItemStatus }[] = [];
  for (const id of previous.keys()) {
    out.push({ id, status: seenIds.has(id) ? "seen" : "not_seen" });
  }
  return out;
}
