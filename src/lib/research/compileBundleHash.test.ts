import { describe, expect, it } from "vitest";
import { buildCompileBundle } from "@/lib/research/compileBundle";
import { hashCompileBundle } from "@/lib/research/compileBundleHash";
import type { ResearchProjectData } from "@/types/researchProject";

const base: ResearchProjectData = {
  id: "p1",
  title: "T",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  targetVenue: "generic",
  linkedThreadIds: [],
  draftTex: "\\documentclass{article}\\begin{document}A\\end{document}",
  bibliography: "",
  bibEntries: [],
  papers: [],
  chunks: [],
  revisionSuggestions: [],
  modelAttributions: [],
  abstractVariants: [],
  keywordSuggestions: [],
  captionSuggestions: [],
};

describe("hashCompileBundle", () => {
  it("is stable for identical bundles", async () => {
    const b = buildCompileBundle(base);
    const h1 = await hashCompileBundle(b);
    const h2 = await hashCompileBundle(b);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("changes when main tex changes", async () => {
    const b1 = buildCompileBundle(base);
    const b2 = buildCompileBundle({ ...base, draftTex: "\\documentclass{article}\\begin{document}B\\end{document}" });
    expect(await hashCompileBundle(b1)).not.toBe(await hashCompileBundle(b2));
  });
});
