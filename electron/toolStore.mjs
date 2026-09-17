/**
 * Phase 5 — Main-process tool execution + durable audit ledger (SQLite v10).
 * Same database ownership as researchDb (getDb singleton, DatabaseSync —
 * serialized in the main process; no competing writers). Parameterized SQL
 * only; safe generic errors (never SQL text/paths/secrets to callers).
 *
 * Handlers delegate to existing stores (knowledgeStore, connectorStore,
 * researchDb) — no duplicated business logic. Document and utility tools are
 * local-only and execute in the caller runtime. Schemas, policy, and audit
 * sanitization come from the shared toolCore.mjs.
 */
import { getDb } from "./researchDb.mjs";
import { createLogger } from "./log.mjs";
import {
  getEntity,
  getEvidenceFor,
  listRelationships,
  searchEntities,
  traverse,
} from "./knowledgeStore.mjs";
import {
  getConnectorSyncStatus,
  importConnectorItems,
  previewConnectorItems,
} from "./connectorStore.mjs";
import { loadProject } from "./researchDb.mjs";
import {
  CONNECTOR_CAPABILITIES,
  CONNECTOR_META,
} from "../src/lib/connectors/connectorCore.mjs";
import {
  TOOL_DEFINITIONS,
  TOOL_LIMITS,
  buildToolRequest,
  evaluateCalculation,
  evaluatePolicy,
  newEventId,
  newRequestId,
  summarizeForAudit,
  validateAgainstSchema,
} from "../src/lib/tools/toolCore.mjs";

const log = createLogger("tools");
const MAX_AUDIT_ROWS = 2000;

function fail(message) {
  throw new Error(`Tools: ${message}`);
}

function getDefinition(toolId) {
  const def = TOOL_DEFINITIONS.find((d) => d.id === toolId);
  if (!def) fail(`unknown tool: ${String(toolId).slice(0, 80)}`);
  return def;
}

export function listToolDefinitions() {
  return TOOL_DEFINITIONS.map((d) => ({ ...d }));
}

export function inspectToolDefinition(toolId) {
  const d = getDefinition(toolId);
  return {
    id: d.id, name: d.name, description: d.description, category: d.category,
    version: d.version, inputSchema: d.inputSchema, outputSchema: d.outputSchema,
    capabilities: [...d.capabilities], permission: d.permission, risk: d.risk,
  };
}

function checkInput(def, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("invalid input");
  const res = validateAgainstSchema(def.inputSchema, raw);
  if (!res.ok) {
    const tooLarge = /exceed/i.test(res.error);
    fail(`${tooLarge ? "input too large" : "invalid input"}: ${String(res.error).slice(0, 160)}`);
  }
  return res.value;
}

function checkOutput(def, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("invalid tool output");
  const res = validateAgainstSchema(def.outputSchema, raw);
  if (!res.ok) fail(`invalid tool output: ${String(res.error).slice(0, 160)}`);
  return res.value;
}

function checkContext(raw) {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) fail("invalid context");
  const out = {};
  if (raw.projectId !== undefined) {
    if (typeof raw.projectId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(raw.projectId)) fail("invalid project id");
    out.projectId = raw.projectId;
  }
  for (const k of ["userInitiated", "userConfirmed", "systemInternal"]) {
    if (raw[k] !== undefined) {
      if (typeof raw[k] !== "boolean") fail(`invalid context: ${k}`);
      out[k] = raw[k];
    }
  }
  if (raw.confirmedToolId !== undefined) {
    if (typeof raw.confirmedToolId !== "string" || raw.confirmedToolId.length > 128) fail("invalid confirmed tool");
    out.confirmedToolId = raw.confirmedToolId;
  }
  if (raw.source !== undefined) {
    if (typeof raw.source !== "string" || raw.source.length > 64) fail("invalid source");
    out.source = raw.source;
  }
  if (raw.requestId !== undefined) {
    if (typeof raw.requestId !== "string" || raw.requestId.length > 64) fail("invalid request id");
    out.requestId = raw.requestId;
  }
  return out;
}

function capText(s, max) {
  return typeof s === "string" ? s.slice(0, max) : undefined;
}

/* ---------------- handlers (backend tools only; local tools run in renderer) ---------------- */

