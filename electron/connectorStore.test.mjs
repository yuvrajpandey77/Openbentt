import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, getSchemaVersion } from "./researchDb.mjs";
import { getEntity, searchEntities, getEvidenceFor, upsertEntity } from "./knowledgeStore.mjs";
import {
  dryRunConnectorImport,
  entityIdForConnectorItem,
  getConnectorItemHash,
  getConnectorSyncStatus,
  importConnectorItems,
  linkConnectorItem,
  listConnectorSources,
  listConnectorSyncRuns,
  previewConnectorItems,
  recordConnectorSyncRun,
  resetConnector,
  setConnectorItemHash,
  upsertConnectorSource,
} from "./connectorStore.mjs";
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

function crossrefItem(overrides = {}) {
  return {
    connectorId: "crossref",
    externalId: "10.1038/nature12373",
    externalUrl: "https://doi.org/10.1038/nature12373",
    itemType: "journal-article",
    title: "Nanometre-scale thermometry in a living cell",
    authors: ["G. Kucsko", "P. C. Maurer"],
    organizations: [],
    venue: "Nature",
    publicationDate: "2013",
    identifiers: [
      { namespace: "doi", value: "10.1038/nature12373" },
      { namespace: "crossref", value: "10.1038/nature12373" },
    ],
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

function zoteroItem(overrides = {}) {
  return {
    connectorId: "zotero",
    externalId: "ABCD1234",
    externalUrl: "https://example.com/paper",
    itemType: "paper",
    title: "Attention Is All You Need",
    authors: ["Ashish Vaswani", "Noam Shazeer"],
    organizations: [],
    venue: "NeurIPS",
    publicationDate: "2017",
    identifiers: [
      { namespace: "zotero", value: "ABCD1234" },
      { namespace: "doi", value: "10.48550/arxiv.1706.03762" },
    ],
    tags: ["transformers"],
    collections: ["COLL01"],
    references: [],
    relatedItems: [],
    rawMetadata: {},
    retrievedAt: "2026-01-01T00:00:00.000Z",
    sourceVersion: "zotero-v1",
    ...overrides,
  };
}

describe("connectorStore (v9 additive, durable)", () => {
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

  it("migrates v9 tables additively with existing data intact", () => {
    assert.ok(getSchemaVersion() >= 9, "schema version supports connector tables");
    upsertEntity(app, {
      id: "ent_paper_legacy", type: "paper", canonicalName: "Legacy", normalizedName: "legacy",
      origin: "user",
    });
    const db = getDb(app);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    for (const t of ["connector_sources", "connector_items", "connector_sync_runs", "connector_item_links",
      "knowledge_entities", "documents", "papers", "corpus_chunks"]) {
      assert.ok(tables.includes(t), `missing ${t}`);
    }
    assert.equal(getEntity(app, "ent_paper_legacy").canonicalName, "Legacy");
    const ver = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
    assert.equal(ver.version, getSchemaVersion());
  });

  it("sources, hashes, links, sync runs, reset", () => {
    upsertConnectorSource(app, "crossref", "Crossref");
    assert.equal(listConnectorSources(app).length, 1);
    assert.equal(getConnectorItemHash(app, "crossref", "10.1/x"), undefined);
    setConnectorItemHash(app, "crossref", "10.1/x", "abc123");
    assert.equal(getConnectorItemHash(app, "crossref", "10.1/x"), "abc123");
    assert.equal(entityIdForConnectorItem(app, "crossref", "10.1/x"), undefined);
    resetConnector(app, "crossref");
    assert.equal(listConnectorSources(app).length, 0);
    assert.equal(getConnectorItemHash(app, "crossref", "10.1/x"), undefined);

    const s0 = getConnectorSyncStatus(app, "zotero");
    assert.equal(s0.status, "never_synced");
    recordConnectorSyncRun(app, { connectorId: "zotero", status: "synced", counts: { seen: 2, created: 2 } });
    const s1 = getConnectorSyncStatus(app, "zotero");
    assert.equal(s1.status, "synced");
    assert.equal(s1.itemsCreated, 2);
    assert.equal(listConnectorSyncRuns(app, "zotero").length, 1);
    assert.throws(() => getConnectorSyncStatus(app, "arxiv"), /Connectors:/);
  });

  it("imports crossref + zotero items into knowledge with evidence", () => {
    const res = importConnectorItems(app, [crossrefItem(), zoteroItem()]);
    assert.equal(res.failed.length, 0);
    assert.equal(res.created.length, 2);
    const papers = searchEntities(app, { type: "paper" });
    assert.ok(papers.length >= 2);
    const paper = getEntity(app, res.created[0]);
    assert.ok(paper.externalIds.some((e) => e.namespace === "doi"));
    const ev = getEvidenceFor(app, "entity", res.created[0]);
    assert.ok(ev.length > 0);
    const src = ev[0].sourceRef;
    assert.ok(src.connector && src.connector.connectorId === "crossref");
    assert.ok(src.connector.externalId);
    // Repeat import → unchanged, no duplicates.
    const again = importConnectorItems(app, [crossrefItem(), zoteroItem()]);
    assert.equal(again.unchanged.length, 2);
    assert.equal(searchEntities(app, { type: "paper" }).length, papers.length);
  });

  it("dry run mutates nothing; preview validates", () => {
    const dry = dryRunConnectorImport(app, [crossrefItem()]);
    assert.equal(dry.wouldCreate.length, 1);
    assert.equal(searchEntities(app, { type: "paper" }).length, 0);
    const prev = previewConnectorItems([crossrefItem(), { connectorId: "nope", externalId: "x" }]);
    assert.equal(prev[0].valid, true);
    assert.equal(prev[0].title, "Nanometre-scale thermometry in a living cell");
    assert.equal(prev[1].valid, false);
  });

  it("preserves user-authored fields and records conflicts", async () => {
    const { paperIdForDoi } = await import("../src/lib/knowledge/knowledgeCore.mjs");
    const paperId = paperIdForDoi("10.1038/nature12373");
    // User-authored entity seeded first (origin user → provenance user-authored).
    upsertEntity(app, {
      id: paperId, type: "paper", canonicalName: "My Title", normalizedName: "my title",
      origin: "user",
    });
    assert.equal(getEntity(app, paperId).provenance, "user-authored");
    const res = importConnectorItems(app, [crossrefItem({ title: "Provider Renamed Title", retrievedAt: "2026-06-01T00:00:00.000Z" })]);
    assert.equal(getEntity(app, paperId).canonicalName, "My Title");
    assert.ok(res.conflicts.length > 0);
    assert.equal(res.items[0].status, "conflict");
    // External identifiers/tags still merged additively.
    assert.ok(getEntity(app, paperId).externalIds.some((e) => e.namespace === "doi"));
  });

  it("isolates item failures and never auto-deletes missing items", () => {
    const bad = { connectorId: "crossref", externalId: "" };
    const res = importConnectorItems(app, [crossrefItem(), bad, zoteroItem()]);
    assert.equal(res.created.length, 2);
    assert.equal(res.failed.length, 1);
    // Second sync without the zotero item: entity must still exist (no deletion).
    const zoteroId = res.created.find((id) => id !== res.created[0]);
    importConnectorItems(app, [crossrefItem()]);
    assert.ok(getEntity(app, zoteroId));
  });

  it("research:connectors IPC validates ops and connector ids", async () => {
    const ipc = mockIpcMain();
    registerResearchProjectIpc(ipc, app);
    await assert.rejects(ipc.invoke("research:connectors", "nope"), /Unknown connectors operation/);
    await assert.rejects(ipc.invoke("research:connectors", "capabilities", { connectorId: "arxiv" }), /Unknown connector/);
    await assert.rejects(ipc.invoke("research:connectors", "sync", {}), /Missing connector id/);
    const caps = await ipc.invoke("research:connectors", "capabilities", { connectorId: "crossref" });
    assert.ok(caps.includes("SEARCH"));
    const dry = await ipc.invoke("research:connectors", "dryRun", { items: [crossrefItem()] });
    assert.equal(dry.wouldCreate.length, 1);
    const imp = await ipc.invoke("research:connectors", "import", { items: [crossrefItem()] });
    assert.equal(imp.created.length, 1);
    const status = await ipc.invoke("research:connectors", "syncStatus", { connectorId: "crossref" });
    assert.equal(status.status, "synced");
    const reset = await ipc.invoke("research:connectors", "reset", { connectorId: "crossref" });
    assert.equal(reset.ok, true);
  });
});
