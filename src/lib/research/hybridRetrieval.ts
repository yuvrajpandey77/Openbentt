import type { CorpusChunk, SimilarityHit } from "@/types/researchProject";
import { findSimilarPassages, type TfidfIndex } from "@/lib/research/corpusIndex";
import { embedPassage, findSemanticSimilarPassages } from "@/lib/research/embeddingIndex";

export type RetrievalMethod = "lexical" | "semantic" | "hybrid";

export interface RetrievalHit extends SimilarityHit {
  lexicalScore?: number;
  semanticScore?: number;
  fusedScore: number;
  confidence: "high" | "medium" | "low";
  provenance: string;
  rankFeatures?: Record<string, number>;
}

export interface HybridRetrievalOptions {
  minFusedScore?: number;
  limit?: number;
  rrfK?: number;
  lexicalWeight?: number;
  semanticWeight?: number;
}

const DEFAULT_RRF_K = 60;

function confidenceFromScore(
  score: number,
  lexicalScore?: number,
  semanticScore?: number
): "high" | "medium" | "low" {
  if (semanticScore != null && semanticScore >= 0.55) return "high";
  if (lexicalScore != null && lexicalScore >= 0.12) return "high";
  if (semanticScore != null && semanticScore >= 0.42) return "medium";
  if (lexicalScore != null && lexicalScore >= 0.06) return "medium";
  if (score >= 0.012) return "medium";
  return "low";
}

/** Reciprocal Rank Fusion across ranked lists. */
export function reciprocalRankFusion(
  lists: Array<Array<{ chunkId: string; score: number; hit: SimilarityHit }>>,
  k = DEFAULT_RRF_K
): Map<string, { fused: number; hit: SimilarityHit; ranks: number[] }> {
  const fused = new Map<string, { fused: number; hit: SimilarityHit; ranks: number[] }>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const prev = fused.get(item.chunkId);
      const rrf = 1 / (k + rank + 1);
      if (prev) {
        prev.fused += rrf;
        prev.ranks.push(rank + 1);
      } else {
        fused.set(item.chunkId, { fused: rrf, hit: item.hit, ranks: [rank + 1] });
      }
    });
  }
  return fused;
}

