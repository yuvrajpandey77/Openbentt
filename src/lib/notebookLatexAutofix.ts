import { sanitizeLatexUnicodeForPdflatex } from "@/lib/latexUnicodeSanitize";
import { ensureDraftGraphicxForNotebook } from "@/lib/latexGraphicDraftFixup";
import { escapeAmpersandsOnItemLines } from "@/lib/latexItemAmpersandFixup";
import { ensureLmodernForWasmLatex } from "@/lib/latexWasmFontFixup";
import { rewriteIncludegraphicsPlaceholders } from "@/lib/latexNotebookImageFixup";

/**
 * Aggressive Notebook LaTeX cleanup for WASM pdflatex: unicode spaces, draft `graphicx`,
 * fonts, item `&`, and placeholder figures. Use after a failed compile or invalid PDF preview.
 */
export function applyNotebookLatexAutofix(tex: string): string {
  let s = sanitizeLatexUnicodeForPdflatex(tex);
  s = ensureDraftGraphicxForNotebook(s);
  s = escapeAmpersandsOnItemLines(s);
  s = ensureLmodernForWasmLatex(s);
  s = rewriteIncludegraphicsPlaceholders(s);
  return s;
}

/** True when pdf.js rejects the buffer (corrupt output or wrong bytes). */
export function isInvalidPdfStructureMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("invalid pdf") ||
    m.includes("invalid pdf structure") ||
    m.includes("pdf header not found") ||
    (m.includes("pdf") && /corrupt|damaged|malformed/.test(m))
  );
}