const HANDLERS = {
  "knowledge.search"(app, input, ctx) {
    const projectId = input.projectId ?? ctx.projectId;
    const opts = { limit: Math.min(Number(input.limit ?? 20), 100), projectId };
    if (typeof input.query === "string" && input.query.trim()) opts.query = input.query.slice(0, 500);
    if (typeof input.entityType === "string" && input.entityType) opts.type = input.entityType.slice(0, 64);
    if (typeof input.tag === "string" && input.tag) opts.tag = input.tag.slice(0, 64);
    if (typeof input.identifier === "string" && input.identifier) opts.identifier = input.identifier.slice(0, 512);
    if (typeof input.status === "string" && input.status) opts.status = input.status;
    return { entities: searchEntities(app, opts).slice(0, 100) };
  },
  "knowledge.get_entity"(app, input) {
    const entity = getEntity(app, input.entityId);
    if (!entity) fail("entity not found");
    return {
      entity: {
        ...entity,
        description: capText(entity.description, 2000),
        provenanceSummary: `${entity.origin}/${entity.provenance}/${entity.status}`,
      },
    };
  },
  "knowledge.get_relationships"(app, input) {
    const depth = Number(input.depth ?? 1);
    const limit = Math.min(Number(input.limit ?? 50), 500);
    if (depth === 1) {
      const opts = { limit };
      if (input.direction === "outgoing") opts.direction = "out";
      if (input.direction === "incoming") opts.direction = "in";
      if (typeof input.relationshipType === "string" && input.relationshipType) opts.type = input.relationshipType;
      return { relationships: listRelationships(app, input.entityId, opts).slice(0, 500) };
    }
    const t = traverse(app, input.entityId, { depth, limit });
    return { relationships: (Array.isArray(t?.steps) ? t.steps : []).slice(0, 500) };
  },
  "knowledge.get_evidence"(app, input) {
    const limit = Math.min(Number(input.limit ?? 50), 200);
    if (typeof input.relationshipId === "string" && input.relationshipId) {
      return { evidence: getEvidenceFor(app, "relationship", input.relationshipId).slice(0, limit) };
    }
    if (typeof input.entityId === "string" && input.entityId) {
      return { evidence: getEvidenceFor(app, "entity", input.entityId).slice(0, limit) };
    }
    fail("entityId or relationshipId is required");
  },
  "connector.list"(app) {
    const sources = {};
    for (const s of listConnectorSourcesSafe(app)) sources[s.connector_id] = s;
    return {
      connectors: Object.values(CONNECTOR_META).map((m) => ({
        ...m,
        capabilities: [...(CONNECTOR_CAPABILITIES[m.id] ?? [])],
        sync: getConnectorSyncStatus(app, m.id),
      })).slice(0, 32),
    };
  },
  "connector.get"(app, input) {
    const id = input.connectorId;
    if (id !== "crossref" && id !== "zotero") fail("unknown connector");
    return {
      connector: {
        connectorId: id,
        capabilities: [...(CONNECTOR_CAPABILITIES[id] ?? [])],
        sync: getConnectorSyncStatus(app, id),
      },
    };
  },
  "connector.preview"(app, input) {
    return { preview: previewConnectorItems(input.items).slice(0, 200) };
  },
  async "connector.search"(app, input) {
    const items = await crossrefSearchMain(
      String(input.query).slice(0, 300), Math.min(Number(input.rows ?? 5), 20)
    );
    return { items };
  },
  "connector.import"(app, input, ctx) {
    const result = importConnectorItems(app, input.items, {
      projectId: input.projectId ?? ctx.projectId,
      dryRun: input.dryRun === true ? true : undefined,
    });
    return {
      result: {
        created: result.created.slice(0, 200),
        updated: result.updated.slice(0, 200),
        unchanged: result.unchanged.slice(0, 200),
        skipped: result.skipped.slice(0, 200),
        conflicts: result.conflicts.slice(0, 50),
        failed: result.failed.slice(0, 50),
        counts: {
          created: result.created.length, updated: result.updated.length,
          unchanged: result.unchanged.length, skipped: result.skipped.length,
          conflicts: result.conflicts.length, failed: result.failed.length,
        },
      },
    };
  },
  "project.get"(app, input) {
    const project = loadProject(app, input.projectId);
    if (!project) fail("project not found");
    return {
      project: {
        id: project.id,
        title: String(project.title ?? "").slice(0, 300),
        targetVenue: String(project.targetVenue ?? "generic").slice(0, 64),
        updatedAt: project.updatedAt,
        paperCount: Array.isArray(project.papers) ? project.papers.length : 0,
        draftChars: typeof project.draftTex === "string" ? project.draftTex.length : 0,
        bibliographyChars: typeof project.bibliography === "string" ? project.bibliography.length : 0,
        knowledgeChars: typeof project.knowledge === "string" ? project.knowledge.length : 0,
      },
    };
  },
  "export.create"(app, input, ctx) {
    const projectId = input.projectId ?? ctx.projectId;
    const maxEntities = Math.min(Number(input.maxEntities ?? 200), 500);
    let entities;
    if (Array.isArray(input.entityIds) && input.entityIds.length > 0) {
      entities = input.entityIds.slice(0, 200).map((id) => getEntity(app, id)).filter(Boolean);
    } else {
      entities = searchEntities(app, { projectId, limit: Math.min(maxEntities, 100) }).slice(0, maxEntities);
    }
    const relationships = [];
    const evidence = [];
    for (const e of entities.slice(0, maxEntities)) {
      for (const r of listRelationships(app, e.id, { limit: 20 }).slice(0, 5)) {
        if (relationships.length < 1000) relationships.push(r);
      }
      for (const ev of getEvidenceFor(app, "entity", e.id).slice(0, 5)) {
        if (evidence.length < 1000) evidence.push(ev);
      }
      if (relationships.length >= 1000 || evidence.length >= 1000) break;
    }
    const exported = {
      format: "openbentt-knowledge-v1",
      exportedAt: new Date().toISOString(),
      entities: entities.slice(0, maxEntities),
      relationships: relationships.slice(0, 1000),
      evidence: evidence.slice(0, 1000),
    };
    const json = JSON.stringify(exported);
    if (json.length > 2 * 1024 * 1024) fail("export too large");
    return {
      export: {
        format: exported.format,
        exportedAt: exported.exportedAt,
        counts: {
          entities: exported.entities.length,
          relationships: exported.relationships.length,
          evidence: exported.evidence.length,
        },
        bytes: json.length,
        json: json.length > 500000 ? json.slice(0, 500000) : json,
        truncated: json.length > 500000,
      },
    };
  },
};

