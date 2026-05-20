import { describe, expect, it } from "vitest";
import {
  findSemanticSimilarPassages,
  isEmbeddingIndexReady,
} from "@/lib/research/embeddingIndex";
import type { CorpusChunk } from "@/types/researchProject";
import { cosineSimilarity, unitVector } from "../../../test/helpers/vectors";

const DIM = 384;

describe("embeddingIndex (vector math, no model)", () => {
  const chunks: CorpusChunk[] = [
    { id: "a-0", paperId: "paper-a", text: "alpha topic" },
    { id: "b-0", paperId: "paper-b", text: "beta topic" },
  ];

  it("finds semantic hits using precomputed normalized vectors", () => {
    const query = unitVector(DIM, 0);
    const vectors: Record<string, number[]> = {
      __query__: query,
      "a-0": unitVector(DIM, 0),
      "b-0": unitVector(DIM, 1),
    };
    const hits = findSemanticSimilarPassages("query", chunks, vectors, {
      "paper-a": "Paper A",
      "paper-b": "Paper B",
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].paperId).toBe("paper-a");
    expect(hits[0].method).toBe("semantic");
    expect(cosineSimilarity(query, vectors["a-0"])).toBeGreaterThan(
      cosineSimilarity(query, vectors["b-0"])
    );
  });

  it("returns no hits without __query__ vector", () => {
    expect(findSemanticSimilarPassages("q", chunks, { "a-0": unitVector(DIM, 0) }, {})).toEqual([]);
  });

  it("reports index readiness excluding query slot", () => {
    expect(isEmbeddingIndexReady(undefined)).toBe(false);
    expect(isEmbeddingIndexReady({ __query__: unitVector(DIM, 0) })).toBe(false);
    expect(isEmbeddingIndexReady({ "a-0": unitVector(DIM, 0) })).toBe(true);
  });
});
