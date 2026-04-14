import { describe, expect, it } from "vitest";
import { isLatexDocumentSource } from "./notebookSourceKind";

describe("isLatexDocumentSource", () => {
  it("detects documentclass", () => {
    expect(isLatexDocumentSource("\\documentclass{book}\n\\begin{document}\nx\n\\end{document}")).toBe(true);
  });

  it("detects preamble before begin{document}", () => {
    const tex = `\\usepackage{foo}
\\begin{document}
hi
\\end{document}`;
    expect(isLatexDocumentSource(tex)).toBe(true);
  });

  it("treats PDF marker extract as plain", () => {
    expect(isLatexDocumentSource("--- PDF PAGE 1 / 3 ---\n\nHello")).toBe(false);
  });
});
