import { describe, expect, it } from "vitest";
import { ensureDraftGraphicxForNotebook } from "./latexGraphicDraftFixup";

describe("ensureDraftGraphicxForNotebook", () => {
  it("inserts PassOptions before graphicx when includegraphics is used", () => {
    const tex = `\\documentclass{article}
\\usepackage{graphicx}
\\begin{document}
\\includegraphics{a.png}
\\end{document}`;
    const out = ensureDraftGraphicxForNotebook(tex);
    expect(out.indexOf("PassOptionsToPackage{draft}{graphicx}")).toBeLessThan(out.indexOf("\\usepackage{graphicx}"));
  });

  it("no-ops when no includegraphics", () => {
    const tex = "\\documentclass{article}\\usepackage{graphicx}\\begin{document}x\\end{document}";
    expect(ensureDraftGraphicxForNotebook(tex)).toBe(tex);
  });

  it("no-ops when draft already set", () => {
    const tex = `\\documentclass{article}
\\PassOptionsToPackage{draft}{graphicx}
\\usepackage{graphicx}
\\begin{document}\\includegraphics{x}\\end{document}`;
    expect(ensureDraftGraphicxForNotebook(tex)).toBe(tex);
  });
});
