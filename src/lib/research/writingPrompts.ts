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
