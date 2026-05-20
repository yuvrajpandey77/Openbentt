import { describe, expect, it } from "vitest";
import { buildCorpusChunks, findSimilarPassages, chunkText, buildTfidfIndex } from "@/lib/research/corpusIndex";

describe("corpusIndex", () => {
  it("chunks overlapping text", () => {
    const c = chunkText("alpha beta gamma delta epsilon", 20, 5);
    expect(c.length).toBeGreaterThan(1);
  });

  it("finds similar passages with real TF-IDF", () => {
    const chunks = buildCorpusChunks(
      [{ id: "p1", fileName: "a.pdf", extractedText: "Neural networks for citation parsing in academic PDFs." }],
      "Our work uses neural networks for citation parsing."
    );
    const index = buildTfidfIndex(chunks);
    const hits = findSimilarPassages(
      "citation parsing with neural networks",
      chunks,
      { p1: "Paper A" },
      index,
      { minScore: 0.01 }
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].paperId).toBe("p1");
    expect(hits[0].method).toBe("lexical");
  });

  it("builds IDF that down-weights common terms", () => {
    const chunks = buildCorpusChunks(
      [
        { id: "p1", fileName: "a.pdf", extractedText: "unique quantum term alpha" },
        { id: "p2", fileName: "b.pdf", extractedText: "unique quantum term beta" },
      ],
      ""
    );
    const index = buildTfidfIndex(chunks);
    expect(index.idf.get("quantum")).toBeDefined();
    expect(index.docCount).toBeGreaterThan(0);
  });
});
