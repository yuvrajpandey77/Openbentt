import { describe, expect, it } from "vitest";
import { bibliographyCompileHint, mainTexUsesExternalBibliography } from "./bibliographyCompile";

describe("bibliographyCompile", () => {
  it("detects external bibliography", () => {
    expect(mainTexUsesExternalBibliography("\\bibliography{references}")).toBe(true);
    expect(mainTexUsesExternalBibliography("\\begin{thebibliography}")).toBe(false);
  });

  it("warns when bib file unused", () => {
    const hint = bibliographyCompileHint("\\begin{document}\\end{document}", "@article{a}");
    expect(hint.kind).toBe("unused_bib");
  });

  it("ok when wired", () => {
    const tex = "\\cite{x}\\bibliography{references}";
    const hint = bibliographyCompileHint(tex, "@article{x}");
    expect(hint.kind).toBe("ok");
  });
});
