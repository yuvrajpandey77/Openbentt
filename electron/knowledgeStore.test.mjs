import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { getDb, getSchemaVersion } from "./researchDb.mjs";
import {
  addEvidence,
  getEntity,
  getEvidenceFor,
  listEvidenceForDocument,
  listRelationships,
  markEvidenceStaleForDocument,
  mergeEntities,
  resolveEntity,
  searchEntities,
  traverse,
  upsertEntity,
  upsertRelationship,
} from "./knowledgeStore.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-know-"));
const app = { getPath: () => tmp };

const ref = (doc = "doc_1") => ({
  documentId: doc, documentVersionId: `${doc}@v1`, page: 3,
  section: "s1", block: "b1", chunkId: `${doc}:b1:0`, sourceType: "pdf", title: "T",
});

describe("knowledgeStore (v8 additive, durable)", () => {
  before(() => {
    assert.ok(getSchemaVersion() >= 8, "schema version supports knowledge tables");
    getDb(app);
  });
  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("migrates v8 tables without touching documents/RAG tables", () => {
    const db = getDb(app);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    for (const t of ["knowledge_entities", "knowledge_entity_aliases", "knowledge_entity_identifiers",
      "knowledge_entity_tags", "knowledge_relationships", "knowledge_evidence", "knowledge_entity_merges",
      "documents", "papers", "corpus_chunks", "embeddings"]) {
      assert.ok(tables.includes(t), `missing ${t}`);
    }
  });

  it("entity CRUD + alias/identifier/tag search", () => {
    upsertEntity(app, {
      id: "ent_org_1", type: "organization", canonicalName: "OpenAI", normalizedName: "openai",
      aliases: ["Open AI"], externalIds: [{ namespace: "url", value: "https://openai.com" }],
      tags: ["lab"], origin: "document",
    });
    assert.equal(getEntity(app, "ent_org_1").canonicalName, "OpenAI");
    assert.equal(searchEntities(app, { query: "open ai" }).length, 1);
    assert.equal(searchEntities(app, { identifier: "url:https://openai.com" }).length, 1);
    assert.equal(searchEntities(app, { tag: "lab" }).length, 1);
    assert.equal(searchEntities(app, { type: "paper" }).length, 0);
    // Distinct names never auto-merge.
    upsertEntity(app, { id: "ent_org_2", type: "organization", canonicalName: "Apple Records", normalizedName: "apple records" });
    assert.equal(searchEntities(app, { query: "apple" }).length, 1);
  });

  it("relationships are directional with evidence chain", () => {
    upsertEntity(app, { id: "ent_person_1", type: "person", canonicalName: "Ada Lovelace", normalizedName: "ada lovelace" });
    upsertEntity(app, { id: "ent_paper_1", type: "paper", canonicalName: "Notes", normalizedName: "notes" });
    upsertRelationship(app, { id: "rel_1", type: "AUTHORED_BY", subjectEntityId: "ent_person_1", objectEntityId: "ent_paper_1" });
    addEvidence(app, { id: "ev_1", subjectType: "relationship", subjectId: "rel_1", sourceRef: ref(), quote: "by Ada", evidenceDocVersion: 1 });
    const rels = listRelationships(app, "ent_paper_1");
    assert.equal(rels.length, 1);
    assert.equal(rels[0].subjectEntityId, "ent_person_1");
    assert.equal(getEvidenceFor(app, "relationship", "rel_1")[0].sourceRef.page, 3);
    assert.equal(listEvidenceForDocument(app, "doc_1").length, 1);
    // Direction filter.
    assert.equal(listRelationships(app, "ent_paper_1", { direction: "out" }).length, 0);
    assert.equal(listRelationships(app, "ent_person_1", { direction: "out" }).length, 1);
  });

  it("merge preserves history, redirects, carries aliases", () => {
    upsertEntity(app, { id: "ent_org_a", type: "organization", canonicalName: "Open AI", normalizedName: "open ai" });
    addEvidence(app, { id: "ev_2", subjectType: "entity", subjectId: "ent_org_a", sourceRef: ref("doc_2") });
    const m = mergeEntities(app, "ent_org_a", "ent_org_1", "duplicate", "user");
    assert.equal(m.from.status, "merged");
    assert.equal(m.from.mergedInto, "ent_org_1");
    assert.equal(resolveEntity(app, "ent_org_a").id, "ent_org_1");
    assert.equal(getEvidenceFor(app, "entity", "ent_org_a").length, 1);
  });

  it("stale detection across document versions", () => {
    const r = markEvidenceStaleForDocument(app, "doc_1", 1);
    assert.equal(r.marked, 0);
    const r2 = markEvidenceStaleForDocument(app, "doc_1", 2);
    assert.equal(r2.marked, 1);
    assert.equal(getEvidenceFor(app, "relationship", "rel_1")[0].status, "stale");
  });

  it("traversal is bounded and cycle-safe", () => {
    upsertEntity(app, { id: "n_a", type: "concept", canonicalName: "A", normalizedName: "a" });
    upsertEntity(app, { id: "n_b", type: "concept", canonicalName: "B", normalizedName: "b" });
    upsertEntity(app, { id: "n_c", type: "concept", canonicalName: "C", normalizedName: "c" });
    upsertRelationship(app, { id: "e_ab", type: "USES", subjectEntityId: "n_a", objectEntityId: "n_b" });
    upsertRelationship(app, { id: "e_bc", type: "USES", subjectEntityId: "n_b", objectEntityId: "n_c" });
    upsertRelationship(app, { id: "e_ca", type: "USES", subjectEntityId: "n_c", objectEntityId: "n_a" });
    const t = traverse(app, "n_a", { depth: 3 });
    assert.deepEqual([...t.nodes].sort(), ["n_a", "n_b", "n_c"]);
    assert.throws(() => traverse(app, "n_a", { depth: 99 }), /depth/);
  });

  it("rejects hostile input safely", () => {
    assert.throws(() => upsertEntity(app, { id: "x'; DROP TABLE knowledge_entities;--", type: "paper", canonicalName: "a", normalizedName: "a" }), /invalid/);
    assert.throws(() => upsertEntity(app, { id: "x", type: "__proto__", canonicalName: "a", normalizedName: "a" }), /unknown/);
    assert.throws(() => upsertRelationship(app, { id: "r", type: "CITES", subjectEntityId: "n_a", objectEntityId: "n_a" }), /differ/);
    assert.throws(() => addEvidence(app, { id: "e", subjectType: "relationship", subjectId: "rel_1", sourceRef: { documentId: "x" }, quote: "y".repeat(601) }), /exceeds/);
    // Tables survive injection attempts.
    const tables = getDb(app).prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_entities'").all();
    assert.equal(tables.length, 1);
  });
});
