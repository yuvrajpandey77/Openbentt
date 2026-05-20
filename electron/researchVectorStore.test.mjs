import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { closeDb } from "./researchDb.mjs";
import { saveProjectMeta } from "./researchDb.mjs";
import {
  deleteEmbeddingsForChunks,
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

  it("deleteEmbeddingsForChunks ignores missing and empty chunk ids", () => {
    const { app } = ctx;
    const id = "vec-prune";
    saveProjectMeta(app, sampleProject(id));

    const vec = Array.from({ length: EMBED_DIM }, (_, i) => i * 0.001);
    upsertEmbeddings(app, id, [
      { chunkId: "keep-me", vector: vec },
      { chunkId: "drop-me", vector: vec },
    ]);
    assert.equal(embeddingStats(app, id).count, 2);

    deleteEmbeddingsForChunks(app, id, ["drop-me", "never-existed", "", null]);
    const loaded = loadEmbeddings(app, id);
    assert.ok(loaded["keep-me"]?.length);
    assert.equal(loaded["drop-me"], undefined);
    assert.equal(embeddingStats(app, id).count, 1);
  });

  it("deleteEmbeddingsForChunks no-ops on empty input", () => {
    const { app } = ctx;
    const id = "vec-noop";
    saveProjectMeta(app, sampleProject(id));
    upsertEmbeddings(app, id, [{ chunkId: "c1", vector: new Array(EMBED_DIM).fill(0.1) }]);

    deleteEmbeddingsForChunks(app, id, []);
    deleteEmbeddingsForChunks(app, id, null);
    assert.equal(embeddingStats(app, id).count, 1);
  });
});
