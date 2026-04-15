import { isLatexDocumentSource } from "@/lib/notebookSourceKind";

const LMODERN_BLOCK =
  "% Notebook (WASM): Latin Modern (Type1) avoids missing EC/CM companion fonts (e.g. tcrm*) in browser BusyTeX.\n" +
  "\\usepackage{lmodern}\n";

/**
 * BusyTeX WASM ships a trimmed TeX tree; METAFONT/bitmap companions like `tcrm1200`
 * are often missing (`!pdfTeX error: … Font tcrm1200 … not found`). Loading Latin
 * Modern avoids those fonts.
 *
 * Inserts immediately **before** `\begin{document}` so order stays after `fontenc`,
 * `inputenc`, and other preamble packages.
 */
export function ensureLmodernForWasmLatex(tex: string): string {
  if (!isLatexDocumentSource(tex)) return tex;
  if (/\blmodern\b/i.test(tex)) return tex;
  const beginDoc = /\\begin\s*\{\s*document\s*\}/;
  const m = tex.match(beginDoc);
  if (m?.index === undefined) return tex;
  return tex.slice(0, m.index) + LMODERN_BLOCK + tex.slice(m.index);
}
