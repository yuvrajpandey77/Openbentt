import { describe, expect, it } from "vitest";
import { runSubmissionChecks } from "@/lib/research/submissionRules";

const DRAFT_WITH_ABSTRACT = `\\documentclass{article}
\\begin{document}
\\begin{abstract}
${"word ".repeat(180)}
\\end{abstract}
\\section{Intro}
${"content ".repeat(80)}
\\cite{smith2020}
\\begin{figure}
\\caption{A figure}
\\label{fig:one}
\\end{figure}
\\bibliography{refs}
\\end{document}`;

describe("runSubmissionChecks", () => {
  it("fails ieee abstract when over 250 words", () => {
    const longAbstract = `\\documentclass{article}
\\begin{document}
\\begin{abstract}
${"word ".repeat(280)}
\\end{abstract}
\\section{X}
${"body ".repeat(60)}
\\bibliography{x}
\\end{document}`;
    const checks = runSubmissionChecks(longAbstract, "@article{smith2020, title={T}}", "ieee");
    const absLen = checks.find((c) => c.id === "abstract-length");
    expect(absLen?.passed).toBe(false);
  });

  it("flags missing bibliography cite keys", () => {
    const checks = runSubmissionChecks("\\cite{ghost}", "", "generic");
    const cites = checks.find((c) => c.id === "citations-resolved");
    expect(cites?.passed).toBe(false);
  });

  it("passes substantive draft with resolved cites", () => {
    const checks = runSubmissionChecks(
      DRAFT_WITH_ABSTRACT,
      "@article{smith2020, title={Paper}, author={A}, year={2020}}",
      "generic"
    );
    expect(checks.find((c) => c.id === "abstract-present")?.passed).toBe(true);
    expect(checks.find((c) => c.id === "citations-resolved")?.passed).toBe(true);
    expect(checks.find((c) => c.id === "draft-length")?.passed).toBe(true);
  });
});
