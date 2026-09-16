/**
 * Phase 4 — Web connector fallback (bounded localStorage, offline-first).
 * Clearly separated from Electron durable state; makes no sync claims.
 * Bounded: 5k items, 200 sync runs, 10k links.
 */
import { logger } from "@/lib/log";
import type { SyncState } from "@/lib/connectors/connectorTypes";

const KEY = "openbentt-connectors-fallback-v1";
const MAX_ITEMS = 5000;
const MAX_RUNS = 200;
const MAX_LINKS = 10000;

interface ConnectorSourceRow {
  id: string;
  connectorId: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ConnectorItemRow {
  connectorId: string;
  externalId: string;
  itemHash: string;
  status: string;
  lastSeenAt: string;
  retrievedAt: string;
}

interface SyncRunRow {
  id: string;
  connectorId: string;
  scope?: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  countsJson: string;
  error?: string;
}

interface ItemLinkRow {
  connectorId: string;
  externalId: string;
  entityId: string;
  createdAt: string;
}

interface Snapshot {
  sources: Record<string, ConnectorSourceRow>;
  items: Record<string, ConnectorItemRow>;
  runs: SyncRunRow[];
  links: Record<string, ItemLinkRow>;
  sync: Record<string, SyncState>;
}

function blank(): Snapshot {
  return { sources: {}, items: {}, runs: [], links: {}, sync: {} };
}

function load(): Snapshot {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed || typeof parsed !== "object") return blank();
    return {
      sources: parsed.sources ?? {}, items: parsed.items ?? {},
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      links: parsed.links ?? {}, sync: parsed.sync ?? {},
    };
  } catch {
    return blank();
  }
}

function save(s: Snapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    logger.warn("connectors", "web fallback persist failed (quota?)");
  }
}

const itemKey = (c: string, e: string): string => `${c}:${e}`;

export const connectorWebStore = {
  upsertSource(connectorId: string, displayName: string): ConnectorSourceRow {
    const s = load();
    const now = new Date().toISOString();
    const prev = s.sources[connectorId];
    const row: ConnectorSourceRow = {
      id: prev?.id ?? `csrc_${connectorId}`,
      connectorId,
      displayName: displayName.slice(0, 200),
      enabled: prev?.enabled ?? true,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    s.sources[connectorId] = row;
    save(s);
    return row;
  },
  listSources(): ConnectorSourceRow[] {
    return Object.values(load().sources);
  },
  getHash(connectorId: string, externalId: string): string | undefined {
    return load().items[itemKey(connectorId, externalId)]?.itemHash;
  },
  setHash(connectorId: string, externalId: string, hash: string): void {
    const s = load();
    if (Object.keys(s.items).length >= MAX_ITEMS && !s.items[itemKey(connectorId, externalId)]) return;
    const now = new Date().toISOString();
    s.items[itemKey(connectorId, externalId)] = {
      connectorId, externalId, itemHash: hash, status: "seen", lastSeenAt: now, retrievedAt: now,
    };
    save(s);
  },
  link(connectorId: string, externalId: string, entityId: string): void {
    const s = load();
    if (Object.keys(s.links).length >= MAX_LINKS) return;
    s.links[itemKey(connectorId, externalId)] = { connectorId, externalId, entityId, createdAt: new Date().toISOString() };
    save(s);
  },
  entityIdFor(connectorId: string, externalId: string): string | undefined {
    return load().links[itemKey(connectorId, externalId)]?.entityId;
  },
  recordRun(run: SyncRunRow): void {
    const s = load();
    s.runs.unshift(run);
    s.runs = s.runs.slice(0, MAX_RUNS);
    save(s);
  },
  listRuns(connectorId?: string): SyncRunRow[] {
    const runs = load().runs;
    return connectorId ? runs.filter((r) => r.connectorId === connectorId) : runs;
  },
  getSync(connectorId: string, scope?: string): SyncState | undefined {
    return load().sync[`${connectorId}:${scope ?? "default"}`];
  },
  setSync(state: SyncState): void {
    const s = load();
    s.sync[`${state.connectorId}:${state.scope ?? "default"}`] = state;
    save(s);
  },
  reset(connectorId?: string): void {
    const s = load();
    if (!connectorId) {
      save(blank());
      return;
    }
    for (const k of Object.keys(s.items)) if (k.startsWith(`${connectorId}:`)) delete s.items[k];
    for (const k of Object.keys(s.links)) if (k.startsWith(`${connectorId}:`)) delete s.links[k];
    for (const k of Object.keys(s.sync)) if (k.startsWith(`${connectorId}:`)) delete s.sync[k];
    s.runs = s.runs.filter((r) => r.connectorId !== connectorId);
    delete s.sources[connectorId];
    save(s);
  },
};

export type { SyncRunRow };
