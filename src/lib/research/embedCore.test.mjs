import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cosineNormalized, MAX_EMBED_CHARS } from "./embedCore.mjs";

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
});
