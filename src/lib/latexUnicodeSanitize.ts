/**
 * pdflatex (BusyTeX / server) often chokes on invisible Unicode copied from PDFs, Word, or the web.
 * U+202F (narrow no-break space) is a frequent culprit — it triggers
 * "Unicode character … not set up for use with LaTeX" near unrelated lines.
 */

/**
 * Zero-width, BOM, and joiners — remove entirely. `\u034F` is a combining grapheme joiner; we still
 * strip it and silence the "misleading character class" lint since it's intentional.
 */
// eslint-disable-next-line no-misleading-character-class
const UNICODE_INVISIBLE = /[\uFEFF\u200B-\u200D\u2060\u2066-\u2069\u034F]/g;

/** All Unicode "space separator" (Zs) code points → ASCII space (requires `u` flag). */
const UNICODE_ZS = /\p{Zs}/gu;

/**
 * Normalize TeX source so pdflatex is less likely to fail on exotic Unicode.
 * Safe for UTF-8 LaTeX with inputenc; only strips/replaces problematic whitespace.
 */
export function sanitizeLatexUnicodeForPdflatex(tex: string): string {
  let s = tex.replace(UNICODE_INVISIBLE, "");
  /** Fallback if a runtime lacks full Unicode property escapes (should not happen in modern browsers). */
  try {
    s = s.replace(UNICODE_ZS, " ");
  } catch {
    s = s.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ");
  }
  return s;
}
