import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { closeDb } from "./researchDb.mjs";
import { saveProjectMeta } from "./researchDb.mjs";
import {
  deleteEmbeddingsForProject,
  embeddingStats,
  loadEmbeddings,
  upsertEmbeddings,
  EMBED_DIM,
} from "./researchVectorStore.mjs";
import { makeTempUserData } from "./test/researchTestApp.mjs";

function sampleProject(id) {
  return {
    id,
    title: "Vectors",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    targetVenue: "generic",
    linkedThreadIds: [],
    draftTex: "",
    bibliography: "",
    papers: [],
    chunks: [],
    revisionSuggestions: [],
    modelAttributions: [],
    abstractVariants: [],
    keywordSuggestions: [],
  };
}

describe("researchVectorStore", () => {
  let ctx;

  beforeEach(async () => {
    ctx = await makeTempUserData();
    closeDb();
  });

  afterEach(async () => {
    closeDb();
    await ctx.cleanup();
  });

  it("round-trips float32 embeddings separate from project metadata", () => {
    const { app } = ctx;
    const id = "vec-proj";
    saveProjectMeta(app, sampleProject(id));

    const vec = Array.from({ length: EMBED_DIM }, (_, i) => (i % 7) * 0.01);
    upsertEmbeddings(app, id, [{ chunkId: "c1", vector: vec }]);

    const loaded = loadEmbeddings(app, id);
    assert.equal(loaded.c1.length, EMBED_DIM);
    assert.ok(Math.abs(loaded.c1[3] - vec[3]) < 1e-6);

    const stats = embeddingStats(app, id);
    assert.equal(stats.count, 1);
    assert.equal(stats.dim, EMBED_DIM);

    deleteEmbeddingsForProject(app, id);
    assert.equal(embeddingStats(app, id).count, 0);
  });
});
