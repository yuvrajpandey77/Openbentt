/**
 * Phase 8 — Real background synchronization (main process only).
 *
 * Scheduler (60 s tick, sequential, one connector at a time) over the
 * sync_config table (user-controlled: enabled + interval). Each run executes
 * the REAL pipeline over the provider's list primitives:
 *
 *   Scheduler → token check → provider list → normalize → identity →
 *   dedupe (hash) → import → cursor → sync-run record → audit
 *
 * Import/identity semantics are Phase 4's (importConnectorItems — called,
 * never duplicated). Tokens attach main-side only. Only explicitly safe
 * transient failures retry (backoff); auth failures surface as
 * needs-attention and never retry hot.
 */
import { getDb } from "./researchDb.mjs";
import { createLogger } from "./log.mjs";
import {
  getConnectorCursor,
  importConnectorItems,
  recordConnectorSyncRun,
  setConnectorCursor,
} from "./connectorStore.mjs";
import {
  authorizedFetchWithRefreshFor,
  readOAuthTokenMaybe,
} from "./connectorAuthStore.mjs";
import { recordToolAuditEvent } from "./toolStore.mjs";
import {
  backoffNextRunAt,
  defaultIntervalFor,
  isDue,
  isSyncConnectorId,
  isTransientSyncError,
  nextRunAt,
  SYNC_PAGE_SIZE,
  validateIntervalMinutes,
} from "../src/lib/sync/syncSchedule.mjs";
import { driveListResources } from "../src/lib/connectors/providers/googleDrive.mjs";
import { gmailGetMessage, gmailSearch } from "../src/lib/connectors/providers/gmail.mjs";
import { calendarList, calendarSearchEvents } from "../src/lib/connectors/providers/googleCalendar.mjs";
import { slackListChannels, slackReadHistory } from "../src/lib/connectors/providers/slack.mjs";
import { githubListRepos, githubSearchIssues } from "../src/lib/connectors/providers/github.mjs";
import { notionListPages } from "../src/lib/connectors/providers/notion.mjs";

const log = createLogger("sync");
const TICK_MS = 60 * 1000;
const MAX_ITEMS_PER_RUN = SYNC_PAGE_SIZE;

function fail(message) {
  throw new Error(`Sync: ${message}`);
}

/* ---------------- config ---------------- */

export function getSyncConfig(app, connectorId) {
  if (!isSyncConnectorId(connectorId)) fail("unknown connector");
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM sync_config WHERE connector_id = ?").get(connectorId);
  if (!row) {
    return {
      connectorId,
      enabled: false,
      intervalMinutes: defaultIntervalFor(connectorId),
      lastRunAt: null,
      nextRunAt: null,
      consecutiveFailures: 0,
    };
  }
  return {
    connectorId: row.connector_id,
    enabled: row.enabled === 1,
    intervalMinutes: row.interval_minutes,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    consecutiveFailures: row.consecutive_failures,
  };
}

export function listSyncConfigs(app) {
  const db = getDb(app);
  const rows = db.prepare("SELECT * FROM sync_config ORDER BY connector_id ASC").all();
  const byId = new Map(rows.map((r) => [r.connector_id, r]));
  const { ENTERPRISE_CONNECTOR_IDS } = { ENTERPRISE_CONNECTOR_IDS: ["google-drive", "gmail", "google-calendar", "slack", "github", "notion"] };
  return ENTERPRISE_CONNECTOR_IDS.map((id) => getSyncConfig(app, id)).map((c) => {
    const r = byId.get(c.connectorId);
    return r ? {
      connectorId: r.connector_id,
      enabled: r.enabled === 1,
      intervalMinutes: r.interval_minutes,
      lastRunAt: r.last_run_at,
      nextRunAt: r.next_run_at,
      consecutiveFailures: r.consecutive_failures,
    } : c;
  });
}

export function setSyncConfig(app, connectorId, patch = {}) {
  if (!isSyncConnectorId(connectorId)) fail("unknown connector");
  const current = getSyncConfig(app, connectorId);
  const enabled = patch.enabled === undefined ? current.enabled : patch.enabled === true;
  const interval = patch.intervalMinutes === undefined
    ? current.intervalMinutes
    : validateIntervalMinutes(patch.intervalMinutes);
  if (interval === null) fail("interval must be 5–1440 minutes");
  const now = new Date().toISOString();
  const db = getDb(app);
  // Enabling (re)schedules from now; disabling clears the next run.
  const next = enabled ? nextRunAt(current.lastRunAt, interval) : null;
  db.prepare(
    `INSERT INTO sync_config (connector_id, enabled, interval_minutes, last_run_at,
      next_run_at, consecutive_failures, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(connector_id) DO UPDATE SET
       enabled = excluded.enabled, interval_minutes = excluded.interval_minutes,
       next_run_at = excluded.next_run_at, updated_at = excluded.updated_at`
  ).run(connectorId, enabled ? 1 : 0, interval, current.lastRunAt, next, current.consecutiveFailures, now);
  return getSyncConfig(app, connectorId);
}

