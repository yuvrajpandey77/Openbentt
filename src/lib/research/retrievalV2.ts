import type { CorpusChunk, SimilarityHit } from "@/types/researchProject";
import type { TfidfIndex } from "@/lib/research/corpusIndex";
import { hybridRetrieveAsync, type HybridRetrievalOptions, type RetrievalHit } from "@/lib/research/hybridRetrieval";

/** Retrieval v2 defaults — tighter fusion + rerank for notebook chat context. */
export const RETRIEVAL_V2_DEFAULTS: HybridRetrievalOptions = {
  limit: 16,
  minFusedScore: 0.008,
  rrfK: 48,
  lexicalWeight: 0.45,
  semanticWeight: 0.55,
};

export async function hybridRetrieveV2(
  queryText: string,
  chunks: CorpusChunk[],
  paperNames: Record<string, string>,
  tfidfIndex: TfidfIndex,
  vectors?: Record<string, number[]>,
  options?: HybridRetrievalOptions
): Promise<RetrievalHit[]> {
  return hybridRetrieveAsync(queryText, chunks, paperNames, tfidfIndex, vectors, {
    ...RETRIEVAL_V2_DEFAULTS,
    ...options,
  });
}

export function dedupeRetrievalHits(hits: SimilarityHit[], max = 24): RetrievalHit[] {
  const seen = new Set<string>();
  const out: RetrievalHit[] = [];
  for (const h of hits) {
    const key = `${h.paperId}:${h.snippet.slice(0, 48)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h as RetrievalHit);
    if (out.length >= max) break;
  }
  return out;
}
