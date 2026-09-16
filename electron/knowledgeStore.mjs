/**
 * Phase 3 — Durable provenance-first knowledge store (SQLite v8 tables).
 * Same database ownership as researchDb (getDb singleton, DatabaseSync —
 * serialized in the main process; no competing writers). Parameterized SQL
 * only; safe generic errors (never SQL text/paths to callers).
 */
import { getDb } from "./researchDb.mjs";
import {
  ENTITY_TYPE_IDS,
  ID_RE_SRC,
  KNOWLEDGE_LIMITS,
  NAMESPACE_RE_SRC,
  RELATIONSHIP_TYPE_IDS,
} from "../src/lib/knowledge/knowledgeCore.mjs";

const ID_RE = new RegExp(ID_RE_SRC);
const NAMESPACE_RE = new RegExp(NAMESPACE_RE_SRC);
const L = KNOWLEDGE_LIMITS;

const ENTITY_STATUSES = new Set(["active", "unresolved", "deprecated", "merged"]);
const REL_STATUSES = new Set(["asserted", "uncertain", "deprecated", "retracted"]);
const EV_STATUSES = new Set(["current", "stale", "retracted"]);
const EV_SUBJECTS = new Set(["entity", "relationship"]);
const EV_TYPES = new Set(["document", "metadata", "citation", "user", "import"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);
const ORIGINS = new Set(["user", "document", "zotero", "crossref", "import", "system", "future-llm"]);
const PROVENANCES = new Set(["automatic", "user-authored", "imported"]);

function fail(message) {
  throw new Error(`Knowledge: ${message}`);
}

function checkId(id, label = "id") {
  if (typeof id !== "string" || !ID_RE.test(id)) fail(`invalid ${label}`);
  return id;
}

function checkText(value, max, label, required = false) {
  if (value === undefined || value === null) {
    if (required) fail(`${label} is required`);
    return undefined;
  }
  if (typeof value !== "string") fail(`invalid ${label}`);
  if (required && !value.trim()) fail(`${label} is required`);
  if (value.length > max) fail(`${label} exceeds ${max} characters`);
  return value;
}

function checkMap(value, label) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) fail(`invalid ${label}`);
  const entries = Object.entries(value);
  if (entries.length > L.maxProperties) fail(`${label} exceeds ${L.maxProperties} entries`);
  const out = {};
  for (const [k, v] of entries) {
    if (typeof k !== "string" || !k.trim() || k.length > L.maxPropertyKeyChars) fail(`invalid ${label} key`);
    if (typeof v !== "string" || v.length > L.maxPropertyValueChars) fail(`invalid ${label} value`);
    out[k] = v;
  }
  return out;
}

function checkList(value, maxItems, maxChars, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) fail(`invalid ${label}`);
  return value.map((v) => checkText(v, maxChars, label, true));
}