function touchSyncConfig(app, connectorId, { lastRunAt, nextRun, failures }) {
  const db = getDb(app);
  const now = new Date().toISOString();
  const current = getSyncConfig(app, connectorId);
  db.prepare(
    `INSERT INTO sync_config (connector_id, enabled, interval_minutes, last_run_at,
      next_run_at, consecutive_failures, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(connector_id) DO UPDATE SET
       last_run_at = excluded.last_run_at, next_run_at = excluded.next_run_at,
       consecutive_failures = excluded.consecutive_failures, updated_at = excluded.updated_at`
  ).run(
    connectorId, current.enabled ? 1 : 0, current.intervalMinutes,
    lastRunAt ?? current.lastRunAt, nextRun ?? current.nextRunAt,
    failures ?? current.consecutiveFailures, now
  );
}

/* ---------------- provider fetch → ExternalItem ---------------- */

const HOSTS = {
  "google-drive": ["googleapis.com", "www.googleapis.com"],
  gmail: ["googleapis.com", "gmail.googleapis.com"],
  "google-calendar": ["googleapis.com", "www.googleapis.com"],
  slack: ["slack.com"],
  github: ["api.github.com"],
  notion: ["api.notion.com"],
};

function item(base) {
  return {
    authors: [],
    identifiers: [],
    retrievedAt: new Date().toISOString(),
    ...base,
  };
}

/**
 * Fetch one bounded page per connector and map to ExternalItems.
 * Returns { items, nextCursor }. Throws provider errors (caller classifies).
 */
