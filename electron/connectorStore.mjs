/**
 * Phase 4 — Durable connector state (SQLite v9 tables) + import execution.
 * Same database ownership as researchDb (getDb singleton, DatabaseSync —
 * serialized in the main process; no competing writers). Parameterized SQL
 * only; safe generic errors (never SQL text/paths/secrets to callers).
 *
 * Import execution maps normalized ExternalItems into the Phase 3 knowledge
 * store (knowledgeStore.mjs — called, never modified): DOI-anchored identity
 * via knowledgeCore.mjs, user-authored precedence, additive merges, evidence
 * with connector SourceRefs, idempotent hashes, per-item failure isolation.
 */
import { getDb } from "./researchDb.mjs";
import { createLogger } from "./log.mjs";
import {
  addEvidence,
  getEntity,
  getEvidenceFor,
  getRelationship,
  upsertEntity,
  upsertRelationship,
} from "./knowledgeStore.mjs";
import {
  connectorChunkId,
  connectorDocumentId,
  fnv1aHex,
  isValidDoiFormat,
  itemHashFor,
  normalizeDoi,
  resolveConnectorIdentity,
  sanitizeText,
  stableStringify,
  validateExternalUrl,
} from "../src/lib/connectors/connectorCore.mjs";
import {
  entityIdFor,
  normalizeName,
  normalizePersonName,
  paperIdForDoi,
} from "../src/lib/knowledge/knowledgeCore.mjs";

const KNOWN_CONNECTORS = new Set(["crossref", "zotero"]);
const ORIGIN_FOR = { crossref: "crossref", zotero: "zotero" };
const MAX_ITEMS_PER_IMPORT = 200;
const log = createLogger("connectors");

function fail(message) {
  throw new Error(`Connectors: ${message}`);
}

function checkConnector(id) {
  if (typeof id !== "string" || !KNOWN_CONNECTORS.has(id)) fail("unknown connector");
  return id;
}

function checkExternalId(v) {
  if (typeof v !== "string" || !v.trim() || v.length > 512) fail("invalid external id");
  return v;
}

function safeError(err) {
  const m = err instanceof Error ? err.message : String(err ?? "failed");
  if (/429|rate/i.test(m)) return "Rate limited by provider.";
  if (/401|403|auth/i.test(m)) return "Connector authentication failed.";
  if (/url-blocked|ssrf/i.test(m)) return "Blocked unsafe URL.";
  if (/timeout|abort/i.test(m)) return "Connector request timed out.";
  return m.replace(/sk-[A-Za-z0-9-_]+|Bearer\s+[^\s]+|api[_-]?key[=:][^\s&;]*/gi, "[redacted]").slice(0, 300);
}

/* ---------------- sources ---------------- */

export function upsertConnectorSource(app, connectorId, displayName) {
  const db = getDb(app);
  checkConnector(connectorId);
  const now = new Date().toISOString();
  const id = `csrc_${connectorId}`;
  const name = sanitizeText(displayName ?? connectorId, 200);
  const prev = db.prepare("SELECT * FROM connector_sources WHERE id = ?").get(id);
  db.prepare(
    `INSERT INTO connector_sources (id, connector_id, display_name, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, updated_at=excluded.updated_at`
  ).run(id, connectorId, name, prev ? prev.enabled : 1, prev ? prev.created_at : now, now);
  return db.prepare("SELECT * FROM connector_sources WHERE id = ?").get(id);
}

export function listConnectorSources(app) {
  const db = getDb(app);
  return db.prepare("SELECT * FROM connector_sources ORDER BY connector_id ASC").all();
}

/* ---------------- item hashes / links ---------------- */

export function getConnectorItemHash(app, connectorId, externalId) {
  const db = getDb(app);
  const row = db.prepare("SELECT item_hash FROM connector_items WHERE connector_id = ? AND external_id = ?")
    .get(checkConnector(connectorId), checkExternalId(externalId));
  return row ? row.item_hash : undefined;
}

