import type { CorpusChunk } from "@/types/researchProject";

/** Stable fingerprint for incremental index invalidation. */
export function chunkContentFingerprint(chunk: CorpusChunk): string {
  const text = chunk.text.slice(0, 512);
  return `${chunk.paperId}:${text.length}:${text.slice(0, 64)}`;
}

export function pruneStaleEmbeddings(
  chunks: CorpusChunk[],
  vectors: Record<string, number[]> | undefined
): Record<string, number[]> {
  if (!vectors) return {};
  const validIds = new Set(chunks.map((c) => c.id));
  const out: Record<string, number[]> = {};
  for (const [id, vec] of Object.entries(vectors)) {
    if (id === "__query__" || validIds.has(id)) out[id] = vec;
  }
  return out;
}

export function listChunksPendingEmbed(
  chunks: CorpusChunk[],
  vectors: Record<string, number[]> | undefined
): CorpusChunk[] {
  const library = chunks.filter((c) => c.paperId !== "draft");
  const have = new Set(Object.keys(vectors ?? {}));
  return library.filter((c) => !have.has(c.id));
}

export type IncrementalIndexPlan = {
  pending: CorpusChunk[];
  skipped: number;
  pruned: number;
};

export function planIncrementalIndex(
  chunks: CorpusChunk[],
  vectors: Record<string, number[]> | undefined
): IncrementalIndexPlan {
  const pruned = pruneStaleEmbeddings(chunks, vectors);
  const prunedCount = Object.keys(vectors ?? {}).length - Object.keys(pruned).length;
  const pending = listChunksPendingEmbed(chunks, pruned);
  const library = chunks.filter((c) => c.paperId !== "draft");
  return {
    pending,
    skipped: library.length - pending.length,
    pruned: prunedCount,
  };
}
