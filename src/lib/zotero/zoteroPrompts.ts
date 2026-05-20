import { literatureReviewContext } from "@/lib/zotero/zoteroRetrieval";

export function zoteroLiteratureReviewPrompt(topic: string, context: string): string {
  return `Write a literature review section for an academic paper on: ${topic}

Use ONLY the Zotero library sources below. Cite with \\cite{citekey} for each claim.
Organize by theme, note gaps, and end with a short related-work paragraph.

${context}`;
}

export function zoteroRelatedWorkPrompt(draftExcerpt: string, context: string): string {
  return `Draft a "Related Work" subsection that connects the draft below to these Zotero sources.
Use \\cite{citekey} for each reference. Do not invent papers outside the list.

Draft excerpt:
${draftExcerpt.slice(0, 4000)}

Zotero sources:
${context}`;
}

export function zoteroCitationInsertPrompt(citekey: string, title: string, draftContext: string): string {
  return `Suggest one sentence that cites \\cite{${citekey}} ("${title}") naturally in this draft context:

${draftContext.slice(0, 2000)}`;
}

export function buildLiteratureReviewFromLibrary(
  topic: string,
  contextBlock: string
): string {
  return zoteroLiteratureReviewPrompt(topic, contextBlock);
}

export { literatureReviewContext };