async function fetchConnectorPage(app, connectorId, cursor) {
  const authFetch = authorizedFetchWithRefreshFor(app, connectorId, HOSTS[connectorId]);
  switch (connectorId) {
    case "google-drive": {
      const page = await driveListResources(authFetch, {
        pageSize: MAX_ITEMS_PER_RUN,
        pageToken: cursor || undefined,
        orderBy: "modifiedTime desc",
      });
      return {
        items: page.items.map((f) => item({
          connectorId, externalId: f.id, title: f.title,
          authors: f.owner ? [f.owner] : [],
          externalUrl: f.url, retrievedAt: f.updatedAt,
          sourceVersion: "drive-v3",
        })),
        nextCursor: page.nextCursor,
      };
    }
    case "gmail": {
      const page = await gmailSearch(authFetch, "", { pageSize: MAX_ITEMS_PER_RUN, pageToken: cursor || undefined });
      const out = [];
      for (const m of page.items.slice(0, MAX_ITEMS_PER_RUN)) {
        try {
          const full = await gmailGetMessage(authFetch, m.id);
          out.push(item({
            connectorId, externalId: full.id, title: full.title,
            authors: full.from ? [full.from] : [],
            identifiers: full.threadId ? [{ namespace: "gmail_thread", value: full.threadId }] : [],
            retrievedAt: full.date,
            sourceVersion: "gmail-v1",
          }));
        } catch {
          /* per-message isolation */
        }
      }
      return { items: out, nextCursor: page.nextCursor };
    }
    case "google-calendar": {
      const cals = await calendarList(authFetch).catch(() => []);
      const since = cursor || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const out = [];
      for (const cal of cals.slice(0, 3)) {
        try {
          const page = await calendarSearchEvents(authFetch, {
            calendarId: cal.id, timeMin: since, pageSize: 8,
          });
          for (const e of page.items) {
            out.push(item({
              connectorId, externalId: `${cal.id}:${e.id}`, title: e.title,
              externalUrl: e.htmlLink, retrievedAt: e.start,
              sourceVersion: "calendar-v3",
            }));
          }
        } catch {
          /* per-calendar isolation */
        }
        if (out.length >= MAX_ITEMS_PER_RUN) break;
      }
      return { items: out.slice(0, MAX_ITEMS_PER_RUN), nextCursor: new Date().toISOString() };
    }
    case "slack": {
      const channels = await slackListChannels(authFetch, { limit: 20 });
      const sinceTs = cursor ? String(Math.floor(Date.parse(cursor) / 1000)) : undefined;
      const out = [];
      let newest = cursor ? Date.parse(cursor) : 0;
      for (const ch of channels.items.slice(0, 3)) {
        try {
          const hist = await slackReadHistory(authFetch, {
            channelId: ch.id, limit: 8, ...(sinceTs ? { oldest: sinceTs } : {}),
          });
          for (const m of hist.items) {
            const ms = Math.floor(Number(m.ts) * 1000);
            if (Number.isFinite(ms)) newest = Math.max(newest, ms);
            out.push(item({
              connectorId, externalId: m.id, title: m.title,
              retrievedAt: Number.isFinite(ms) ? new Date(ms).toISOString() : undefined,
              sourceVersion: "slack-web",
            }));
          }
        } catch {
          /* per-channel isolation */
        }
        if (out.length >= MAX_ITEMS_PER_RUN) break;
      }
      return {
        items: out.slice(0, MAX_ITEMS_PER_RUN),
        nextCursor: newest ? new Date(newest).toISOString() : new Date().toISOString(),
      };
    }
    case "github": {
      const sinceDate = cursor || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const page = await githubSearchIssues(authFetch, `updated:>=${String(sinceDate).slice(0, 10)}`, { perPage: MAX_ITEMS_PER_RUN });
      const repos = page.items.length ? [] : (await githubListRepos(authFetch, { perPage: 10 }).catch(() => ({ items: [] }))).items;
      const items = [
        ...page.items.map((i) => item({
          connectorId, externalId: i.id, title: i.title,
          authors: i.author ? [i.author] : [],
          identifiers: i.repo ? [{ namespace: "github_repo", value: i.repo }] : [],
          externalUrl: i.url, retrievedAt: i.updatedAt,
          sourceVersion: "github-rest",
        })),
        ...repos.slice(0, 10).map((r) => item({
          connectorId, externalId: r.id, title: r.title,
          externalUrl: r.url, retrievedAt: r.updatedAt,
          identifiers: r.repo ? [{ namespace: "github_repo", value: r.repo }] : [],
          sourceVersion: "github-rest",
        })),
      ];
      return { items: items.slice(0, MAX_ITEMS_PER_RUN), nextCursor: new Date().toISOString().slice(0, 10) };
    }
    case "notion": {
      const page = await notionListPages(authFetch, { pageSize: MAX_ITEMS_PER_RUN, cursor: cursor || undefined });
      return {
        items: page.items.map((p) => item({
          connectorId, externalId: p.id, title: p.title,
          externalUrl: p.url, sourceVersion: "notion-v1",
        })),
        nextCursor: page.nextCursor,
      };
    }
    default:
      throw new Error(`unknown sync connector: ${connectorId}`);
  }
}

/* ---------------- single run ---------------- */

const inFlight = new Set();

export function isSyncRunning(connectorId) {
  return inFlight.has(connectorId);
}

