import { describe, expect, it } from "vitest";
import { buildCorpusChunks, buildTfidfIndex } from "@/lib/research/corpusIndex";
import { hybridRetrieve, reciprocalRankFusion, rerankHits } from "@/lib/research/hybridRetrieval";
import type { SimilarityHit } from "@/types/researchProject";

describe("hybridRetrieval", () => {
  const corpus = buildCorpusChunks(
    [
      {
        id: "p1",
        fileName: "a.pdf",
        extractedText:
          "Transformer models improve semantic retrieval for academic literature search systems.",
      },
      {
        id: "p2",
        fileName: "b.pdf",
        extractedText: "Cooking recipes and kitchen equipment for home chefs.",
      },
    ],
    "Our draft discusses semantic retrieval with transformer models."
  );
  const index = buildTfidfIndex(corpus);
  const names = { p1: "Paper A", p2: "Paper B" };

  it("retrieves relevant paper lexically", () => {
    const hits = hybridRetrieve(
      "semantic retrieval transformer models",
      corpus,
      names,
      index
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].paperId).toBe("p1");
    expect(hits[0].provenance.length).toBeGreaterThan(0);
  });

  it("fuses lexical and semantic rank lists via RRF", () => {
    const hit: SimilarityHit = {
      chunkId: "p1-0",
      paperId: "p1",
      paperName: "Paper A",
      snippet: "test",
      score: 0.5,
      method: "lexical",
    };
    const fused = reciprocalRankFusion([
      [{ chunkId: "p1-0", score: 0.5, hit }],
      [{ chunkId: "p1-0", score: 0.6, hit: { ...hit, method: "semantic" } }],
    ]);
    expect(fused.get("p1-0")?.fused).toBeGreaterThan(0);
  });

  it("reranks with provenance explaining signals", () => {
    const reranked = rerankHits(
      [
        {
          chunkId: "p1-0",
          paperId: "p1",
          paperName: "Paper A",
          snippet: "semantic retrieval transformer academic",
          score: 0.1,
          fusedScore: 0.1,
          lexicalScore: 0.2,
          confidence: "low",
          provenance: "",
          method: "lexical",
        },
      ],
      "semantic retrieval transformer"
    );
    expect(reranked[0].provenance.length).toBeGreaterThan(0);
  });
});

describe("semanticEngine", () => {
  it("extracts topics and gaps from corpus", async () => {
    const { extractTopics, detectResearchGaps, extractClaims } = await import(
      "@/lib/research/semanticEngine"
    );
    const papers = [
      {
        id: "1",
        fileName: "a.pdf",
        addedAt: "2020",
        extractedText:
          "We demonstrate that neural retrieval improves citation parsing. Our experiments show significant gains.",
        metadata: { title: "Paper A", year: "2020" },
      },
      {
        id: "2",
        fileName: "b.pdf",
        addedAt: "2021",
        extractedText:
          "We demonstrate that neural retrieval scales to large corpora. Results indicate improved recall.",
        metadata: { title: "Paper B", year: "2021" },
      },
    ];
    const topics = extractTopics(papers);
    expect(topics.length).toBeGreaterThan(0);
    const claims = extractClaims(papers);
    expect(claims.some((c) => c.sentence.includes("demonstrate"))).toBe(true);
    const gaps = detectResearchGaps(papers, "\\section{Intro} unrelated topic only", topics);
    expect(gaps.length).toBeGreaterThan(0);
  });
});

describe("researchMemory", () => {
  it("builds entity graph from project state", async () => {
    const { rebuildResearchMemory, memoryGraphSummary } = await import(
      "@/lib/research/researchMemory"
    );
    const memory = rebuildResearchMemory({
      papers: [
        {
          id: "p1",
          fileName: "a.pdf",
          addedAt: "2020",
          extractedText: "machine learning retrieval systems",
          metadata: { title: "ML Paper", authors: "Smith, J", year: "2020" },
        },
      ],
      bibliography: '@article{smith2020, title={ML}, author={Smith}, year={2020}}',
      bibEntries: [],
      draftTex: "\\section{Introduction}\\cite{smith2020}",
    });
    const summary = memoryGraphSummary(memory);
    expect(summary.paperCount).toBe(1);
    expect(summary.edgeCount).toBeGreaterThan(0);
    expect(memory.thesis.sections.some((s) => s.name === "Introduction")).toBe(true);
  });
});
