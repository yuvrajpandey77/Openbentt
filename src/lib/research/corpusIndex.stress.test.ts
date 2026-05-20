import { describe, expect, it } from "vitest";
import {
  buildCorpusChunks,
  buildTfidfIndex,
  findSimilarPassages,
  scanDraftSimilarity,
} from "@/lib/research/corpusIndex";

describe("corpusIndex stress", () => {
  it("handles 200-paper corpus and draft scan under 5s", () => {
    const papers = Array.from({ length: 200 }, (_, i) => ({
      id: `p${i}`,
      fileName: `paper-${i}.pdf`,
      extractedText: `Paper ${i} discusses neural citation parsing methodology ${i % 17}. `.repeat(40),
    }));
    const draftTex = "\\section{Methods}\nWe extend neural citation parsing for large libraries.\n";

    const t0 = performance.now();
    const chunks = buildCorpusChunks(papers, draftTex);
    const elapsedBuild = performance.now() - t0;

    expect(chunks.length).toBeGreaterThan(500);
    expect(elapsedBuild).toBeLessThan(5000);

    const names = Object.fromEntries(papers.map((p) => [p.id, p.fileName]));
    const t1 = performance.now();
    const index = buildTfidfIndex(chunks);
    const hits = findSimilarPassages(
      "neural citation parsing methodology",
      chunks,
      names,
      index,
      { minScore: 0.05, limit: 10 }
    );
    const scanHits = scanDraftSimilarity(draftTex, chunks, names);
    const elapsedQuery = performance.now() - t1;

    expect(hits.length).toBeGreaterThan(0);
    expect(scanHits.length).toBeGreaterThan(0);
    expect(elapsedQuery).toBeLessThan(5000);
  });
});
