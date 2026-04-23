import { describe, it, expect } from "vitest";
import { buildNotebookLatexFixPrompt } from "./notebookLatexFixPrompt";

describe("buildNotebookLatexFixPrompt", () => {
  it("includes the same source and error the UI passed in", () => {
    const source = "\\documentclass{article}\\begin{document}Hi\\end{document}";
    const err = "! LaTeX Error: on input line 2.";
    const p = buildNotebookLatexFixPrompt({ sourceText: source, errorRaw: err, failure: "compile" });
    expect(p).toContain("## Error");
    expect(p).toContain("## Current .tex");
    expect(p).toContain(source);
    expect(p).toContain("```latex");
  });

  it("accepts pdf_render failure body", () => {
    const p = buildNotebookLatexFixPrompt({
      sourceText: "x",
      errorRaw: "Invalid PDF structure",
      failure: "pdf_render",
    });
    expect(p).toContain("PDF preview");
  });
});
