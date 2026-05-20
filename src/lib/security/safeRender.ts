/**
 * Safer HTML emission for user-driven LaTeX preview (KaTeX).
 */
import katex from "katex";

export function renderKatexHtmlSafe(latex: string, displayMode = true): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: "warn",
      trust: false,
      maxSize: 500,
      maxExpand: 1000,
    });
  } catch {
    return "<p class=\"text-sm text-muted-foreground\">Invalid LaTeX</p>";
  }
}