function listConnectorSourcesSafe(app) {
  const db = getDb(app);
  try {
    return db.prepare("SELECT * FROM connector_sources ORDER BY connector_id ASC").all();
  } catch {
    return [];
  }
}

/**
 * Crossref search on the main process: bounded, SSRF-safe, JSON-only.
 * Stricter than the renderer path — follows no redirects (fails closed).
 */
async function crossrefSearchMain(query, rows) {
  if (!query || !query.trim()) fail("invalid query");
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query.trim().slice(0, 300))}&rows=${rows}&select=DOI,title,author,issued,container-title,publisher,URL,type`;
  const { validateExternalUrl } = await import("../src/lib/connectors/connectorCore.mjs").catch(() => ({}));
  let start = url;
  if (validateExternalUrl) start = validateExternalUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res;
  try {
    res = await fetch(start, {
      signal: ctrl.signal,
      redirect: "manual",
      headers: { Accept: "application/json", "User-Agent": "OpenBenTT/2.0 (mailto:openbentt-contributors@users.noreply.github.com)" },
    });
  } catch {
    clearTimeout(timer);
    fail("connector network request failed");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) fail("provider rate limit reached");
  if (res.status >= 300 && res.status < 400) fail("provider redirect refused");
  if (!res.ok) fail(`provider error: HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!/application\/json/i.test(ct)) fail("provider returned an invalid response");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > 2 * 1024 * 1024) fail("provider response exceeded the size limit");
  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    fail("provider returned an invalid response");
  }
  const found = json?.message?.items;
  if (!Array.isArray(found)) fail("provider returned an invalid response");
  const out = [];
  for (const m of found.slice(0, rows)) {
    try {
      out.push(summarizeCrossrefMessage(m));
    } catch {
      continue;
    }
  }
  return out;
}

function summarizeCrossrefMessage(m) {
  if (!m || typeof m !== "object") throw new Error("bad item");
  const title = Array.isArray(m.title) ? m.title[0] : m.title;
  const doi = typeof m.DOI === "string" ? m.DOI : "";
  if (!title && !doi) throw new Error("bad item");
  const authors = Array.isArray(m.author)
    ? m.author.map((a) => (a?.name ? a.name : [a?.given, a?.family].filter(Boolean).join(" "))).filter(Boolean).slice(0, 8)
    : [];
  const year = m?.issued?.["date-parts"]?.[0]?.[0]?.toString();
  const venue = Array.isArray(m["container-title"]) ? m["container-title"][0] : undefined;
  return {
    connectorId: "crossref",
    externalId: doi || String(title).slice(0, 128),
    title: typeof title === "string" ? title.slice(0, 300) : undefined,
    authors: authors.map((a) => String(a).slice(0, 300)),
    venue: typeof venue === "string" ? venue.slice(0, 300) : undefined,
    publicationDate: typeof year === "string" ? year.slice(0, 16) : undefined,
    externalUrl: typeof m.URL === "string" ? m.URL.slice(0, 2000) : undefined,
    identifiers: doi ? [{ namespace: "doi", value: doi.slice(0, 500) }] : [],
    retrievedAt: new Date().toISOString(),
    sourceVersion: "crossref-v1",
  };
}

