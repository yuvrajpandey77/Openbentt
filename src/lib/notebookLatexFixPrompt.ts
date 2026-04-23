import { extractLaTeXErrorSnippet, briefCompileMessage } from "@/lib/latexErrorUi";

const MAX_SOURCE_IN_PROMPT = 48_000;

export type NotebookLatexFailureSource = "compile" | "pdf_render";

/**
 * One canonical prompt for “ask the main chat to fix this .tex” — same data whether the user
 * arrived here from Compile, Apply fixes & recompile, or invalid PDF preview.
 */
export function buildNotebookLatexFixPrompt(params: {
  sourceText: string;
  errorRaw: string;
  failure: NotebookLatexFailureSource;
}): string {
  const { sourceText, errorRaw, failure } = params;
  const errFocus =
    failure === "compile" ? extractLaTeXErrorSnippet(errorRaw) || briefCompileMessage(errorRaw, 3500) : errorRaw;
  const src =
    sourceText.length > MAX_SOURCE_IN_PROMPT
      ? `${sourceText.slice(0, MAX_SOURCE_IN_PROMPT)}\n\n% […truncated: ${String(sourceText.length)} chars total. Full .tex is in Notebook → Source.]\n`
      : sourceText;
  const errLabel = failure === "compile" ? "pdflatex / compile log" : "PDF preview / invalid output";

  return `My Openbentt Notebook failed to produce a good PDF. Please fix the LaTeX below.

**Constraints (important):** The app compiles a **single** .tex string (no multi-file project). Use only packages the template already has, or add standard ones. \\includegraphics may need a placeholder or removal; use TikZ/tikz-cd for diagrams if helpful.

## Error (${errLabel})

\`\`\`text
${errFocus}
\`\`\`

## Current .tex in Notebook (Source)

\`\`\`latex
${src || "% (empty source)"}
\`\`\`

Reply with a **complete** working \\documentclass … document in one \`\`\`latex\`\`\` code block.`;
}
