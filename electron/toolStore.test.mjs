import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, getSchemaVersion } from "./researchDb.mjs";
import { upsertEntity, getEntity, searchEntities } from "./knowledgeStore.mjs";
import {
  executeToolMain,
  inspectToolDefinition,
  listToolAuditEvents,
  listToolDefinitions,
  recordToolAuditEvent,
} from "./toolStore.mjs";
import { registerResearchProjectIpc } from "./researchProjectService.mjs";
import { makeTempUserData } from "./test/researchTestApp.mjs";

function mockIpcMain() {
  const handlers = new Map();
  return {
    handle(channel, fn) { handlers.set(channel, fn); },
    async invoke(channel, ...args) {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`No IPC handler: ${channel}`);
      return fn({}, ...args);
    },
  };
}

function seedPaper(app) {
  return upsertEntity(app, {
    id: "ent_paper_tmain", type: "paper", canonicalName: "Main Paper",
    normalizedName: "main paper",
    externalIds: [{ namespace: "doi", value: "10.1000/main" }],
    origin: "document",
  });
}

function crossrefItem(overrides = {}) {
  return {
    connectorId: "crossref",
    externalId: "10.1000/toolmain",
    externalUrl: "https://doi.org/10.1000/toolmain",
    itemType: "journal-article",
    title: "Tool Main Paper",
    authors: ["Ada Tester"],
    organizations: [],
    venue: "Journal of Tools",
    publicationDate: "2026",
    identifiers: [{ namespace: "doi", value: "10.1000/toolmain" }],
    tags: [],
    collections: [],
    references: [],
    relatedItems: [],
    rawMetadata: {},
    retrievedAt: "2026-01-01T00:00:00.000Z",
    sourceVersion: "crossref-v1",
    ...overrides,
  };
}