export function setConnectorItemHash(app, connectorId, externalId, hash, status = "seen") {
  const db = getDb(app);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO connector_items (connector_id, external_id, item_hash, status, last_seen_at, retrieved_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(connector_id, external_id) DO UPDATE SET item_hash=excluded.item_hash,
       status=excluded.status, last_seen_at=excluded.last_seen_at`
  ).run(checkConnector(connectorId), checkExternalId(externalId), String(hash).slice(0, 64), status, now, now);
}

export function linkConnectorItem(app, connectorId, externalId, entityId) {
  const db = getDb(app);
  db.prepare(
    `INSERT INTO connector_item_links (connector_id, external_id, entity_id, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(connector_id, external_id) DO UPDATE SET entity_id=excluded.entity_id`
  ).run(checkConnector(connectorId), checkExternalId(externalId), entityId, new Date().toISOString());
}

export function entityIdForConnectorItem(app, connectorId, externalId) {
  const db = getDb(app);
  const row = db.prepare("SELECT entity_id FROM connector_item_links WHERE connector_id = ? AND external_id = ?")
    .get(checkConnector(connectorId), checkExternalId(externalId));
  return row ? row.entity_id : undefined;
}

/* ---------------- sync runs / state ---------------- */

export function recordConnectorSyncRun(app, { connectorId, scope, status, counts, error, providerVersion }) {
  const db = getDb(app);
  checkConnector(connectorId);
  const now = new Date().toISOString();
  const id = `csync_${Date.now().toString(36)}_${fnv1aHex(`${connectorId}:${scope ?? "default"}:${now}`)}`;
  db.prepare(
    `INSERT INTO connector_sync_runs (id, connector_id, scope, started_at, completed_at, status, counts_json, error, provider_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, connectorId, String(scope ?? "default").slice(0, 128), now, now,
    ["syncing", "synced", "partial", "failed"].includes(status) ? status : "failed",
    JSON.stringify(counts ?? {}).slice(0, 4000),
    error ? safeError(error).slice(0, 500) : null,
    providerVersion ? String(providerVersion).slice(0, 64) : null);
  // Keep runs bounded (latest 200 per connector).
  const stale = db.prepare(
    "SELECT id FROM connector_sync_runs WHERE connector_id = ? ORDER BY started_at DESC LIMIT -1 OFFSET 200"
  ).all(connectorId);
  if (stale.length) {
    db.prepare(`DELETE FROM connector_sync_runs WHERE id IN (${stale.map(() => "?").join(",")})`).run(...stale.map((r) => r.id));
  }
  return id;
}

export function listConnectorSyncRuns(app, connectorId, limit = 20) {
  const db = getDb(app);
  if (connectorId !== undefined) checkConnector(connectorId);
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  return connectorId
    ? db.prepare("SELECT * FROM connector_sync_runs WHERE connector_id = ? ORDER BY started_at DESC LIMIT ?").all(connectorId, lim)
    : db.prepare("SELECT * FROM connector_sync_runs ORDER BY started_at DESC LIMIT ?").all(lim);
}

export function getConnectorSyncStatus(app, connectorId, scope = "default") {
  const db = getDb(app);
  checkConnector(connectorId);
  const row = db.prepare(
    "SELECT * FROM connector_sync_runs WHERE connector_id = ? AND scope = ? ORDER BY started_at DESC LIMIT 1"
  ).get(connectorId, String(scope).slice(0, 128));
  if (!row) {
    return { connectorId, scope, status: "never_synced", itemsSeen: 0, itemsCreated: 0, itemsUpdated: 0, itemsFailed: 0 };
  }
  let counts = {};
  try { counts = JSON.parse(row.counts_json ?? "{}"); } catch { counts = {}; }
  return {
    connectorId, scope, status: row.status,
    lastAttemptAt: row.started_at, lastSuccessAt: row.status === "synced" || row.status === "partial" ? row.completed_at : undefined,
    itemsSeen: counts.seen ?? 0, itemsCreated: counts.created ?? 0,
    itemsUpdated: counts.updated ?? 0, itemsFailed: counts.failed ?? 0,
    lastError: row.error ?? undefined, providerVersion: row.provider_version ?? undefined,
  };
}

export function resetConnector(app, connectorId) {
  const db = getDb(app);
  if (connectorId !== undefined) {
    checkConnector(connectorId);
    db.prepare("DELETE FROM connector_items WHERE connector_id = ?").run(connectorId);
    db.prepare("DELETE FROM connector_item_links WHERE connector_id = ?").run(connectorId);
    db.prepare("DELETE FROM connector_sync_runs WHERE connector_id = ?").run(connectorId);
    db.prepare("DELETE FROM connector_sources WHERE connector_id = ?").run(connectorId);
  } else {
    db.prepare("DELETE FROM connector_items").run();
    db.prepare("DELETE FROM connector_item_links").run();
    db.prepare("DELETE FROM connector_sync_runs").run();
    db.prepare("DELETE FROM connector_sources").run();
  }
  return { ok: true };
}

/* ---------------- import execution ---------------- */

function validateItemShape(item) {
  if (!item || typeof item !== "object") fail("invalid item");
  checkConnector(item.connectorId);
  checkExternalId(item.externalId);
  if (item.title !== undefined && (typeof item.title !== "string" || item.title.length > 1000)) fail("invalid title");
  if (item.authors !== undefined && (!Array.isArray(item.authors) || item.authors.length > 64)) fail("invalid authors");
  if (item.externalUrl !== undefined) {
    try { validateExternalUrl(item.externalUrl); } catch { fail("blocked external url"); }
  }
  const hasTitle = typeof item.title === "string" && item.title.trim();
  const hasDoi = Array.isArray(item.identifiers) && item.identifiers.some((i) => i && i.namespace === "doi");
  if (!hasTitle && !hasDoi) fail("item has no usable identity");
}

function doiOf(item) {
  const d = (item.identifiers ?? []).find((i) => i && i.namespace === "doi")?.value;
  if (typeof d === "string" && isValidDoiFormat(d)) return normalizeDoi(d);
  return undefined;
}

function personIdFor(raw) {
  const canonical = String(raw ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 300);
  const normalized = normalizePersonName(raw);
  if (!normalized) return null;
  return { canonical, normalized, id: entityIdFor("person", normalized) };
}

function sourceRefFor(connectorId, externalId, externalUrl, title, retrievedAt, sourceVersion) {
  return {
    documentId: connectorDocumentId(connectorId),
    chunkId: connectorChunkId(connectorId, externalId),
    sourceType: "url",
    sourceUri: typeof externalUrl === "string" ? externalUrl.slice(0, 500) : undefined,
    title: typeof title === "string" ? title.slice(0, 500) : undefined,
    connector: {
      connectorId, externalId,
      url: typeof externalUrl === "string" ? externalUrl : undefined,
      retrievedAt, providerVersion: sourceVersion,
    },
  };
}

/** Build deterministic entity/relationship/evidence rows for one item. */
function buildRows(item, projectId) {
  const connectorId = item.connectorId;
  const origin = ORIGIN_FOR[connectorId] ?? "import";
  const provenance = origin === "import" ? "imported" : "automatic";
  const doi = doiOf(item);
  const title = typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 300) : item.externalId;
  const paperId = doi ? paperIdForDoi(doi) : entityIdFor("paper", normalizeName(title));
  const retrievedAt = typeof item.retrievedAt === "string" ? item.retrievedAt : new Date().toISOString();
  const ref = sourceRefFor(connectorId, item.externalId, item.externalUrl, title, retrievedAt, item.sourceVersion);
  const now = new Date().toISOString();

  const ids = new Map();
  ids.set(`${connectorId}:${item.externalId}`.toLowerCase(), { namespace: connectorId, value: item.externalId });
  for (const e of item.identifiers ?? []) {
    if (!e || typeof e.namespace !== "string" || typeof e.value !== "string") continue;
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(e.namespace) || !e.value.trim()) continue;
    ids.set(`${e.namespace}:${e.value}`.toLowerCase(), { namespace: e.namespace, value: e.value.slice(0, 500) });
  }
  const props = {
    [`connector:${connectorId}:externalId`]: item.externalId.slice(0, 256),
    [`connector:${connectorId}:retrievedAt`]: retrievedAt.slice(0, 64),
  };
  if (item.externalUrl) props[`connector:${connectorId}:url`] = item.externalUrl.slice(0, 500);
  if (item.sourceVersion) props[`connector:${connectorId}:version`] = String(item.sourceVersion).slice(0, 64);
  if (item.publicationDate) props.year = String(item.publicationDate).slice(0, 16);
  if (item.venue) props.journal = String(item.venue).slice(0, 300);
  const tags = [];
  const seenTags = new Set();
  for (const t of [...(item.collections ?? []), ...(item.tags ?? [])]) {
    if (typeof t !== "string" || !t.trim()) continue;
    const k = t.normalize("NFKC").toLowerCase();
    if (seenTags.has(k)) continue;
    seenTags.add(k);
    tags.push(t.slice(0, 64));
    if (tags.length >= 32) break;
  }

  const entities = [{
    id: paperId, type: "paper", canonicalName: title,
    normalizedName: doi ? `doi:${doi}` : normalizeName(title),
    status: "active", properties: props, aliases: [],
    externalIds: [...ids.values()].slice(0, 32), tags,
    origin, provenance, projectId, createdAt: now, updatedAt: now,
  }];
  const relationships = [];
  const evidence = [{
    id: `ent_conn_${fnv1aHex(`${paperId}:${retrievedAt}`)}_${Date.now().toString(36)}`.slice(0, 128),
    subjectType: "entity", subjectId: paperId,
    quote: `Provider ${connectorId} record ${item.externalId} retrieved ${retrievedAt}.`.slice(0, 600),
    evidenceType: "metadata", sourceRef: ref,
    confidence: doi ? "high" : "medium", status: "current", origin, projectId, createdAt: now,
  }];

  let n = 0;
  for (const raw of (item.authors ?? []).slice(0, 32)) {
    const p = personIdFor(raw);
    if (!p) continue;
    entities.push({
      id: p.id, type: "person", canonicalName: p.canonical, normalizedName: p.normalized,
      status: "active", properties: {}, aliases: p.canonical !== String(raw).trim() ? [String(raw).trim().slice(0, 300)] : [],
      externalIds: [], tags: [], origin, provenance, projectId, createdAt: now, updatedAt: now,
    });
    const relId = `rel_${p.id}_${paperId}_authored`.slice(0, 120);
    relationships.push({
      id: relId, type: "AUTHORED_BY", subjectEntityId: p.id, objectEntityId: paperId,
      properties: {}, status: "asserted", confidence: "medium", origin, provenance, projectId, createdAt: now, updatedAt: now,
    });
    evidence.push({
      id: `rel_conn_${fnv1aHex(`${relId}:${retrievedAt}`)}_${(n++).toString(36)}`.slice(0, 128),
      subjectType: "relationship", subjectId: relId, evidenceType: "metadata", sourceRef: ref,
      confidence: "medium", status: "current", origin, projectId, createdAt: now,
    });
    if (relationships.length >= 64) break;
  }
  if (typeof item.venue === "string" && item.venue.trim()) {
    const name = item.venue.trim().slice(0, 300);
    const venueId = entityIdFor("venue", normalizeName(name));
    entities.push({
      id: venueId, type: "venue", canonicalName: name, normalizedName: normalizeName(name),
      status: "active", properties: {}, aliases: [], externalIds: [], tags: [], origin, provenance, projectId, createdAt: now, updatedAt: now,
    });
    const relId = `rel_${paperId}_${venueId}_in`.slice(0, 120);
    relationships.push({
      id: relId, type: "PUBLISHED_IN", subjectEntityId: paperId, objectEntityId: venueId,
      properties: {}, status: "asserted", confidence: "medium", origin, provenance, projectId, createdAt: now, updatedAt: now,
    });
    evidence.push({
      id: `rel_conn_${fnv1aHex(`${relId}:${retrievedAt}`)}_v`.slice(0, 128),
      subjectType: "relationship", subjectId: relId, evidenceType: "metadata", sourceRef: ref,
      confidence: "medium", status: "current", origin, projectId, createdAt: now,
    });
  }
  return { paperId, entities: entities.slice(0, 64), relationships: relationships.slice(0, 64), evidence: evidence.slice(0, 64) };
}

