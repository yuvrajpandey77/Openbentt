import { sanitizeLatexUnicodeForPdflatex } from "@/lib/latexUnicodeSanitize";
import { ensureDraftGraphicxForNotebook } from "@/lib/latexGraphicDraftFixup";
import { escapeAmpersandsOnItemLines } from "@/lib/latexItemAmpersandFixup";
import { ensureLmodernForWasmLatex } from "@/lib/latexWasmFontFixup";
import { rewriteIncludegraphicsPlaceholders } from "@/lib/latexNotebookImageFixup";
import type { LatexCompileDiagnostic } from "@/lib/latexErrorUi";

/**
 * Aggressive Notebook LaTeX cleanup for WASM pdflatex: unicode spaces, draft `graphicx`,
 * fonts, item `&`, and placeholder figures. Use after a failed compile or invalid PDF preview.
 */
export function applyNotebookLatexAutofix(tex: string, availableAssetNames: string[] = []): string {
  let s = stripContentReferenceMarkers(tex);
  s = sanitizeLatexUnicodeForPdflatex(s);
  s = ensureDraftGraphicxForNotebook(s);
  s = escapeAmpersandsOnItemLines(s);
  s = ensureLmodernForWasmLatex(s);
  s = rewriteIncludegraphicsPlaceholders(s, availableAssetNames);
  return s;
}

/** Strip AI citation artifacts that break pdflatex. */
export function stripContentReferenceMarkers(tex: string): string {
  return tex.replace(/:contentReference\[oaicite:\d+\]/gi, "");
}

/** Comment out a 1-based source line (no-op if already commented). */
export function commentOutSourceLine(tex: string, lineOneBased: number): string {
  const lines = tex.split("\n");
  const idx = lineOneBased - 1;
  if (idx < 0 || idx >= lines.length) return tex;
  const line = lines[idx];
  if (/^\s*%/.test(line)) return tex;
  lines[idx] = line.replace(/^(\s*)/, "$1% ");
  return lines.join("\n");
}

/** Apply a single diagnostic fix (line-targeted or global strip). */
export function applyDiagnosticFix(tex: string, diag: LatexCompileDiagnostic): string {
  switch (diag.fixKind) {
    case "strip_content_reference":
      return stripContentReferenceMarkers(tex);
    case "comment_includegraphics":
    case "comment_usepackage":
    case "comment_line":
      return commentOutSourceLine(tex, diag.line);
    case "generic_autofix":
    default:
      return applyNotebookLatexAutofix(tex);
  }
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
