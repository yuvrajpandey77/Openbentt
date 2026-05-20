import type { RevisionSuggestion } from "@/types/researchProject";

/** Parse pasted reviewer comments into actionable items. */
export function parseReviewerComments(text: string): RevisionSuggestion[] {
  const blocks = text
    .split(/\n(?=\d+[\.)]\s|[•\-*]\s|Comment:|Reviewer:|R\d+:)/i)
    .map((b) => b.trim())
    .filter((b) => b.length > 12);

  const now = new Date().toISOString();
  return blocks.slice(0, 40).map((block, i) => ({
    id: `rev-${i}-${Date.now()}`,
    source: "reviewer" as const,
    original: block.slice(0, 500),
    suggested: suggestRevisionText(block),
    status: "pending" as const,
    createdAt: now,
  }));
}

/** Heuristic rewrite for inline diff preview (not sent to model). */
export function suggestRevisionText(comment: string): string {
  const trimmed = comment.replace(/^[\d•\-*.\s]+/, "").trim();
  if (trimmed.length < 20) return `Revise: ${trimmed}`;
  return `Address reviewer note: ${trimmed.slice(0, 280)}`;
}

/** Build before/after strings for diff UI when accepting a suggestion. */
export function buildRevisionPatch(tex: string, suggestion: RevisionSuggestion): { before: string; after: string } {
  const todo = `% [REVIEW ${suggestion.id.slice(-6)}] ${suggestion.original.slice(0, 90).replace(/\n/g, " ")}\n`;
  const draft = `% Draft fix: ${suggestion.suggested.slice(0, 140).replace(/\n/g, " ")}\n`;
  const block = `${todo}${draft}`;
  if (tex.includes(todo)) return { before: tex, after: tex };
  const insertAt = tex.indexOf("\\begin{document}");
  if (insertAt >= 0) {
    const after =
      tex.slice(0, insertAt + "\\begin{document}".length) +
      "\n" +
      block +
      tex.slice(insertAt + "\\begin{document}".length);
    return { before: tex, after };
  }
  return { before: tex, after: block + tex };
}

export function applyRevisionPatch(tex: string, suggestion: RevisionSuggestion): string {
  return buildRevisionPatch(tex, suggestion).after;
}

/** @deprecated Use applyRevisionPatch — kept for tests. */
export function applyRevisionToTex(tex: string, suggestion: RevisionSuggestion): string {
  return applyRevisionPatch(tex, suggestion);
}

export function extractCommentedPdfNotes(extractedText: string): string[] {
  const notes: string[] = [];
  const re = /(?:Comment:|Note:|Review:)\s*([^\n]{8,200})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(extractedText)) !== null) {
    notes.push(m[1].trim());
  }
  return notes;
}
