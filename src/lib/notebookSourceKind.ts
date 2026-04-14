/**
 * Detect whether Notebook Source is a full LaTeX document (compile with pdflatex)
 * vs plain text / PDF marker extraction (compile with jsPDF).
 */
export function isLatexDocumentSource(source: string): boolean {
  const t = source.replace(/^\uFEFF/, "").trimStart();
  if (t.startsWith("\\documentclass")) return true;
  const beginDoc = t.indexOf("\\begin{document}");
  if (beginDoc === -1 || beginDoc > 12_000) return false;
  const head = t.slice(0, beginDoc);
  return /\\(documentclass|usepackage|title|author|date)\b/.test(head);
}