function auditSync(app, { connectorId, requestId, ok, counts, error }) {
  try {
    recordToolAuditEvent(app, {
      eventId: `sync_${Date.now().toString(36)}_${connectorId}`,
      toolId: "connector.sync",
      toolVersion: "1",
      requestId: requestId ?? `sync_${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      source: "sync-scheduler",
      permission: "SYSTEM_INTERNAL",
      risk: "LOW",
      decision: "ALLOW",
      status: ok ? "ok" : "failed",
      durationMs: 0,
      resourceSummary: {
        connectorId,
        counts: counts ?? {},
        ...(error ? { error: String(error).slice(0, 200) } : {}),
      },
      ...(error ? { errorCategory: "execution_failed" } : {}),
    });
  } catch {
    /* audit must never break sync */
  }
}

/**
 * Run one real background sync for a connector. Returns a summary.
 * Never throws for provider failures (records failed run + backoff);
 * throws only for programmer errors (unknown connector).
 */
export async function runConnectorSyncNow(app, connectorId, opts = {}) {
  if (!isSyncConnectorId(connectorId)) fail("unknown connector");
  if (inFlight.has(connectorId)) return { connectorId, status: "already_running" };
  inFlight.add(connectorId);
  const started = Date.now();
  const notify = opts.notify;
  const emit = (phase, detail) => {
    try {
      notify?.({ connectorId, phase, ...detail });
    } catch {
      /* notify must never break sync */
    }
  };
  emit("started", {});
  try {
    const token = await readOAuthTokenMaybe(app, connectorId).catch(() => null);
    if (!token?.accessToken) {
      throw new Error("authentication_failed: connector is not connected");
    }
    const cursorRow = getConnectorCursor(app, connectorId, "background");
    const { items, nextCursor } = await fetchConnectorPage(app, connectorId, cursorRow?.cursor);
    let imported = { created: [], updated: [], unchanged: [], skipped: [], conflicts: [], failed: [] };
    if (items.length) {
      imported = importConnectorItems(app, items, {});
    }
    // Conservative cross-source linking (same namespace+value only, evidenced).
    try {
      const { linkSharedIdentifiers } = await import("./identityLinker.mjs");
      linkSharedIdentifiers(app, [...imported.created, ...imported.updated]);
    } catch {
      /* linking is best-effort; sync already succeeded */
    }
    const counts = {
      discovered: items.length,
      imported: imported.created.length + imported.updated.length,
      updated: imported.updated.length,
      skipped: imported.unchanged.length + imported.skipped.length,
      failed: imported.failed.length,
    };
    const status = counts.failed === 0 ? "synced" : counts.failed < Math.max(1, counts.discovered) ? "partial" : "failed";
    recordConnectorSyncRun(app, {
      connectorId, scope: "background", status, counts, providerVersion: "phase8-sync-v1",
    });
    setConnectorCursor(app, connectorId, "background", nextCursor ?? cursorRow?.cursor ?? null, counts.discovered);
    const now = new Date().toISOString();
    const cfg = getSyncConfig(app, connectorId);
    touchSyncConfig(app, connectorId, {
      lastRunAt: now,
      nextRun: nextRunAt(now, cfg.intervalMinutes),
      failures: 0,
    });
    auditSync(app, { connectorId, ok: status !== "failed", counts });
    emit("finished", { status, counts, durationMs: Date.now() - started });
    try {
      const { dispatchSyncCompleted } = await import("./workflowStore.mjs");
      await dispatchSyncCompleted(app, connectorId, { status, counts }).catch(() => {});
    } catch {
      /* workflows optional */
    }
    return { connectorId, status, counts, durationMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync failed";
    const transient = isTransientSyncError(err);
    const auth = /authentication_failed|needs_reauth|not connected/i.test(message);
    recordConnectorSyncRun(app, {
      connectorId, scope: "background", status: "failed",
      counts: { discovered: 0, imported: 0, updated: 0, skipped: 0, failed: 0 },
      error: auth ? "Connector needs attention (authentication)." : message.slice(0, 300),
      providerVersion: "phase8-sync-v1",
    });
    const now = new Date().toISOString();
    const cfg = getSyncConfig(app, connectorId);
    const failures = cfg.consecutiveFailures + 1;
    touchSyncConfig(app, connectorId, {
      lastRunAt: now,
      nextRun: transient
        ? backoffNextRunAt(cfg.intervalMinutes, failures)
        : nextRunAt(now, cfg.intervalMinutes),
      failures,
    });
    auditSync(app, { connectorId, ok: false, counts: {}, error: message });
    emit("failed", { error: message.slice(0, 200), transient, durationMs: Date.now() - started });
    log.warn("background sync failed", { connectorId, error: message.slice(0, 160), transient });
    return { connectorId, status: "failed", error: message.slice(0, 300), transient };
  } finally {
    inFlight.delete(connectorId);
  }
}

/* ---------------- scheduler ---------------- */

let timer = null;
let schedApp = null;
let schedNotify = null;

export function startSyncScheduler(app, { notify } = {}) {
  stopSyncScheduler();
  schedApp = app;
  schedNotify = notify ?? null;
  timer = setInterval(() => {
    void tickSyncScheduler().catch((err) => {
      log.warn("sync tick failed", { error: err instanceof Error ? err.message : "unknown" });
    });
  }, TICK_MS);
  if (timer.unref) timer.unref();
  return { ok: true };
}

export function stopSyncScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  schedApp = null;
  schedNotify = null;
}

export async function tickSyncScheduler(now = Date.now()) {
  if (!schedApp) return { ran: [] };
  const ran = [];
  for (const cfg of listSyncConfigs(schedApp)) {
    if (!cfg.enabled) continue;
    if (!isDue(cfg.nextRunAt, now)) continue;
    if (inFlight.has(cfg.connectorId)) continue;
    // Sequential: await each due connector (bounded pages keep this short).
    const res = await runConnectorSyncNow(schedApp, cfg.connectorId, { notify: schedNotify, reason: "schedule" });
    ran.push(res);
  }
  return { ran };
}
