import { describe, expect, it } from "vitest";
import { ensureLmodernForWasmLatex } from "./latexWasmFontFixup";

describe("ensureLmodernForWasmLatex", () => {
  it("inserts lmodern before begin{document} when missing (after other packages)", () => {
    const tex = `\\documentclass[12pt]{article}
\\usepackage[T1]{fontenc}
\\begin{document}
Hi
\\end{document}`;
    const out = ensureLmodernForWasmLatex(tex);
    expect(out).toContain("\\usepackage{lmodern}");
    expect(out.indexOf("\\usepackage{lmodern}")).toBeLessThan(out.indexOf("\\begin{document}"));
  });

  it("works when preamble has no newlines before begin{document}", () => {
    const tex =
      "\\documentclass{article}\\usepackage[T1]{fontenc}\\begin{document}Hi\\end{document}";
    const out = ensureLmodernForWasmLatex(tex);
    expect(out.indexOf("\\usepackage{lmodern}")).toBeLessThan(out.indexOf("\\begin{document}"));
  });

  it("does not duplicate lmodern", () => {
    const tex = `\\documentclass{article}
\\usepackage{lmodern}
\\begin{document}
x
\\end{document}`;
    expect(ensureLmodernForWasmLatex(tex)).toBe(tex);
  });
});