/* ---------------- audit ledger ---------------- */

export function recordToolAuditEvent(app, event) {
  const db = getDb(app);
  if (!event || typeof event !== "object") fail("invalid audit event");
  const id = typeof event.eventId === "string" && event.eventId ? event.eventId.slice(0, 64) : `taudit_${Date.now().toString(36)}`;
  const summary = JSON.stringify(event.resourceSummary ?? {}).slice(0, TOOL_LIMITS.maxAuditSummaryChars);
  db.prepare(
    `INSERT INTO tool_audit_events (id, tool_id, tool_version, request_id, created_at, source,
      project_id, permission, risk, decision, status, duration_ms, resource_summary_json, error_category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`
  ).run(
    id,
    String(event.toolId ?? "unknown").slice(0, 128),
    String(event.toolVersion ?? "").slice(0, 32),
    String(event.requestId ?? "").slice(0, 64),
    event.timestamp ?? new Date().toISOString(),
    String(event.source ?? "unknown").slice(0, 64),
    event.projectId ? String(event.projectId).slice(0, 128) : null,
    String(event.permission ?? "READ_ONLY").slice(0, 32),
    String(event.risk ?? "LOW").slice(0, 16),
    String(event.decision ?? "DENY").slice(0, 16),
    String(event.status ?? "failed").slice(0, 32),
    Math.max(0, Number(event.durationMs ?? 0) || 0),
    summary,
    event.errorCategory ? String(event.errorCategory).slice(0, 120) : null
  );
  // Bound the ledger (latest 2000 rows).
  const stale = db.prepare("SELECT id FROM tool_audit_events ORDER BY created_at DESC LIMIT -1 OFFSET 2000").all();
  if (stale.length) {
    db.prepare(`DELETE FROM tool_audit_events WHERE id IN (${stale.map(() => "?").join(",")})`).run(...stale.map((r) => r.id));
  }
  return id;
}

