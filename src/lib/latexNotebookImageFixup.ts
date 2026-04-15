import { isLatexDocumentSource } from "@/lib/notebookSourceKind";

/**
 * Notebook sends only `.tex` text — no `diagram.jpg` on disk. Replace
 * `\includegraphics[...]{file}` with a visible framed placeholder so documents
 * (e.g. marketing examples with figures) still compile in WASM / HTTP pdflatex.
 */
export function rewriteIncludegraphicsPlaceholders(tex: string): string {
  if (!isLatexDocumentSource(tex)) return tex;
  const re = /\\includegraphics(\[[^\]]*\])?\s*\{([^}]*)\}/g;
  if (!re.test(tex)) return tex;
  re.lastIndex = 0;
  return tex.replace(re, (_full, _opt: string, fname: string) => {
    const name = String(fname).trim();
    const safe = name.replace(/\\/g, "\\textbackslash{}").replace(/_/g, "\\_");
    return (
      "\\fbox{\\begin{minipage}[t]{0.99\\linewidth}\\centering\\footnotesize " +
      "[Image not bundled in Notebook — add file next to \\texttt{.tex} in a full TeX setup]\\\\" +
      `\\texttt{${safe}}` +
      "\\end{minipage}}"
    );
  });
}
