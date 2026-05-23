/** Whether main.tex references an external .bib file for BibTeX. */
export function mainTexUsesExternalBibliography(tex: string): boolean {
  return /\\bibliography\s*\{/.test(tex) || /\\addbibresource\s*\{/.test(tex);
}

export type BibliographyCompileHint =
  | { kind: "ok" }
  | { kind: "unused_bib"; message: string }
  | { kind: "missing_bib_file"; message: string }
  | { kind: "inline_only"; message: string };

/** User-facing hint when references.bib may not affect the compiled PDF. */
export function bibliographyCompileHint(mainTex: string, bibliography: string | undefined): BibliographyCompileHint {
  const bib = bibliography?.trim() ?? "";
  const usesExternal = mainTexUsesExternalBibliography(mainTex);
  const hasCite = /\\cite[talp]?\{/.test(mainTex);
  const inlineBib = /\\begin\{thebibliography\}/.test(mainTex);

  if (bib && usesExternal) return { kind: "ok" };
  if (bib && !usesExternal) {
    return {
      kind: "unused_bib",
      message:
        "references.bib is not wired into main.tex. Add \\bibliographystyle{plain} and \\bibliography{references} before \\end{document}, or use \\cite{key} with those lines.",
    };
  }
  if (!bib && usesExternal) {
    return {
      kind: "missing_bib_file",
      message: "main.tex calls \\bibliography{…} but references.bib is empty. Add entries in the Bibliography tab.",
    };
  }
  if (inlineBib && !bib && !hasCite) {
    return {
      kind: "inline_only",
      message: "Using inline \\begin{thebibliography}. Switch to references.bib + \\bibliography{references} for easier citation management.",
    };
  }
  return { kind: "ok" };
}