function detectConflicts(existing, incoming, connectorId, externalId) {
  const out = [];
  if (!existing || existing.provenance !== "user-authored") return out;
  if (incoming.canonicalName !== existing.canonicalName) {
    out.push({
      connectorId, externalId, entityId: existing.id, field: "canonicalName",
      localValue: existing.canonicalName.slice(0, 200), externalValue: incoming.canonicalName.slice(0, 200),
    });
  }
  return out;
}

export function previewConnectorItems(items) {
  const list = Array.isArray(items) ? items.slice(0, MAX_ITEMS_PER_IMPORT) : [];
  return list.map((item) => {
    try {
      validateItemShape(item);
      const { paperId } = buildRows(item, undefined);
      return {
        connectorId: item.connectorId, externalId: item.externalId, entityId: paperId,
        title: typeof item.title === "string" ? item.title.slice(0, 300) : undefined,
        authors: (item.authors ?? []).slice(0, 8),
        identifiers: (item.identifiers ?? []).slice(0, 8),
        externalUrl: item.externalUrl, valid: true,
      };
    } catch (err) {
      return {
        connectorId: item?.connectorId ?? "unknown", externalId: item?.externalId ?? "unknown",
        valid: false, error: safeError(err),
      };
    }
  });
}

export function dryRunConnectorImport(app, items, opts = {}) {
  const list = Array.isArray(items) ? items.slice(0, MAX_ITEMS_PER_IMPORT) : [];
  const result = { wouldCreate: [], wouldUpdate: [], wouldSkip: [], conflicts: [], validationErrors: [] };
  for (const item of list) {
    try {
      validateItemShape(item);
      const { paperId, entities } = buildRows(item, opts.projectId);
      const prev = getEntity(app, paperId);
      const hash = itemHashFor({
        connectorId: item.connectorId, externalId: item.externalId, itemType: item.itemType,
        title: item.title, authors: item.authors ?? [], organizations: item.organizations ?? [],
        venue: item.venue, publicationDate: item.publicationDate, abstract: item.abstract,
        identifiers: item.identifiers ?? [], tags: item.tags ?? [], collections: item.collections ?? [],
      });
      const oldHash = getConnectorItemHash(app, item.connectorId, item.externalId);
      if (prev && oldHash === hash) { result.wouldSkip.push(paperId); continue; }
      if (!prev && opts.allowCreate === false) { result.wouldSkip.push(paperId); continue; }
      const paper = entities.find((e) => e.id === paperId);
      if (prev && paper) result.conflicts.push(...detectConflicts(prev, paper, item.connectorId, item.externalId));
      (prev ? result.wouldUpdate : result.wouldCreate).push(paperId);
    } catch (err) {
      result.validationErrors.push({
        connectorId: item?.connectorId ?? "unknown", externalId: item?.externalId ?? "unknown", error: safeError(err),
      });
    }
  }
  return result;
}

