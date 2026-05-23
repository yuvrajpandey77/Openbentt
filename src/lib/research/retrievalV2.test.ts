import { describe, expect, it } from "vitest";
import { buildCorpusChunks, buildTfidfIndex } from "@/lib/research/corpusIndex";
import { dedupeRetrievalHits, RETRIEVAL_V2_DEFAULTS } from "@/lib/research/retrievalV2";

describe("retrievalV2", () => {
  it("exposes tuned default fusion options", () => {
    expect(RETRIEVAL_V2_DEFAULTS.limit).toBeGreaterThan(10);
    expect(RETRIEVAL_V2_DEFAULTS.rrfK).toBe(48);
  });

  it("dedupes hits by paper and snippet prefix", () => {
    const corpus = buildCorpusChunks(
      [{ id: "p1", fileName: "a.pdf", extractedText: "semantic retrieval test passage one two three" }],
      "draft"
    );
    const index = buildTfidfIndex(corpus);
    expect(index).toBeTruthy();
    const duped = dedupeRetrievalHits(
      [
        { chunkId: "a", paperId: "p1", paperName: "A", snippet: "semantic retrieval test", score: 1 },
        { chunkId: "b", paperId: "p1", paperName: "A", snippet: "semantic retrieval test", score: 0.9 },
      ],
      5
    );
    expect(duped).toHaveLength(1);
  });
});
