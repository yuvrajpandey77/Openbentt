import { describe, expect, it } from "vitest";
import { applyTemplatePack } from "@/lib/research/applyTemplate";
import type { ResearchProjectData } from "@/types/researchProject";

const base: ResearchProjectData = {
  id: "p1",
  title: "T",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  targetVenue: "generic",
  linkedThreadIds: [],
  draftTex: "old",
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

describe("applyTemplatePack", () => {
  it("replaces draft and adds project files from pack", () => {
    const next = applyTemplatePack(base, {
      draftTex: "\\documentclass{article}\\begin{document}Hi\\end{document}",
      projectFiles: [{ path: "chapters/intro.tex", kind: "tex", content: "\\section{A}" }],
    });
    expect(next.draftTex).toContain("documentclass");
    expect(next.projectFiles).toHaveLength(1);
    expect(next.projectFiles![0].path).toBe("chapters/intro.tex");
  });
});
