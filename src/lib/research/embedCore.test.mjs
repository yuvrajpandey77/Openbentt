import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cosineNormalized,
  MAX_EMBED_CHARS,
  MAX_CHUNKS_INDEX_DESKTOP,
  MAX_CHUNKS_INDEX_WEB,
  selectChunksForEmbedding,
} from "./embedCore.mjs";

describe("embedCore", () => {
  it("cosineNormalized returns dot product for equal-length unit vectors", () => {
    const a = [1, 0, 0];
    const b = [0.6, 0.8, 0];
    const expected = 0.6;
    assert.ok(Math.abs(cosineNormalized(a, b) - expected) < 1e-6);
  });

  it("cosineNormalized returns 0 for mismatched or empty vectors", () => {
    assert.equal(cosineNormalized([], [1]), 0);
    assert.equal(cosineNormalized([1], [1, 2]), 0);
  });

  it("MAX_EMBED_CHARS is a sensible bound", () => {
    assert.equal(MAX_EMBED_CHARS, 512);
  });

  it("desktop embed cap covers thousand-page libraries", () => {
    assert.ok(MAX_CHUNKS_INDEX_DESKTOP >= 10_000);
    assert.ok(MAX_CHUNKS_INDEX_WEB >= 1_000);
  });

  it("selectChunksForEmbedding round-robins across papers", () => {
    const chunks = [];
    for (let p = 0; p < 3; p++) {
      for (let i = 0; i < 10; i++) {
        chunks.push({ id: `p${p}-${i}`, paperId: `p${p}`, text: `t${i}` });
      }
    }
    const picked = selectChunksForEmbedding(chunks, 6);
    assert.equal(picked.length, 6);
    const papers = new Set(picked.map((c) => c.paperId));
    assert.equal(papers.size, 3);
  });
});
