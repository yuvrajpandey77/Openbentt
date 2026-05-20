import { describe, expect, it } from "vitest";
import {
  parseAbstractVariants,
  parseCaptionSuggestions,
  parseKeywordSuggestions,
} from "@/lib/research/parseWritingAssist";

describe("parseWritingAssist", () => {
  it("parses numbered abstracts", () => {
    const raw = `Abstract 1: First variant about neural citations in PDFs.

Abstract 2: Second variant emphasizing local privacy for researchers.

Abstract 3: Third variant for IEEE venue tone with emphasis on reproducible local experiments.`;
    const v = parseAbstractVariants(raw);
    expect(v.length).toBe(3);
    expect(v[0]).toContain("neural citations");
  });

  it("parses caption for label line", () => {
    const raw = `Caption for fig:methods: A scatter plot showing latency versus corpus size for local embedding indexes.`;
    const c = parseCaptionSuggestions(raw, ["fig:methods"]);
    expect(c.length).toBe(1);
    expect(c[0].label).toBe("fig:methods");
    expect(c[0].caption).toContain("scatter plot");
  });

  it("parses keyword line", () => {
    const raw = `Research keywords: machine learning, BibTeX, LaTeX, privacy, PDF parsing`;
    const k = parseKeywordSuggestions(raw);
    expect(k).toContain("machine learning");
    expect(k.length).toBeGreaterThan(3);
  });
});
