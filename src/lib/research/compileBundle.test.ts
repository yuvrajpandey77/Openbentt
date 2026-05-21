import { describe, expect, it } from "vitest";
import { buildCompileBundle, resolveAssetPathForGraphics } from "@/lib/research/compileBundle";
import type { ResearchProjectData } from "@/types/researchProject";

const baseProject: ResearchProjectData = {
  id: "p1",
  title: "Test",
  createdAt: "",
  updatedAt: "",
  targetVenue: "generic",
  linkedThreadIds: [],
  draftTex: "\\documentclass{article}\\begin{document}Hi\\end{document}",
  bibliography: "@article{a, title={A}}",
  bibEntries: [],
  papers: [],
  chunks: [],
  revisionSuggestions: [],
  modelAttributions: [],
  abstractVariants: [],
  keywordSuggestions: [],
  captionSuggestions: [],
  projectFiles: [
    {
      id: "f1",
      path: "chapters/intro.tex",
      kind: "tex",
      content: "\\section{Intro}",
      addedAt: "",
      updatedAt: "",
    },
  ],
};

describe("buildCompileBundle", () => {
  it("includes bib and project files", () => {
    const b = buildCompileBundle(baseProject);
    expect(b.mainPath).toBe("main.tex");
    expect(b.bibtex).toBe(false);
    expect(b.additionalFiles.some((f) => f.path === "references.bib")).toBe(true);
    expect(b.additionalFiles.some((f) => f.path === "chapters/intro.tex")).toBe(true);
  });

  it("detects bibtex when bibliography command present", () => {
    const p = {
      ...baseProject,
      draftTex: "\\documentclass{article}\\bibliography{references}\\begin{document}x\\end{document}",
    };
    const b = buildCompileBundle(p);
    expect(b.bibtex).toBe(true);
  });
});

describe("resolveAssetPathForGraphics", () => {
  it("matches asset file names", () => {
    const names = ["diagram.png"];
    expect(resolveAssetPathForGraphics("diagram.png", names)).toBe("diagram.png");
    expect(resolveAssetPathForGraphics("assets/diagram.png", names)).toBe("diagram.png");
  });
});