export function listToolAuditEvents(app, opts = {}) {
  const db = getDb(app);
  const limit = Math.min(Math.max(Number(opts.limit ?? 50) || 50, 1), 200);
  const conditions = [];
  const params = [];
  if (opts.toolId !== undefined) {
    if (typeof opts.toolId !== "string" || !opts.toolId) fail("invalid tool id");
    conditions.push("tool_id = ?");
    params.push(opts.toolId);
  }
  if (opts.projectId !== undefined) {
    if (typeof opts.projectId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(opts.projectId)) fail("invalid project id");
    conditions.push("project_id = ?");
    params.push(opts.projectId);
  }
  if (opts.status !== undefined) {
    if (!["ok", "denied", "confirm_required", "failed"].includes(opts.status)) fail("invalid status");
    conditions.push("status = ?");
    params.push(opts.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(
    `SELECT id AS eventId, tool_id AS toolId, tool_version AS toolVersion, request_id AS requestId,
      created_at AS timestamp, source, project_id AS projectId, permission, risk, decision, status,
      duration_ms AS durationMs, resource_summary_json AS resourceSummaryJson, error_category AS errorCategory
     FROM tool_audit_events ${where} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, limit);
  return rows.map((r) => {
    let resourceSummary = {};
    try {
      resourceSummary = JSON.parse(r.resourceSummaryJson ?? "{}");
    } catch {
      resourceSummary = {};
    }
    const { resourceSummaryJson, ...rest } = r;
    void resourceSummaryJson;
    return { ...rest, resourceSummary };
  });
}

/* ---------------- executor (main-process parity with renderer executeTool) ---------------- */

export async function executeToolMain(app, toolId, rawInput, rawContext, opts = {}) {
  const started = Date.now();
  const source = rawContext?.source ?? "electron";
  const persist = (event) => {
    try {
      recordToolAuditEvent(app, event);
    } catch (err) {
      log.warn("audit persist failed", { error: err instanceof Error ? err.message : "unknown" });
    }
  };
  const finish = (event, result) => {
    persist(event);
    try {
      log.info("tool execute", {
        toolId: event.toolId, decision: event.decision, status: event.status,
        durationMs: event.durationMs,
      });
    } catch { /* logging must never throw */ }
    return result;
  };
  let def;
  try {
    def = getDefinition(toolId);
  } catch {
    const event = {
      eventId: newEventId(), toolId: String(toolId ?? "unknown"), toolVersion: "?",
      requestId: "none", timestamp: new Date().toISOString(), source,
      permission: "READ_ONLY", risk: "LOW", decision: "DENY", status: "denied",
      durationMs: Date.now() - started, resourceSummary: { input: summarizeForAudit(rawInput) },
      errorCategory: "unknown_tool",
    };
    return finish(event, {
      ok: false, toolId: event.toolId, toolVersion: "?", requestId: "none",
      error: "Tools: unknown tool", errorKind: "unknown_tool",
      decision: "DENY", durationMs: Date.now() - started,
    });
  }
  if (def.executionMode === "local") {
    const event = {
      eventId: newEventId(), toolId: def.id, toolVersion: def.version,
      requestId: "none", timestamp: new Date().toISOString(), source,
      permission: def.permission, risk: def.risk, decision: "DENY", status: "denied",
      durationMs: Date.now() - started, resourceSummary: { input: summarizeForAudit(rawInput) },
      errorCategory: "invalid_input",
    };
    return finish(event, {
      ok: false, toolId: def.id, toolVersion: def.version, requestId: "none",
      error: "Tools: local-only tool executes in the caller runtime", errorKind: "invalid_input",
      decision: "DENY", durationMs: Date.now() - started,
    });
  }
  let input;
  let context;
  try {
    input = checkInput(def, rawInput);
    context = checkContext(rawContext);
  } catch (err) {
    const event = {
      eventId: newEventId(), toolId: def.id, toolVersion: def.version,
      requestId: rawContext?.requestId ?? "none", timestamp: new Date().toISOString(), source,
      permission: def.permission, risk: def.risk, decision: "DENY", status: "denied",
      durationMs: Date.now() - started, resourceSummary: { input: summarizeForAudit(rawInput) },
      errorCategory: "invalid_input",
    };
    return finish(event, {
      ok: false, toolId: def.id, toolVersion: def.version, requestId: event.requestId,
      error: err instanceof Error ? err.message : "Tools: invalid input", errorKind: "invalid_input",
      decision: "DENY", durationMs: Date.now() - started,
    });
  }
  const requestId = context.requestId ?? newRequestId();
  context.requestId = requestId;
  const policy = evaluatePolicy(
    { id: def.id, permission: def.permission, risk: def.risk, capabilities: def.capabilities },
    {
      userInitiated: context.userInitiated, userConfirmed: context.userConfirmed,
      confirmedToolId: context.confirmedToolId, systemInternal: context.systemInternal,
    }
  );
  if (policy.decision === "DENY") {
    const event = {
      eventId: newEventId(), toolId: def.id, toolVersion: def.version, requestId,
      timestamp: new Date().toISOString(), source, projectId: context.projectId,
      permission: def.permission, risk: def.risk, decision: "DENY", status: "denied",
      durationMs: Date.now() - started, resourceSummary: { input: summarizeForAudit(input) },
      errorCategory: "permission_denied",
    };
    return finish(event, {
      ok: false, toolId: def.id, toolVersion: def.version, requestId,
      error: "Tools: execution is not permitted in this context", errorKind: "permission_denied",
      decision: "DENY", durationMs: Date.now() - started,
    });
  }
  if (policy.decision === "CONFIRM") {
    const confirmation = buildToolRequest(
      { id: def.id, name: def.name, version: def.version, risk: def.risk, permission: def.permission, capabilities: def.capabilities },
      Object.keys(input).slice(0, 5).join(", ")
    );
    const event = {
      eventId: newEventId(), toolId: def.id, toolVersion: def.version, requestId,
      timestamp: new Date().toISOString(), source, projectId: context.projectId,
      permission: def.permission, risk: def.risk, decision: "CONFIRM", status: "confirm_required",
      durationMs: Date.now() - started,
      resourceSummary: {
        input: summarizeForAudit(input),
        resourceIds: Array.isArray(input.items) ? input.items.slice(0, 20).map((i) => String(i?.externalId ?? "?")) : [],
      },
    };
    return finish(event, {
      ok: false, toolId: def.id, toolVersion: def.version, requestId,
      error: "Tools: user confirmation is required before execution", errorKind: "confirmation_required",
      decision: "CONFIRM", durationMs: Date.now() - started, data: confirmation,
    });
  }
  const timeoutMs = Math.min(Math.max(Number(opts.timeoutMs ?? TOOL_LIMITS.defaultTimeoutMs), 1000), TOOL_LIMITS.maxTimeoutMs);
  try {
    const handler = HANDLERS[def.id];
    if (!handler) fail("unknown tool");
    const raw = await withTimeoutMain(handler(app, input, context), timeoutMs);
    const data = checkOutput(def, raw);
    const event = {
      eventId: newEventId(), toolId: def.id, toolVersion: def.version, requestId,
      timestamp: new Date().toISOString(), source, projectId: context.projectId ?? input.projectId,
      permission: def.permission, risk: def.risk, decision: "ALLOW", status: "ok",
      durationMs: Date.now() - started,
      resourceSummary: { input: summarizeForAudit(input), resourceIds: extractIds(def.id, data), counts: countData(def.id, data) },
    };
    return finish(event, {
      ok: true, toolId: def.id, toolVersion: def.version, requestId,
      data, decision: "ALLOW", durationMs: Date.now() - started,
    });
  } catch (err) {
    const event = {
      eventId: newEventId(), toolId: def.id, toolVersion: def.version, requestId,
      timestamp: new Date().toISOString(), source, projectId: context.projectId ?? input.projectId,
      permission: def.permission, risk: def.risk, decision: "ALLOW", status: "failed",
      durationMs: Date.now() - started, resourceSummary: { input: summarizeForAudit(input) },
      errorCategory: errorKindFor(err),
    };
    return finish(event, {
      ok: false, toolId: def.id, toolVersion: def.version, requestId,
      error: safeMessageFor(err), errorKind: errorKindFor(err),
      decision: "ALLOW", durationMs: Date.now() - started,
    });
  }
}

function withTimeoutMain(p, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Tools: execution timed out")), ms);
  });
  const run = Promise.resolve(p).finally(() => { if (timer) clearTimeout(timer); });
  return Promise.race([run, timeout]);
}

function errorKindFor(err) {
  const m = err instanceof Error ? err.message : String(err ?? "");
  if (/rate limit/i.test(m)) return "rate_limited";
  if (/timed out/i.test(m)) return "timeout";
  if (/network/i.test(m)) return "network_error";
  if (/unknown tool/i.test(m)) return "unknown_tool";
  if (/invalid|required|format/i.test(m)) return "invalid_input";
  if (/not found/i.test(m)) return "execution_failed";
  return "execution_failed";
}

function safeMessageFor(err) {
  const m = err instanceof Error ? err.message : "Tools: execution failed";
  return String(m)
    .replace(/(Bearer\s+)[^\s;,"'}]+/gi, "$1[redacted]")
    .replace(/([A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password)[A-Za-z0-9_-]*\s*[:=]\s*)([^\s&;,"'}]+)/gi, "$1[redacted]")
    .slice(0, 300);
}

function extractIds(toolId, data) {
  try {
    if (toolId === "knowledge.search") return (data.entities ?? []).slice(0, 50).map((e) => String(e?.id ?? "?"));
    if (toolId === "knowledge.get_entity") return data.entity?.id ? [String(data.entity.id)] : [];
    if (toolId === "connector.import") {
      const r = data.result ?? {};
      return [...(r.created ?? []), ...(r.updated ?? [])].slice(0, 50).map(String);
    }
  } catch {
    return [];
  }
  return [];
}

function countData(toolId, data) {
  try {
    for (const k of ["entities", "relationships", "evidence", "connectors", "preview", "items"]) {
      if (Array.isArray(data[k])) return { [k]: data[k].length };
    }
    if (toolId === "connector.import" && data.result?.counts) return data.result.counts;
    if (toolId === "export.create" && data.export?.counts) return data.export.counts;
  } catch {
    return {};
  }
  return {};
}

// Document metadata on main (local tools execute renderer-side; main exposes
// bounded metadata reads for parity checks only).
export function getDocumentSummary(app, documentId) {
  const db = getDb(app);
  if (typeof documentId !== "string" || !documentId) fail("invalid document id");
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(documentId);
  if (!row) return null;
  return {
    id: row.id, title: String(row.title ?? "").slice(0, 300),
    sourceType: row.source_type, status: row.status, version: row.version,
    projectId: row.project_id || undefined,
  };
}

export { evaluateCalculation };
