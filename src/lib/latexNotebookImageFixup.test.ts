import { describe, expect, it } from "vitest";
import { rewriteIncludegraphicsPlaceholders } from "./latexNotebookImageFixup";

describe("rewriteIncludegraphicsPlaceholders", () => {
  it("replaces includegraphics with a framed placeholder", () => {
    const tex = `\\documentclass{article}
\\begin{document}
\\includegraphics[width=\\linewidth]{diagram.jpg}
\\end{document}`;
    const out = rewriteIncludegraphicsPlaceholders(tex);
    expect(out).not.toContain("\\includegraphics");
    expect(out).toContain("diagram.jpg");
    expect(out).toContain("Upload image to Assets");
  });

  it("leaves non-LaTeX text unchanged", () => {
    expect(rewriteIncludegraphicsPlaceholders("plain text")).toBe("plain text");
  });
});
