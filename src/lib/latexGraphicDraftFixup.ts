import { isLatexDocumentSource } from "@/lib/notebookSourceKind";

/**
 * Notebook only sends `.tex` text — image files are not on disk. `graphicx` `draft`
 * shows a framed placeholder with the filename instead of aborting on missing files.
 * Must appear **before** `\usepackage{graphicx}`.
 */
export function ensureDraftGraphicxForNotebook(tex: string): string {
  if (!isLatexDocumentSource(tex)) return tex;
  if (!/\\includegraphics\b/.test(tex)) return tex;
  if (/\\PassOptionsToPackage\s*\{\s*draft\s*\}\s*\{\s*graphicx\s*\}/.test(tex)) return tex;
  if (/\\usepackage\s*\[[^\]]*\bdraft\b[^\]]*\]\s*\{\s*graphicx\s*\}/.test(tex)) return tex;
  const re = /\\usepackage(?:\[[^\]]*\])?\s*\{\s*graphicx\s*\}/;
  const m = tex.match(re);
  if (!m?.index) return tex;
  return `${tex.slice(0, m.index)}\\PassOptionsToPackage{draft}{graphicx}\n${tex.slice(m.index)}`;
}
