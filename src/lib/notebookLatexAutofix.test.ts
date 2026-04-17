import { describe, expect, it } from "vitest";
import { applyNotebookLatexAutofix, isInvalidPdfStructureMessage } from "./notebookLatexAutofix";

describe("applyNotebookLatexAutofix", () => {
  it("normalizes unicode spaces and keeps document structure", () => {
    const tex = "\\documentclass{article}\n\\begin{document}Hi\u202Fthere\n\\end{document}";
    const out = applyNotebookLatexAutofix(tex);
    expect(out).toContain("Hi there");
  });
});

describe("isInvalidPdfStructureMessage", () => {
  it("detects pdf.js invalid structure wording", () => {
    expect(isInvalidPdfStructureMessage("Invalid PDF structure")).toBe(true);
    expect(isInvalidPdfStructureMessage("invalid pdf structure")).toBe(true);
    expect(isInvalidPdfStructureMessage("something else")).toBe(false);
  });
});
