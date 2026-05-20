import { describe, expect, it } from "vitest";
import { buildCorpusChunks, chunkText } from "@/lib/research/corpusIndex";
import { assessProjectPressure, LIMITS } from "@/lib/research/projectLimits";
import type { ResearchProjectData } from "@/types/researchProject";

function syntheticProject(paperCount: number, draftChars: number): ResearchProjectData {
  const papers = Array.from({ length: paperCount }, (_, i) => ({
    id: `p${i}`,
    fileName: `paper-${i}.pdf`,
    addedAt: new Date().toISOString(),
    extractedText: "machine learning citation graph ".repeat(200),
    metadata: { title: `Paper ${i}` },
  }));
  return {
    id: "stress",
    title: "Stress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetVenue: "generic",
    linkedThreadIds: [],
    draftTex: "x".repeat(draftChars),
    bibliography: "",
    bibEntries: [],
    papers,
    chunks: [],
    revisionSuggestions: [],
    modelAttributions: [],
    abstractVariants: [],
    keywordSuggestions: [],
    captionSuggestions: [],
  };
}

describe("large project guardrails", () => {
  it("warns when paper count exceeds soft limit", () => {
    const p = syntheticProject(LIMITS.softWarnPapers + 5, 1000);
    const hydrated = { ...p, chunks: buildCorpusChunks(p.papers, p.draftTex) };
    const pressure = assessProjectPressure(hydrated);
    expect(pressure.level).not.toBe("ok");
    expect(pressure.messages.some((m) => /papers/i.test(m))).toBe(true);
  });

  it("flags critical when at hard paper cap", () => {
    const p = syntheticProject(LIMITS.maxPapers, 1000);
    const pressure = assessProjectPressure({ ...p, chunks: [] });
    expect(pressure.level).toBe("critical");
  });
});

describe("corpus indexing throughput", () => {
  it("chunks 100 synthetic papers under 2s", () => {
    const p = syntheticProject(100, 50_000);
    const t0 = performance.now();
    const chunks = buildCorpusChunks(p.papers, p.draftTex);
    const elapsed = performance.now() - t0;
    expect(chunks.length).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(2000);
  });

  it("chunkText handles 200k character draft quickly", () => {
    const text = "word ".repeat(40_000);
    const t0 = performance.now();
    const parts = chunkText(text);
    expect(parts.length).toBeGreaterThan(50);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