/** Rerank fused hits using lexical overlap boost and snippet quality signals. */
export function rerankHits(
  hits: RetrievalHit[],
  queryText: string,
  options?: { limit?: number }
): RetrievalHit[] {
  const queryTerms = new Set(
    queryText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  const scored = hits.map((h) => {
    const snippetTerms = h.snippet.toLowerCase().split(/\s+/);
    let termOverlap = 0;
    for (const t of queryTerms) {
      if (snippetTerms.some((s) => s.includes(t))) termOverlap++;
    }
    const overlapBoost = queryTerms.size > 0 ? termOverlap / queryTerms.size : 0;
    const lengthPenalty = h.snippet.length < 40 ? -0.05 : 0;
    const dualSignalBoost =
      (h.lexicalScore ?? 0) > 0.1 && (h.semanticScore ?? 0) > 0.4 ? 0.08 : 0;
    const rerankScore = h.fusedScore + overlapBoost * 0.12 + lengthPenalty + dualSignalBoost;

    return {
      ...h,
      fusedScore: rerankScore,
      rankFeatures: {
        termOverlap,
        overlapBoost,
        dualSignalBoost,
        lengthPenalty,
      },
      confidence: confidenceFromScore(rerankScore, h.lexicalScore, h.semanticScore),
      provenance: buildProvenance(h, overlapBoost, dualSignalBoost),
    };
  });

  const maxScore = Math.max(...scored.map((s) => s.fusedScore), 0.001);
  const normalized = scored.map((s) => ({ ...s, score: s.fusedScore / maxScore }));

  return normalized.sort((a, b) => b.fusedScore - a.fusedScore).slice(0, options?.limit ?? 24);
}

function buildProvenance(h: RetrievalHit, overlapBoost: number, dualSignal: number): string {
  const parts: string[] = [];
  if (h.lexicalScore != null && h.lexicalScore > 0.08) {
    parts.push(`lexical TF-IDF ${(h.lexicalScore * 100).toFixed(0)}%`);
  }
  if (h.semanticScore != null && h.semanticScore > 0.35) {
    parts.push(`semantic MiniLM ${(h.semanticScore * 100).toFixed(0)}%`);
  }
  if (dualSignal > 0) parts.push("both signals agree");
  if (overlapBoost > 0.3) parts.push("query terms match snippet");
  if (parts.length === 0) parts.push("weak overlap — verify manually");
  return parts.join(" · ");
}

function fuseRetrievalLists(
  queryText: string,
  lexicalHits: Array<{ chunkId: string; score: number; hit: SimilarityHit }>,
  semanticHits: SimilarityHit[],
  options?: HybridRetrievalOptions
): RetrievalHit[] {
  const limit = options?.limit ?? 24;
  const minFused = options?.minFusedScore ?? 0.005;
  const k = options?.rrfK ?? DEFAULT_RRF_K;

  const lists: Array<Array<{ chunkId: string; score: number; hit: SimilarityHit }>> = [lexicalHits];
  if (semanticHits.length > 0) {
    lists.push(semanticHits.map((h) => ({ chunkId: h.chunkId, score: h.score, hit: h })));
  }

  const fusedMap = reciprocalRankFusion(lists, k);
  const lexicalByChunk = new Map(lexicalHits.map((h) => [h.chunkId, h.score]));
  const semanticByChunk = new Map(semanticHits.map((h) => [h.chunkId, h.score]));

  const hits: RetrievalHit[] = [];
  for (const [chunkId, { fused, hit }] of fusedMap) {
    if (fused < minFused) continue;
    const lexicalScore = lexicalByChunk.get(chunkId);
    const semanticScore = semanticByChunk.get(chunkId);
    hits.push({
      ...hit,
      method: semanticScore && lexicalScore ? "hybrid" : semanticScore ? "semantic" : "lexical",
      lexicalScore,
      semanticScore,
      fusedScore: fused,
      score: fused,
      confidence: confidenceFromScore(fused, lexicalScore, semanticScore),
      provenance: "",
    });
  }

  return rerankHits(hits, queryText, { limit });
}

/** Hybrid retrieval (lexical only when no query embedding available). */
export function hybridRetrieve(
  queryText: string,
  chunks: CorpusChunk[],
  paperNames: Record<string, string>,
  tfidfIndex: TfidfIndex,
  vectors?: Record<string, number[]>,
  options?: HybridRetrievalOptions
): RetrievalHit[] {
  const limit = options?.limit ?? 24;
  const lexicalHits = findSimilarPassages(queryText, chunks, paperNames, tfidfIndex, {
    minScore: 0.04,
    limit: limit * 2,
  }).map((h) => ({ chunkId: h.chunkId, score: h.score, hit: h }));

  let semanticHits: SimilarityHit[] = [];
  if (vectors && Object.keys(vectors).some((id) => id !== "__query__")) {
    semanticHits = findSemanticSimilarPassages(queryText, chunks, vectors, paperNames, {
      minScore: 0.35,
      limit: limit * 2,
      queryVector: vectors["__query__"],
    });
  }

  return fuseRetrievalLists(queryText, lexicalHits, semanticHits, options);
}

/** Full hybrid retrieval with async query embedding. */
export async function hybridRetrieveAsync(
  queryText: string,
  chunks: CorpusChunk[],
  paperNames: Record<string, string>,
  tfidfIndex: TfidfIndex,
  vectors?: Record<string, number[]>,
  options?: HybridRetrievalOptions
): Promise<RetrievalHit[]> {
  const limit = options?.limit ?? 24;
  const lexicalHits = findSimilarPassages(queryText, chunks, paperNames, tfidfIndex, {
    minScore: 0.04,
    limit: limit * 2,
  }).map((h) => ({ chunkId: h.chunkId, score: h.score, hit: h }));

  let semanticHits: SimilarityHit[] = [];
  if (vectors && Object.keys(vectors).some((id) => id !== "__query__")) {
    const queryVector = await embedPassage(queryText);
    semanticHits = findSemanticSimilarPassages(queryText, chunks, vectors, paperNames, {
      minScore: 0.35,
      limit: limit * 2,
      queryVector,
    });
  }

  return fuseRetrievalLists(queryText, lexicalHits, semanticHits, options);
}

/** Scan draft windows with hybrid retrieval (async for semantic query embedding). */
export async function scanDraftHybrid(
  draftTex: string,
  chunks: CorpusChunk[],
  paperNames: Record<string, string>,
  tfidfIndex: TfidfIndex,
  vectors?: Record<string, number[]>
): Promise<RetrievalHit[]> {
  const clean = draftTex.replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, " ");
  const windows: string[] = [];
  for (let i = 0; i < clean.length; i += 260) {
    windows.push(clean.slice(i, i + 320));
    if (windows.length >= 20) break;
  }

  const seen = new Set<string>();
  const all: RetrievalHit[] = [];
  const hasSemantic = vectors && Object.keys(vectors).some((id) => id !== "__query__");

  for (const w of windows) {
    const hits = hasSemantic
      ? await hybridRetrieveAsync(w, chunks, paperNames, tfidfIndex, vectors, { limit: 3 })
      : hybridRetrieve(w, chunks, paperNames, tfidfIndex, vectors, { limit: 3 });
    for (const h of hits) {
      const key = `${h.paperId}:${h.snippet.slice(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(h);
    }
  }
  return all.sort((a, b) => b.fusedScore - a.fusedScore).slice(0, 30);
}
