import { describe, expect, it } from "vitest";
import { briefCompileMessage, extractLaTeXErrorSnippet, missingBundledFileHint, parseLaTeXCompileDiagnostics } from "./latexErrorUi";

describe("extractLaTeXErrorSnippet", () => {
  it("prefers trailing ! and l. lines over preamble noise", () => {
    const log = `This is pdfTeX
(/texlive/texmf-dist/tex/latex/foo/bar.sty)
! Undefined control sequence.
l.42 \\foo
`;
    const sn = extractLaTeXErrorSnippet(log);
    expect(sn).toContain("! Undefined");
    expect(sn).toContain("l.42");
  });

  it("surfaces pdftex.def missing-file errors clearly", () => {
    const log = `LOG:
! Package pdftex.def Error: File \`diagram.jpg' not found: using draft setting.
l.66 ...graphics[width=\\\\linewidth]{diagram.jpg}
`;
    const sn = extractLaTeXErrorSnippet(log);
    expect(sn).toContain("pdftex.def Error");
    expect(sn).toContain("diagram.jpg");
  });

  it("prefers a real ! LaTeX Error block over a trailing ! ==> Fatal line", () => {
    const log = `
! LaTeX Error: File \`bad.sty' not found.
l.5 \\usepackage

!  ==> Fatal error occurred, no output PDF file produced!
`;
    const sn = extractLaTeXErrorSnippet(log);
    expect(sn).toContain("LaTeX Error");
    expect(sn).toContain("bad.sty");
    expect(sn).not.toMatch(/==>\s*Fatal/i);
  });

  it("reads BusyTeX LOG section and ignores generic Fatal / no PDF lines after it", () => {
    const logcat = `$ pdflatex main.tex
EXITCODE: 1

TEXMFLOG:
==
MISSFONTLOG:
==
LOG:
This is pdfTeX, Version 3.14
(/foo/bar.sty)
! LaTeX Error: File \`missing.sty' not found.
l.3 \\usepackage
==
STDOUT:
==> Fatal error occurred, no output PDF file produced!
==
STDERR:

======`;
    const sn = extractLaTeXErrorSnippet(logcat);
    expect(sn).toContain("! LaTeX Error");
    expect(sn).toContain("missing.sty");
    expect(sn).not.toMatch(/Fatal error occurred, no output PDF/i);
  });
});

describe("parseLaTeXCompileDiagnostics", () => {
  it("extracts line number and fix kind for missing sty", () => {
    const log = `! LaTeX Error: File \`bad.sty' not found.
l.29 \\usepackage{bad}`;
    const diags = parseLaTeXCompileDiagnostics(log);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].line).toBe(29);
    expect(diags[0].fixKind).toBe("comment_usepackage");
  });

  it("detects contentReference artifacts", () => {
    const log = `! Undefined control sequence.
l.12 some text :contentReference[oaicite:1] more`;
    const diags = parseLaTeXCompileDiagnostics(log);
    expect(diags[0]?.fixKind).toBe("strip_content_reference");
  });
});

describe("missingBundledFileHint", () => {
  it("detects missing image for Notebook toast", () => {
    const h = missingBundledFileHint("! Package pdftex.def Error: File `diagram.jpg' not found: using draft.");
    expect(h).toBeTruthy();
    expect(h).toContain("diagram.jpg");
    expect(h).toContain("includegraphics");
  });

  it("ignores missing .sty", () => {
    expect(missingBundledFileHint("File `foo.sty' not found")).toBeNull();
  });
});

describe("briefCompileMessage", () => {
  it("returns short text unchanged", () => {
    expect(briefCompileMessage("short", 400)).toBe("short");
  });

  it("truncates huge logs", () => {
    const long = "x".repeat(5000);
    expect(briefCompileMessage(long, 100).length).toBeLessThanOrEqual(100);
  });
});
