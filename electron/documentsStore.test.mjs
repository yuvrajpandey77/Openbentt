import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { getDb } from "./researchDb.mjs";
import { upsertDocument, getDocument, listDocuments, findDocumentByChecksum, putExtractionCache, getExtractionCache } from "./documentsStore.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-docs-"));
const app = { getPath: () => tmp };

describe("documentsStore (v7 additive)", () => {
  before(() => {
    getDb(app); // runs migrations incl. v7
  });
  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("migrates v7 tables without touching papers/chunks", () => {
    const db = getDb(app);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    for (const t of ["documents", "document_versions", "document_extract_cache", "papers", "corpus_chunks", "embeddings"]) {
      assert.ok(tables.includes(t), `missing ${t}`);
    }
  });

  it("upsert/get/list/find/delete round-trip", () => {
    const now = new Date().toISOString();
    upsertDocument(app, {
      id: "doc_abc", projectId: "p1", title: "T", source: "a.md", sourceType: "markdown",
      mimeType: "text/markdown", size: 10, checksum: "cafef00d".repeat(8), extractorVersion: "doc-extract-v1",
      metadata: { title: { value: "T", origin: "filename" } }, extractionStatus: "extracted", status: "ready",
      version: 1, createdAt: now, updatedAt: now,
    });
    assert.equal(getDocument(app, "doc_abc").title, "T");
    assert.equal(listDocuments(app, "p1").length, 1);
    assert.equal(findDocumentByChecksum(app, "cafef00d".repeat(8)).id, "doc_abc");
  });

  it("extraction cache round-trip", () => {
    putExtractionCache(app, { cacheKey: "k1", documentId: "doc_abc", extractor: "markdown", extractorVersion: "doc-extract-v1", status: "extracted", content: { pages: [] } });
    assert.equal(getExtractionCache(app, "k1").status, "extracted");
  });
});
