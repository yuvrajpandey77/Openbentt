/**
 * Phase 2 — Provenance. Every retrieved piece of knowledge carries a SourceRef;
 * no citation is generated when the source cannot be established.
 */
import type { DocumentChunk, OpenbenttDocument, SourceRef } from "@/lib/documents/types";
import type { SimilarityHit } from "@/types/researchProject";

export function sourceRefForChunk(
  chunk: DocumentChunk,
  doc?: Pick<OpenbenttDocument, "id" | "title" | "source" | "sourceType">
): SourceRef {
  return {
    documentId: chunk.documentId,
    documentVersionId: chunk.documentVersionId,
    page: chunk.page,
    section: chunk.sectionId,
    block: chunk.blockId,
    chunkId: chunk.id,
    sourceType: doc?.sourceType ?? "unknown",
    sourceUri: doc?.source,
    title: doc?.title,
  };
}

/** Human-readable citation line: "Title — Section s1 · Page 14". Never guesses. */
export function formatSourceLine(ref: SourceRef): string {
  const parts: string[] = [ref.title ?? ref.documentId];
  if (ref.section) parts.push(`Section ${ref.section}`);
  if (typeof ref.page === "number") parts.push(`Page ${ref.page}`);
  return parts.join(" · ");
}

/** Enrich legacy hits with a SourceRef when a chunk registry is available. */
export function enrichHitsWithProvenance(
  hits: SimilarityHit[],
  chunksById: Map<string, DocumentChunk>,
  docsById: Map<string, Pick<OpenbenttDocument, "id" | "title" | "source" | "sourceType">>
): (SimilarityHit & { sourceRef?: SourceRef })[] {
  return hits.map((h) => {
    const chunk = chunksById.get(h.chunkId);
    if (!chunk) return h;
    return { ...h, sourceRef: sourceRefForChunk(chunk, docsById.get(chunk.documentId)) };
  });
}