describe("toolStore (v10 audit ledger + main-process execution)", () => {
  let ctx;
  let app;

  beforeEach(async () => {
    ctx = await makeTempUserData();
    app = ctx.app;
    closeDb();
  });

  afterEach(async () => {
    closeDb();
    await ctx.cleanup();
  });

  it("migrates v10 audit table additively with existing data intact", () => {
    assert.ok(getSchemaVersion() >= 10, "schema version supports tool audit");
    seedPaper(app);
    const db = getDb(app);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    for (const t of ["tool_audit_events", "knowledge_entities", "connector_items", "documents", "papers"]) {
      assert.ok(tables.includes(t), `missing ${t}`);
    }
    assert.equal(getEntity(app, "ent_paper_tmain").canonicalName, "Main Paper");
    const ver = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
    assert.equal(ver.version, getSchemaVersion());
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM tool_audit_events WHERE tool_id = ? ORDER BY created_at DESC LIMIT 1").all("knowledge.search");
    assert.ok(plan.some((p) => /idx_taudit_tool/i.test(p.detail)), `unindexed: ${JSON.stringify(plan)}`);
  });

  it("lists/inspects the static registry (no implementation leak)", () => {
    const defs = listToolDefinitions();
    assert.equal(defs.length, 15);
    assert.ok(defs.every((d) => d.version === "1"));
    const view = inspectToolDefinition("knowledge.search");
    assert.equal(view.permission, "READ_ONLY");
    assert.ok(!("execute" in view) && !("handler" in view));
    assert.throws(() => inspectToolDefinition("shell.exec"), /Tools:/);
  });

  it("knowledge tools match direct store results", async () => {
    seedPaper(app);
    const s = await executeToolMain(app, "knowledge.search", { query: "Main Paper" }, { userInitiated: true });
    assert.equal(s.ok, true);
    assert.deepEqual(
      s.data.entities.map((e) => e.id).sort(),
      searchEntities(app, { query: "Main Paper" }).map((e) => e.id).sort()
    );
    const g = await executeToolMain(app, "knowledge.get_entity", { entityId: "ent_paper_tmain" }, {});
    assert.equal(g.ok, true);
    assert.equal(g.data.entity.id, "ent_paper_tmain");
    assert.match(g.data.entity.provenanceSummary, /document/);
    const missing = await executeToolMain(app, "knowledge.get_entity", { entityId: "ent_nope" }, {});
    assert.equal(missing.ok, false);
    assert.ok(!/sqlite|at .*\(/i.test(missing.error));
  });

  it("rejects unknown tools, bad input, and local-only tools on main", async () => {
    const unknown = await executeToolMain(app, "shell.exec", {}, {});
    assert.equal(unknown.ok, false);
    assert.equal(unknown.errorKind, "unknown_tool");
    const bad = await executeToolMain(app, "knowledge.get_entity", { entityId: 42 }, {});
    assert.equal(bad.ok, false);
    const local = await executeToolMain(app, "utility.calculate", { expression: "1+1" }, {});
    assert.equal(local.ok, false);
    const strict = await executeToolMain(app, "knowledge.search", { query: "x", evil: 1 }, {});
    assert.equal(strict.ok, false);
  });

  it("connector.import requires confirmation, then executes idempotently", async () => {
    const gated = await executeToolMain(app, "connector.import", { items: [crossrefItem()] }, { userInitiated: true });
    assert.equal(gated.ok, false);
    assert.equal(gated.decision, "CONFIRM");
    assert.equal(gated.errorKind, "confirmation_required");
    assert.ok(searchEntities(app, { query: "Tool Main" }).length === 0);
    const ctx = { userInitiated: true, userConfirmed: true, confirmedToolId: "connector.import" };
    const first = await executeToolMain(app, "connector.import", { items: [crossrefItem()] }, ctx);
    assert.equal(first.ok, true);
    assert.equal(first.data.result.counts.created, 1);
    const again = await executeToolMain(app, "connector.import", { items: [crossrefItem()] }, ctx);
    assert.equal(again.data.result.counts.unchanged, 1);
    // Confirmation for another tool does not transfer.
    const bypass = await executeToolMain(app, "connector.import", { items: [crossrefItem()] },
      { userInitiated: true, userConfirmed: true, confirmedToolId: "knowledge.search" });
    assert.equal(bypass.decision, "CONFIRM");
  });

  it("connector.list/get/preview work without network", async () => {
    const l = await executeToolMain(app, "connector.list", {}, {});
    assert.equal(l.ok, true);
    assert.deepEqual(l.data.connectors.map((c) => c.id).sort(), ["crossref", "zotero"]);
    const g = await executeToolMain(app, "connector.get", { connectorId: "crossref" }, {});
    assert.ok(g.data.connector.capabilities.includes("SEARCH"));
    const p = await executeToolMain(app, "connector.preview", { items: [crossrefItem()] }, {});
    assert.equal(p.ok, true);
    assert.equal(p.data.preview[0].valid, true);
    const bad = await executeToolMain(app, "connector.get", { connectorId: "arxiv" }, {});
    assert.equal(bad.ok, false);
  });

  it("project.get returns a bounded summary", async () => {
    const { saveProjectMeta } = await import("./researchDb.mjs");
    saveProjectMeta(app, {
      id: "proj_sum", title: "Summary Project", createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z", targetVenue: "generic", linkedThreadIds: [],
      draftTex: "x".repeat(1000), bibliography: "y".repeat(100),
      papers: [{ id: "p1", fileName: "a.pdf", addedAt: "2026-01-01T00:00:00.000Z", metadata: {}, extractedText: "t", pageCount: 1 }],
      chunks: [], revisionSuggestions: [], modelAttributions: [], abstractVariants: [],
      keywordSuggestions: [],
    });
    const r = await executeToolMain(app, "project.get", { projectId: "proj_sum" }, {});
    assert.equal(r.ok, true);
    assert.equal(r.data.project.paperCount, 1);
    assert.equal(r.data.project.draftChars, 1000);
    assert.ok(!("draftTex" in r.data.project));
    const missing = await executeToolMain(app, "project.get", { projectId: "proj_nope" }, {});
    assert.equal(missing.ok, false);
  });

  it("export.create returns validated bounded JSON", async () => {
    seedPaper(app);
    const r = await executeToolMain(app, "export.create", { projectId: undefined, maxEntities: 50 }, {});
    assert.equal(r.ok, true);
    assert.equal(r.data.export.format, "openbentt-knowledge-v1");
    assert.ok(r.data.export.counts.entities >= 1);
    assert.equal(JSON.parse(r.data.export.json).format, "openbentt-knowledge-v1");
  });

  it("audit ledger persists bounded redacted events", async () => {
    seedPaper(app);
    await executeToolMain(app, "knowledge.search", { query: "Main" }, { source: "test" });
    await executeToolMain(app, "connector.import", {
      items: [{ ...crossrefItem(), title: "t api_key=SECRET999 Bearer TOK999" }],
    }, { source: "test" });
    await executeToolMain(app, "shell.exec", {}, { source: "test" });
    const events = listToolAuditEvents(app, {});
    assert.equal(events.length, 3);
    assert.ok(events.every((e) => e.eventId && e.toolId && e.timestamp && e.decision));
    const blob = JSON.stringify(events);
    assert.ok(!blob.includes("SECRET999") && !blob.includes("TOK999"));
    assert.equal(listToolAuditEvents(app, { toolId: "knowledge.search" }).length, 1);
    assert.equal(listToolAuditEvents(app, { status: "denied" }).length, 1);
    // Direct record path bounds summaries.
    const id = recordToolAuditEvent(app, {
      eventId: "taudit_test1", toolId: "utility.calculate", toolVersion: "1",
      requestId: "r1", timestamp: new Date().toISOString(), source: "test",
      permission: "READ_ONLY", risk: "LOW", decision: "ALLOW", status: "ok",
      durationMs: 1, resourceSummary: { input: { expression: "1+1" } },
    });
    assert.equal(id, "taudit_test1");
    assert.throws(() => listToolAuditEvents(app, { status: "'; DROP TABLE tool_audit_events;--" }), /Tools:/);
    assert.equal(listToolAuditEvents(app, {}).length, 4);
  });

  it("project isolation holds at the store layer", async () => {
    upsertEntity(app, {
      id: "ent_iso_a", type: "concept", canonicalName: "Iso A", normalizedName: "iso a",
      origin: "user", projectId: "proj_iso_a",
    });
    upsertEntity(app, {
      id: "ent_iso_b", type: "concept", canonicalName: "Iso B", normalizedName: "iso b",
      origin: "user", projectId: "proj_iso_b",
    });
    const r = await executeToolMain(app, "knowledge.search", { query: "Iso", projectId: "proj_iso_a" }, {});
    assert.equal(r.ok, true);
    assert.deepEqual(r.data.entities.map((e) => e.id), ["ent_iso_a"]);
  });

  it("research:tools IPC validates ops and tool ids", async () => {
    const ipc = mockIpcMain();
    registerResearchProjectIpc(ipc, app);
    await assert.rejects(ipc.invoke("research:tools", "nope"), /Unknown tools operation/);
    await assert.rejects(ipc.invoke("research:tools", "get", {}), /Missing tool id/);
    await assert.rejects(ipc.invoke("research:tools", "execute", {}), /Missing tool id/);
    const list = await ipc.invoke("research:tools", "list");
    assert.equal(list.length, 15);
    const get = await ipc.invoke("research:tools", "get", { toolId: "utility.calculate" });
    assert.equal(get.permission, "READ_ONLY");
    await assert.rejects(ipc.invoke("research:tools", "get", { toolId: "shell.exec" }), /Tools:/);
    const exec = await ipc.invoke("research:tools", "execute", {
      toolId: "knowledge.search", input: { query: "x" }, context: { userInitiated: true },
    });
    assert.equal(exec.toolId, "knowledge.search");
    const audit = await ipc.invoke("research:tools", "audit", { limit: 5 });
    assert.ok(Array.isArray(audit) && audit.length >= 1);
    // Local-only tools never execute over IPC.
    const local = await ipc.invoke("research:tools", "execute", {
      toolId: "document.search", input: { query: "x" }, context: {},
    });
    assert.equal(local.ok, false);
  });
});
