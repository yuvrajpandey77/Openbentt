/**
 * Phase 8 — Sync schedule core (single source of truth, deterministic).
 * Plain JS shared by Electron scheduler and UI. No network, no secrets.
 */

export const SYNC_CONNECTOR_IDS = [
  "google-drive",
  "gmail",
  "google-calendar",
  "slack",
  "github",
  "notion",
];

export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 1440;

export const DEFAULT_INTERVALS = {
  "google-drive": 15,
  gmail: 15,
  "google-calendar": 15,
  slack: 10,
  github: 15,
  notion: 30,
};

export const SYNC_PAGE_SIZE = 25;

export function isSyncConnectorId(id) {
  return SYNC_CONNECTOR_IDS.includes(id);
}

export function validateIntervalMinutes(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const m = Math.floor(n);
  if (m < MIN_INTERVAL_MINUTES || m > MAX_INTERVAL_MINUTES) return null;
  return m;
}

export function defaultIntervalFor(connectorId) {
  return DEFAULT_INTERVALS[connectorId] ?? 15;
}

export function nextRunAt(lastRunAt, intervalMinutes, now = Date.now()) {
  const interval = validateIntervalMinutes(intervalMinutes) ?? 15;
  const base = lastRunAt ? Date.parse(lastRunAt) : NaN;
  const from = Number.isFinite(base) ? base : now;
  return new Date(from + interval * 60 * 1000).toISOString();
}

/**
 * Backoff for consecutive failures: interval × 2^failures, capped at 24 h.
 * Only transient failures should increment (auth failures surface as
 * needs-attention instead). Pure computation; caller decides the kind.
 */
export function backoffNextRunAt(intervalMinutes, consecutiveFailures, now = Date.now()) {
  const interval = validateIntervalMinutes(intervalMinutes) ?? 15;
  const failures = Math.max(0, Math.min(Number(consecutiveFailures) || 0, 8));
  const waitMinutes = Math.min(interval * 2 ** failures, 1440);
  return new Date(now + waitMinutes * 60 * 1000).toISOString();
}

export function isDue(nextRunIso, now = Date.now()) {
  if (!nextRunIso) return true;
  const t = Date.parse(nextRunIso);
  if (!Number.isFinite(t)) return true;
  return t <= now;
}

/** Transient (safe-to-retry) provider failure kinds. */
export function isTransientSyncError(err) {
  const m = err instanceof Error ? err.message : String(err ?? "");
  return /rate_limited|timeout|network_error|provider_unavailable|provider_error|http-5/i.test(m);
}