function rowToEntity(db, row) {
  const aliases = db.prepare("SELECT alias FROM knowledge_entity_aliases WHERE entity_id = ?").all(row.id).map((r) => r.alias);
  const externalIds = db.prepare("SELECT namespace, value FROM knowledge_entity_identifiers WHERE entity_id = ?").all(row.id);
  const tags = db.prepare("SELECT tag FROM knowledge_entity_tags WHERE entity_id = ?").all(row.id).map((r) => r.tag);
  return {
    id: row.id,
    type: row.type,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    description: row.description || undefined,
    status: row.status,
    mergedInto: row.merged_into || undefined,
    properties: JSON.parse(row.properties_json ?? "{}"),
    aliases, externalIds, tags,
    origin: row.origin,
    provenance: row.provenance,
    projectId: row.project_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRelationship(row) {
  return {
    id: row.id,
    type: row.type,
    subjectEntityId: row.subject_id,
    objectEntityId: row.object_id,
    properties: JSON.parse(row.properties_json ?? "{}"),
    status: row.status,
    confidence: row.confidence,
    origin: row.origin,
    provenance: row.provenance,
    projectId: row.project_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEvidence(row) {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    predicate: row.predicate || undefined,
    quote: row.quote || undefined,
    evidenceType: row.evidence_type,
    sourceRef: JSON.parse(row.source_json ?? "{}"),
    evidenceDocVersion: row.evidence_doc_version ?? undefined,
    evidenceExtractorVersion: row.extractor_version || undefined,
    confidence: row.confidence,
    status: row.status,
    origin: row.origin,
    projectId: row.project_id || undefined,
    createdAt: row.created_at,
  };
}

function checkSourceRef(ref) {
  if (!ref || typeof ref !== "object") fail("evidence source is required");
  checkId(ref.documentId, "document id");
  if (ref.documentVersionId !== undefined) checkId(ref.documentVersionId, "document version id");
  if (ref.chunkId !== undefined) checkId(ref.chunkId, "chunk id");
  if (ref.page !== undefined && (!Number.isInteger(ref.page) || ref.page < 0 || ref.page > 100000)) {
    fail("invalid evidence page");
  }
  for (const k of ["section", "block", "sourceType", "sourceUri", "title"]) {
    if (ref[k] !== undefined && (typeof ref[k] !== "string" || ref[k].length > 500)) fail(`invalid evidence ${k}`);
  }
}

/** Upsert entity; user-authored rows keep their names (origins never overwrite users). */
export function upsertEntity(app, input) {
  const db = getDb(app);
  const id = checkId(input?.id, "entity id");
  const type = checkText(input?.type, 64, "entity type", true);
  if (!ENTITY_TYPE_IDS.includes(type)) fail(`unknown entity type: ${type}`);
  const canonicalName = checkText(input?.canonicalName, L.maxNameChars, "entity name", true);
  const normalizedName = checkText(input?.normalizedName, L.maxNameChars, "normalized name", true);
  const status = input?.status ?? "active";
  if (!ENTITY_STATUSES.has(status)) fail("invalid entity status");
  const origin = input?.origin ?? "system";
  if (!ORIGINS.has(origin)) fail("invalid origin");
  const provenance = input?.provenance ?? (origin === "user" ? "user-authored" : origin === "import" ? "imported" : "automatic");
  if (!PROVENANCES.has(provenance)) fail("invalid provenance");
  const description = checkText(input?.description, L.maxDescriptionChars, "description") ?? "";
  const properties = checkMap(input?.properties, "properties");
  const aliases = checkList(input?.aliases, L.maxAliases, L.maxAliasChars, "alias");
  const tags = checkList(input?.tags, L.maxTags, L.maxTagChars, "tag");
  const externalIds = input?.externalIds ?? [];
  if (!Array.isArray(externalIds) || externalIds.length > L.maxIdentifiers) fail("invalid external ids");
  for (const e of externalIds) {
    if (!e || typeof e !== "object") fail("invalid external id");
    if (typeof e.namespace !== "string" || !NAMESPACE_RE.test(e.namespace)) fail("invalid identifier namespace");
    checkText(e.value, L.maxIdentifierValueChars, "identifier value", true);
  }
  const projectId = input?.projectId !== undefined ? checkId(input.projectId, "project id") : null;
  const now = new Date().toISOString();

  const existing = db.prepare("SELECT * FROM knowledge_entities WHERE id = ?").get(id);
  // User-authored protection: deterministic reindexing never renames user rows.
  const keepUser = existing && existing.provenance === "user-authored" && provenance !== "user-authored";
  const finalName = keepUser ? existing.canonical_name : canonicalName;
  const finalNormalized = keepUser ? existing.normalized_name : normalizedName;
  const finalDesc = keepUser ? existing.description : description;

  db.prepare(
    `INSERT INTO knowledge_entities (id, project_id, type, canonical_name, normalized_name, description,
      status, properties_json, origin, provenance, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, type=excluded.type,
       canonical_name=excluded.canonical_name, normalized_name=excluded.normalized_name,
       description=excluded.description, status=excluded.status,
       properties_json=excluded.properties_json, origin=excluded.origin,
       provenance=excluded.provenance, updated_at=excluded.updated_at`
  ).run(id, projectId, type, finalName, finalNormalized, finalDesc, status,
    JSON.stringify(properties), origin, existing ? existing.provenance : provenance,
    existing ? existing.created_at : now, now);

  const insAlias = db.prepare("INSERT OR IGNORE INTO knowledge_entity_aliases (entity_id, alias) VALUES (?, ?)");
  for (const a of [...new Set(aliases)]) insAlias.run(id, a);
  const insId = db.prepare("INSERT OR IGNORE INTO knowledge_entity_identifiers (entity_id, namespace, value) VALUES (?, ?, ?)");
  for (const e of externalIds) insId.run(id, e.namespace, e.value);
  const insTag = db.prepare("INSERT OR IGNORE INTO knowledge_entity_tags (entity_id, tag) VALUES (?, ?)");
  for (const t of [...new Set(tags)]) insTag.run(id, t);
  return getEntity(app, id);
}

export function getEntity(app, id) {
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM knowledge_entities WHERE id = ?").get(checkId(id, "entity id"));
  return row ? rowToEntity(db, row) : null;
}

/** Follow mergedInto redirects to the canonical entity (cycle-guarded). */
export function resolveEntity(app, id) {
  let current = getEntity(app, id);
  const seen = new Set();
  while (current && current.status === "merged" && current.mergedInto && !seen.has(current.id)) {
    seen.add(current.id);
    current = getEntity(app, current.mergedInto);
  }
  return current;
}

export function searchEntities(app, opts = {}) {
  const db = getDb(app);
  const limit = Math.min(Math.max(Number(opts.limit ?? 20) || 20, 1), L.maxPageSize);
  const conditions = [];
  const params = [];
  if (opts.projectId !== undefined) {
    conditions.push("e.project_id = ?");
    params.push(checkId(opts.projectId, "project id"));
  }
  if (opts.type !== undefined) {
    if (!ENTITY_TYPE_IDS.includes(opts.type)) fail(`unknown entity type: ${opts.type}`);
    conditions.push("e.type = ?");
    params.push(opts.type);
  }
  if (opts.status !== undefined) {
    if (!ENTITY_STATUSES.has(opts.status)) fail("invalid entity status");
    conditions.push("e.status = ?");
    params.push(opts.status);
  }
  if (opts.identifier !== undefined) {
    const [ns, ...rest] = String(opts.identifier).split(":");
    if (!NAMESPACE_RE.test(ns || "") || !rest.join(":").trim()) fail("invalid identifier query");
    conditions.push("EXISTS (SELECT 1 FROM knowledge_entity_identifiers i WHERE i.entity_id = e.id AND i.namespace = ? AND i.value = ?)");
    params.push(ns, rest.join(":"));
  }
  if (opts.tag !== undefined) {
    conditions.push("EXISTS (SELECT 1 FROM knowledge_entity_tags t WHERE t.entity_id = e.id AND t.tag = ?)");
    params.push(checkText(opts.tag, L.maxTagChars, "tag", true));
  }
  if (opts.query !== undefined && String(opts.query).trim()) {
    const q = `%${String(opts.query).trim().toLowerCase().slice(0, 200)}%`;
    conditions.push(`(LOWER(e.canonical_name) LIKE ? OR LOWER(e.normalized_name) LIKE ?
      OR EXISTS (SELECT 1 FROM knowledge_entity_aliases a WHERE a.entity_id = e.id AND LOWER(a.alias) LIKE ?))`);
    params.push(q, q, q);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM knowledge_entities e ${where} ORDER BY e.updated_at DESC LIMIT ?`).all(...params, limit);
  return rows.map((r) => rowToEntity(db, r));
}

export function setEntityStatus(app, id, status) {
  const db = getDb(app);
  if (!ENTITY_STATUSES.has(status)) fail("invalid entity status");
  const row = db.prepare("SELECT id FROM knowledge_entities WHERE id = ?").get(checkId(id, "entity id"));
  if (!row) fail("entity not found");
  db.prepare("UPDATE knowledge_entities SET status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
  return getEntity(app, id);
}

/**
 * Safe merge: FROM → status=merged + mergedInto; merge record kept; evidence
 * rows are NOT rewritten (history stays traceable; resolveEntity redirects).
 */
export function mergeEntities(app, fromId, intoId, reason, origin = "system") {
  const db = getDb(app);
  checkId(fromId, "from entity id");
  checkId(intoId, "into entity id");
  if (fromId === intoId) fail("cannot merge an entity into itself");
  if (!ORIGINS.has(origin)) fail("invalid origin");
  const from = db.prepare("SELECT * FROM knowledge_entities WHERE id = ?").get(fromId);
  const into = db.prepare("SELECT * FROM knowledge_entities WHERE id = ?").get(intoId);
  if (!from) fail("from entity not found");
  if (!into) fail("into entity not found");
  const now = new Date().toISOString();
  const mergeId = `mrg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare("INSERT INTO knowledge_entity_merges (id, from_id, into_id, reason, origin, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(mergeId, fromId, intoId, checkText(reason, 500, "merge reason") ?? null, origin, now);
  db.prepare("UPDATE knowledge_entities SET status = 'merged', merged_into = ?, updated_at = ? WHERE id = ?")
    .run(intoId, now, fromId);
  // Carry aliases/identifiers/tags forward (dedupe via INSERT OR IGNORE).
  for (const a of db.prepare("SELECT alias FROM knowledge_entity_aliases WHERE entity_id = ?").all(fromId)) {
    db.prepare("INSERT OR IGNORE INTO knowledge_entity_aliases (entity_id, alias) VALUES (?, ?)").run(intoId, a.alias);
  }
  for (const e of db.prepare("SELECT namespace, value FROM knowledge_entity_identifiers WHERE entity_id = ?").all(fromId)) {
    db.prepare("INSERT OR IGNORE INTO knowledge_entity_identifiers (entity_id, namespace, value) VALUES (?, ?, ?)").run(intoId, e.namespace, e.value);
  }
  for (const t of db.prepare("SELECT tag FROM knowledge_entity_tags WHERE entity_id = ?").all(fromId)) {
    db.prepare("INSERT OR IGNORE INTO knowledge_entity_tags (entity_id, tag) VALUES (?, ?)").run(intoId, t.tag);
  }
  return { mergeId, from: getEntity(app, fromId), into: getEntity(app, intoId) };
}

export function listMerges(app, entityId) {
  const db = getDb(app);
  return db.prepare("SELECT id, from_id AS fromId, into_id AS intoId, reason, origin, created_at AS createdAt FROM knowledge_entity_merges WHERE from_id = ? OR into_id = ? ORDER BY created_at DESC")
    .all(checkId(entityId, "entity id"), entityId);
}

export function upsertRelationship(app, input) {
  const db = getDb(app);
  const id = checkId(input?.id, "relationship id");
  const type = checkText(input?.type, 64, "relationship type", true);
  if (!RELATIONSHIP_TYPE_IDS.includes(type)) fail(`unknown relationship type: ${type}`);
  const subject = checkId(input?.subjectEntityId, "subject entity id");
  const object = checkId(input?.objectEntityId, "object entity id");
  if (subject === object) fail("relationship subject and object must differ");
  const status = input?.status ?? "asserted";
  if (!REL_STATUSES.has(status)) fail("invalid relationship status");
  const confidence = input?.confidence ?? "medium";
  if (!CONFIDENCES.has(confidence)) fail("invalid confidence");
  const origin = input?.origin ?? "system";
  if (!ORIGINS.has(origin)) fail("invalid origin");
  const provenance = input?.provenance ?? (origin === "user" ? "user-authored" : origin === "import" ? "imported" : "automatic");
  if (!PROVENANCES.has(provenance)) fail("invalid provenance");
  const properties = checkMap(input?.properties, "properties");
  const projectId = input?.projectId !== undefined ? checkId(input.projectId, "project id") : null;
  if (!db.prepare("SELECT id FROM knowledge_entities WHERE id = ?").get(subject)) fail("subject entity not found");
  if (!db.prepare("SELECT id FROM knowledge_entities WHERE id = ?").get(object)) fail("object entity not found");
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM knowledge_relationships WHERE id = ?").get(id);
  const keepUser = existing && existing.provenance === "user-authored" && provenance !== "user-authored";
  db.prepare(
    `INSERT INTO knowledge_relationships (id, project_id, type, subject_id, object_id, properties_json,
      status, confidence, origin, provenance, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, type=excluded.type,
       subject_id=excluded.subject_id, object_id=excluded.object_id,
       properties_json=excluded.properties_json, status=excluded.status,
       confidence=excluded.confidence, origin=excluded.origin,
       provenance=knowledge_relationships.provenance, updated_at=excluded.updated_at`
  ).run(id, projectId, type, subject, object, JSON.stringify(keepUser ? JSON.parse(existing.properties_json ?? "{}") : properties),
    keepUser ? existing.status : status, confidence, origin, provenance,
    existing ? existing.created_at : now, now);
  return getRelationship(app, id);
}

export function getRelationship(app, id) {
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM knowledge_relationships WHERE id = ?").get(checkId(id, "relationship id"));
  return row ? rowToRelationship(row) : null;
}

export function listRelationships(app, entityId, opts = {}) {
  const db = getDb(app);
  checkId(entityId, "entity id");
  const limit = Math.min(Math.max(Number(opts.limit ?? 50) || 50, 1), L.maxPageSize);
  const conditions = ["(subject_id = ? OR object_id = ?)"];
  const params = [entityId, entityId];
  if (opts.direction === "out") { conditions.push("subject_id = ?"); params.push(entityId); }
  if (opts.direction === "in") { conditions.push("object_id = ?"); params.push(entityId); }
  if (opts.type !== undefined) {
    if (!RELATIONSHIP_TYPE_IDS.includes(opts.type)) fail(`unknown relationship type: ${opts.type}`);
    conditions.push("type = ?");
    params.push(opts.type);
  }
  const statuses = opts.statuses ?? ["asserted", "uncertain"];
  for (const s of statuses) if (!REL_STATUSES.has(s)) fail("invalid relationship status");
  conditions.push(`status IN (${statuses.map(() => "?").join(",")})`);
  params.push(...statuses);
  if (opts.projectId !== undefined) {
    conditions.push("project_id = ?");
    params.push(checkId(opts.projectId, "project id"));
  }
  const rows = db.prepare(`SELECT * FROM knowledge_relationships WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`)
    .all(...params, limit);
  return rows.map(rowToRelationship);
}

export function setRelationshipStatus(app, id, status) {
  const db = getDb(app);
  if (!REL_STATUSES.has(status)) fail("invalid relationship status");
  if (!db.prepare("SELECT id FROM knowledge_relationships WHERE id = ?").get(checkId(id, "relationship id"))) {
    fail("relationship not found");
  }
  db.prepare("UPDATE knowledge_relationships SET status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
  return getRelationship(app, id);
}

export function addEvidence(app, input) {
  const db = getDb(app);
  const id = checkId(input?.id, "evidence id");
  if (!EV_SUBJECTS.has(input?.subjectType)) fail("invalid evidence subject");
  const subjectId = checkId(input?.subjectId, "evidence subject id");
  checkSourceRef(input?.sourceRef);
  const quote = checkText(input?.quote, L.maxQuoteChars, "evidence quote");
  const evidenceType = input?.evidenceType ?? "document";
  if (!EV_TYPES.has(evidenceType)) fail("invalid evidence type");
  const confidence = input?.confidence ?? "medium";
  if (!CONFIDENCES.has(confidence)) fail("invalid confidence");
  const status = input?.status ?? "current";
  if (!EV_STATUSES.has(status)) fail("invalid evidence status");
  const origin = input?.origin ?? "system";
  if (!ORIGINS.has(origin)) fail("invalid origin");
  const predicate = checkText(input?.predicate, 64, "predicate");
  const projectId = input?.projectId !== undefined ? checkId(input.projectId, "project id") : null;
  const docVersion = input?.evidenceDocVersion;
  if (docVersion !== undefined && (!Number.isInteger(docVersion) || docVersion < 0)) fail("invalid evidence doc version");
  // Subject must exist (entity or relationship row).
  const table = input.subjectType === "entity" ? "knowledge_entities" : "knowledge_relationships";
  if (!db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(subjectId)) fail("evidence subject not found");
  // Cap evidence per subject (bounded growth).
  const count = db.prepare("SELECT COUNT(*) AS n FROM knowledge_evidence WHERE subject_type = ? AND subject_id = ?").get(input.subjectType, subjectId);
  if (count.n >= L.maxEvidencePerSubject && !db.prepare("SELECT id FROM knowledge_evidence WHERE id = ?").get(id)) {
    fail("evidence limit reached for this subject");
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO knowledge_evidence (id, project_id, subject_type, subject_id, predicate, quote,
      evidence_type, source_json, source_document_id, evidence_doc_version, extractor_version,
      confidence, status, origin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET predicate=excluded.predicate, quote=excluded.quote,
       evidence_type=excluded.evidence_type, source_json=excluded.source_json,
       source_document_id=excluded.source_document_id, evidence_doc_version=excluded.evidence_doc_version,
       extractor_version=excluded.extractor_version, confidence=excluded.confidence,
       status=excluded.status, origin=excluded.origin`
  ).run(id, projectId, input.subjectType, subjectId, predicate ?? null, quote ?? null, evidenceType,
    JSON.stringify(input.sourceRef), input.sourceRef.documentId,
    docVersion ?? null, checkText(input?.evidenceExtractorVersion, 64, "extractor version") ?? null,
    confidence, status, origin, now);
  const row = db.prepare("SELECT * FROM knowledge_evidence WHERE id = ?").get(id);
  return rowToEvidence(row);
}

export function getEvidenceFor(app, subjectType, subjectId) {
  const db = getDb(app);
  if (!EV_SUBJECTS.has(subjectType)) fail("invalid evidence subject");
  const rows = db.prepare("SELECT * FROM knowledge_evidence WHERE subject_type = ? AND subject_id = ? ORDER BY created_at ASC LIMIT ?")
    .all(subjectType, checkId(subjectId, "evidence subject id"), L.maxEvidencePerSubject);
  return rows.map(rowToEvidence);
}

export function listEvidenceForDocument(app, documentId, opts = {}) {
  const db = getDb(app);
  const limit = Math.min(Math.max(Number(opts.limit ?? 50) || 50, 1), L.maxPageSize);
  const rows = db.prepare("SELECT * FROM knowledge_evidence WHERE source_document_id = ? ORDER BY created_at ASC LIMIT ?")
    .all(checkId(documentId, "document id"), limit);
  return rows.map(rowToEvidence);
}

/** Document version moved on → v1 evidence becomes stale (never deleted, never false). */
export function markEvidenceStaleForDocument(app, documentId, currentVersion) {
  const db = getDb(app);
  checkId(documentId, "document id");
  if (!Number.isInteger(currentVersion) || currentVersion < 0) fail("invalid document version");
  const res = db.prepare(
    `UPDATE knowledge_evidence SET status = 'stale'
     WHERE source_document_id = ? AND status = 'current'
       AND evidence_doc_version IS NOT NULL AND evidence_doc_version < ?`
  ).run(documentId, currentVersion);
  return { marked: res.changes };
}

export function setEvidenceStatus(app, id, status) {
  const db = getDb(app);
  if (!EV_STATUSES.has(status)) fail("invalid evidence status");
  if (!db.prepare("SELECT id FROM knowledge_evidence WHERE id = ?").get(checkId(id, "evidence id"))) {
    fail("evidence not found");
  }
  db.prepare("UPDATE knowledge_evidence SET status = ? WHERE id = ?").run(status, id);
  return rowToEvidence(db.prepare("SELECT * FROM knowledge_evidence WHERE id = ?").get(id));
}

/**
 * Bounded BFS traversal. Cycle-safe (visited set), depth ≤ 3, nodes ≤ 500.
 * Follows asserted/uncertain relationships by default.
 */
export function traverse(app, entityId, opts = {}) {
  const db = getDb(app);
  checkId(entityId, "entity id");
  const depth = opts.depth === undefined ? 1 : Number(opts.depth);
  if (!Number.isInteger(depth) || depth < 1 || depth > L.maxTraversalDepth) {
    fail(`traversal depth must be 1–${L.maxTraversalDepth}`);
  }
  const limit = Math.min(Math.max(Number(opts.limit ?? 50) || 50, 1), L.maxTraversalNodes);
  const statuses = opts.statuses ?? ["asserted", "uncertain"];
  for (const s of statuses) if (!REL_STATUSES.has(s)) fail("invalid relationship status");
  if (!db.prepare("SELECT id FROM knowledge_entities WHERE id = ?").get(entityId)) fail("entity not found");

  const visited = new Set([entityId]);
  const nodes = [entityId];
  const steps = [];
  let frontier = [entityId];
  const placeholders = statuses.map(() => "?").join(",");
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const node of frontier) {
      const edges = db.prepare(
        `SELECT id, type, subject_id, object_id FROM knowledge_relationships
         WHERE (subject_id = ? OR object_id = ?) AND status IN (${placeholders}) LIMIT 200`
      ).all(node, node, ...statuses);
      for (const e of edges) {
        const other = e.subject_id === node ? e.object_id : e.subject_id;
        steps.push({ edgeId: e.id, type: e.type, from: node, to: other, depth: d });
        if (!visited.has(other) && nodes.length < limit) {
          visited.add(other);
          nodes.push(other);
          next.push(other);
        }
        if (nodes.length >= limit) return { nodes, steps };
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return { nodes, steps };
}

export function exportKnowledge(app, projectId) {
  const db = getDb(app);
  const where = projectId !== undefined ? "WHERE project_id = ?" : "";
  const params = projectId !== undefined ? [checkId(projectId, "project id")] : [];
  const entities = db.prepare(`SELECT * FROM knowledge_entities ${where}`).all(...params).map((r) => rowToEntity(db, r));
  const relationships = db.prepare(`SELECT * FROM knowledge_relationships ${where}`).all(...params).map(rowToRelationship);
  const evidence = db.prepare(`SELECT * FROM knowledge_evidence ${where}`).all(...params).map(rowToEvidence);
  const merges = db.prepare("SELECT id, from_id AS fromId, into_id AS intoId, reason, origin, created_at AS createdAt FROM knowledge_entity_merges").all();
  return { format: "openbentt-knowledge-v1", exportedAt: new Date().toISOString(), entities, relationships, evidence, merges };
}

export function knowledgeStats(app, projectId) {
  const db = getDb(app);
  const where = projectId !== undefined ? "WHERE project_id = ?" : "";
  const params = projectId !== undefined ? [checkId(projectId, "project id")] : [];
  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get(...params).n;
  return { entities: count("knowledge_entities"), relationships: count("knowledge_relationships"), evidence: count("knowledge_evidence") };
}
