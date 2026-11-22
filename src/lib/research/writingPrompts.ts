/** Persona label embedded in Notebook writing prompts — not an Openbentt-hosted model id. */
/** Honest label: writing assist uses the user's configured chat model, not a separate endpoint. */
export const WRITING_ASSIST_PERSONA = "LaTeX writing assistant (via your chat model)";

export function abstractGenerationPrompt(sectionSample: string, venue: string): string {
  return `You are a ${WRITING_ASSIST_PERSONA}.
Write exactly 3 abstract variants (150–250 words each) for a ${venue} submission.
Use only claims supported by the draft excerpt below. Number them Abstract 1, 2, 3.
Do not invent citations.

Draft excerpt:
${sectionSample.slice(0, 6000)}`;
}

export function keywordsPrompt(sectionSample: string): string {
  return `List 8–12 research keywords (comma-separated) for this paper, then 3–5 PDF metadata keywords.
Draft:
${sectionSample.slice(0, 4000)}`;
}

export function outlineExpansionPrompt(title: string, bullets: string, toneSample: string): string {
  return `Expand this section for an academic paper in LaTeX-ready prose (no preamble).
Match the tone of the sample. Section: ${title}

Outline:
${bullets}

Tone sample:
${toneSample.slice(0, 1500)}`;
}

export function captionPrompt(kind: "figure" | "table", label: string, context: string): string {
  return `Write one precise ${kind} caption (1–2 sentences) for a research paper.
Reply with exactly one line in this format:
Caption for ${label}: <your caption>

Context:
${context.slice(0, 2000)}`;
}

export function missingCitationPrompt(citeKey: string, context: string): string {
  return `The draft cites ${citeKey}. Suggest why a follow-up paper might be missing and one search query. Context:\n${context.slice(0, 1500)}`;
}

export type ProofreadFocus = "grammar" | "clarity" | "academic" | "all";

/**
 * Academic proofreading via the user's configured chat model.
 * Output is numbered so Notebook Review can ingest with parseReviewerComments.
 */
export function academicProofreadPrompt(
  draftExcerpt: string,
  focus: ProofreadFocus = "all"
): string {
  const focusLine =
    focus === "grammar"
      ? "Focus on grammar, spelling, punctuation, and agreement."
      : focus === "clarity"
        ? "Focus on clarity, redundancy, and sentence structure."
        : focus === "academic"
          ? "Focus on academic tone, hedging, undefined jargon, and passive/active voice."
          : "Cover grammar, clarity, and academic tone.";

  return `You are a ${WRITING_ASSIST_PERSONA} performing a careful proofreading pass on LaTeX draft prose.
${focusLine}
Do NOT invent citations, results, or claims. Ignore pure LaTeX commands unless they break readability.

Reply with 5–15 numbered issues. Each item MUST start with a number and a tag, e.g.:
1. [grammar] …
2. [clarity] …
3. [academic] …

For each item: quote a short problematic span, then give a concrete fix (one sentence).

Draft excerpt:
${draftExcerpt.slice(0, 10_000)}`;
}