export function importConnectorItems(app, items, opts = {}) {
  const started = Date.now();
  const allowCreate = opts.allowCreate ?? true;
  const allowUpdate = opts.allowUpdate ?? true;
  const createEvidence = opts.createEvidence ?? true;
  const createRelationships = opts.createRelationships ?? true;
  const list = Array.isArray(items) ? items.slice(0, MAX_ITEMS_PER_IMPORT) : [];
  const result = { created: [], updated: [], unchanged: [], skipped: [], conflicts: [], failed: [], items: [] };
  for (const item of list) {
    const connectorId = item?.connectorId ?? "unknown";
    const externalId = item?.externalId ?? "unknown";
    try {
      validateItemShape(item);
      const built = buildRows(item, opts.projectId);
      const hash = itemHashFor({
        connectorId: item.connectorId, externalId: item.externalId, itemType: item.itemType,
        title: item.title, authors: item.authors ?? [], organizations: item.organizations ?? [],
        venue: item.venue, publicationDate: item.publicationDate, abstract: item.abstract,
        identifiers: item.identifiers ?? [], tags: item.tags ?? [], collections: item.collections ?? [],
      });
      const prev = getEntity(app, built.paperId);
      const oldHash = getConnectorItemHash(app, item.connectorId, item.externalId);
      if (prev && oldHash === hash) {
        result.unchanged.push(built.paperId);
        result.items.push({ connectorId, externalId, entityId: built.paperId, status: "unchanged" });
        continue;
      }
      if (opts.dryRun) {
        result.items.push({ connectorId, externalId, entityId: built.paperId, status: prev ? "updated" : "created" });
        continue;
      }
      if (!prev && !allowCreate) {
        result.skipped.push(built.paperId);
        result.items.push({ connectorId, externalId, entityId: built.paperId, status: "skipped" });
        continue;
      }
      let changed = !prev;
      let conflicted = false;
      for (const ent of built.entities) {
        const existing = getEntity(app, ent.id);
        if (existing) {
          const conflicts = detectConflicts(existing, ent, item.connectorId, item.externalId);
          if (conflicts.length) { result.conflicts.push(...conflicts); conflicted = true; }
          if (!allowUpdate && existing.provenance === "user-authored") continue;
          // Fill-missing property merge (never clobber user props).
          const mergedProps = { ...(existing.properties ?? {}) };
          for (const [k, v] of Object.entries(ent.properties ?? {})) {
            if (!(k in mergedProps)) mergedProps[k] = v;
            else if (k.startsWith("connector:") && mergedProps[k] !== v && existing.provenance !== "user-authored") {
              mergedProps[k] = v; changed = true;
            }
          }
          const before = stableStringify({ a: existing.aliases, t: existing.tags, i: existing.externalIds });
          const mergedTagList = [];
          const seenMergeTags = new Set();
          for (const t of [...existing.tags, ...ent.tags]) {
            const k = String(t).normalize("NFKC").toLowerCase();
            if (seenMergeTags.has(k)) continue;
            seenMergeTags.add(k);
            mergedTagList.push(t);
            if (mergedTagList.length >= 32) break;
          }
          const after = stableStringify({
            a: [...new Set([...existing.aliases, ...ent.aliases])].slice(0, 32),
            t: mergedTagList,
            i: ent.externalIds,
          });
          if (before !== after) changed = true;
          if (stableStringify(mergedProps) !== stableStringify(existing.properties ?? {})) changed = true;
          upsertEntity(app, { ...ent, tags: mergedTagList, properties: mergedProps });
        } else {
          upsertEntity(app, ent);
          changed = true;
        }
      }
      if (createRelationships) {
        for (const rel of built.relationships) {
          if (getRelationship(app, rel.id)) continue;
          try { upsertRelationship(app, rel); changed = true; } catch { continue; }
        }
      }
      if (createEvidence) {
        for (const ev of built.evidence) {
          const prior = getEvidenceFor(app, ev.subjectType, ev.subjectId);
          const dupe = prior.some((p) =>
            p.sourceRef?.chunkId === ev.sourceRef.chunkId &&
            p.evidenceType === ev.evidenceType && (p.quote ?? "") === (ev.quote ?? ""));
          if (dupe) continue;
          try { addEvidence(app, ev); changed = true; } catch { continue; }
        }
      }
      setConnectorItemHash(app, item.connectorId, item.externalId, hash);
      linkConnectorItem(app, item.connectorId, item.externalId, built.paperId);
      if (conflicted) {
        result.items.push({ connectorId, externalId, entityId: built.paperId, status: "conflict", detail: "User-authored fields preserved; external value kept as evidence." });
        if (!prev) result.created.push(built.paperId);
        else if (changed) result.updated.push(built.paperId);
        else result.unchanged.push(built.paperId);
      } else if (!prev) {
        result.created.push(built.paperId);
        result.items.push({ connectorId, externalId, entityId: built.paperId, status: "created" });
      } else if (changed) {
        result.updated.push(built.paperId);
        result.items.push({ connectorId, externalId, entityId: built.paperId, status: "updated" });
      } else {
        result.unchanged.push(built.paperId);
        result.items.push({ connectorId, externalId, entityId: built.paperId, status: "unchanged" });
      }
    } catch (err) {
      const error = safeError(err);
      result.failed.push({ connectorId, externalId, error });
      result.items.push({ connectorId, externalId, status: "failed", detail: error });
    }
  }
  try {
    log.info("connector import", {
      connectors: [...new Set(list.map((i) => i?.connectorId).filter((c) => typeof c === "string"))],
      durationMs: Date.now() - started,
      itemsReceived: list.length,
      itemsCreated: result.created.length,
      itemsUpdated: result.updated.length,
      itemsSkipped: result.skipped.length + result.unchanged.length,
      itemsFailed: result.failed.length,
      conflicts: result.conflicts.length,
    });
  } catch { /* logging must never throw */ }
  return result;
}

export function getConnectorIdentityInfo(item) {
  validateItemShape(item);
  const doi = doiOf(item);
  const resolved = resolveConnectorIdentity({
    connectorId: item.connectorId, externalId: item.externalId, doi,
    fallbackKey: item.title ?? item.externalId,
  });
  return { doi, resolved };
}
