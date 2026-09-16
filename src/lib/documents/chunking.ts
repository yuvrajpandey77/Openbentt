/**
 * Phase 2 — Structure-aware chunking.
 * RAG DISCIPLINE: chunk size 480 / overlap 80 are imported from the canonical
 * core (corpusChunksCore.mjs) — never redefined here. This layer only attaches
 * provenance (documentId/version/page/section/block/chunkIndex/checksum) so
 * retrieval can reconstruct document/page/section/source without guessing.
 */
import { chunkText } from "@/lib/research/corpusChunksCore.mjs";
import { fnv1aHex } from "@/lib/documents/hashing";
import type { DocumentBlock, DocumentChunk } from "@/lib/documents/types";

export const CHUNK_SIZE = 480;
export const CHUNK_OVERLAP = 80;

export interface ChunkInput {
  documentId: string;
  documentVersionId: string;
  projectId?: string;
  paperId?: string;
}

export function chunkDocumentBlocks(blocks: DocumentBlock[], input: ChunkInput): DocumentChunk[] {
  const out: DocumentChunk[] = [];
  blocks.forEach((block) => {
    const parts = chunkText(block.text, CHUNK_SIZE, CHUNK_OVERLAP);
    parts.forEach((text, chunkIndex) => {
      const checksum = fnv1aHex(`${input.documentId}:${input.documentVersionId}:${block.id}:${chunkIndex}:${text}`);
      out.push({
        id: `${input.documentId}:${block.id}:${chunkIndex}`,
        documentId: input.documentId,
        documentVersionId: input.documentVersionId,
        projectId: input.projectId,
        paperId: input.paperId,
        page: block.page,
        sectionId: block.sectionId,
        blockId: block.id,
        chunkIndex,
        text,
        checksum,
      });
    });
  });
  return out;
}

/** Map structure-aware chunks onto the legacy CorpusChunk shape (additive). */
export function toLegacyCorpusChunks(chunks: DocumentChunk[]): { id: string; paperId: string; text: string; pageHint?: number }[] {
  return chunks.map((c) => ({
    id: c.id,
    paperId: c.paperId ?? c.documentId,
    text: c.text,
    pageHint: c.page,
  }));
}
