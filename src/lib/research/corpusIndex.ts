import type { CorpusChunk, SimilarityHit } from "@/types/researchProject";
import {
  buildCorpusChunks as buildCorpusChunksCore,
  chunkText as chunkTextCore,
} from "@/lib/research/corpusChunksCore.mjs";

const STOP = new Set(
  "a an the and or but in on at to for of is are was were be been being have has had do does did will would could should may might this that these those with from by as it its".split(
    " "
  )
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function termFreq(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Corpus-wide TF-IDF index with inverse document frequency. */
export interface TfidfIndex {
  idf: Map<string, number>;
  docCount: number;
}

export function buildTfidfIndex(chunks: CorpusChunk[]): TfidfIndex {
  const library = chunks.filter((c) => c.paperId !== "draft");
  const docCount = library.length || 1;
  const df = new Map<string, number>();

  for (const c of library) {
    const seen = new Set(tokenize(c.text));
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((docCount + 1) / (count + 1)) + 1);
  }
  return { idf, docCount };
}

function tfidfVector(tokens: string[], index: TfidfIndex): Map<string, number> {
  const tf = termFreq(tokens);
  const vec = new Map<string, number>();
  const maxTf = Math.max(1, ...tf.values());
  for (const [term, count] of tf) {
    const idf = index.idf.get(term) ?? 1;
    vec.set(term, (count / maxTf) * idf);
  }
  return vec;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (vb) dot += va * vb;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Split text into overlapping chunks — canonical implementation in corpusChunksCore.mjs */
export function chunkText(text: string, chunkSize = 480, overlap = 80): string[] {
  return chunkTextCore(text, chunkSize, overlap);
}

/** Build corpus chunks — canonical implementation in corpusChunksCore.mjs */
export function buildCorpusChunks(
  papers: { id: string; fileName: string; extractedText: string }[],
  draftTex: string,
  projectId?: string
): CorpusChunk[] {
  return buildCorpusChunksCore(papers, draftTex, projectId ?? "") as CorpusChunk[];
}

export function findSimilarPassages(
  queryText: string,
  chunks: CorpusChunk[],
  paperNames: Record<string, string>,
  index: TfidfIndex,
  options?: { minScore?: number; limit?: number }
): SimilarityHit[] {
  const minScore = options?.minScore ?? 0.08;
  const limit = options?.limit ?? 24;
  const qVec = tfidfVector(tokenize(queryText), index);
  const hits: SimilarityHit[] = [];

  for (const c of chunks) {
    if (c.paperId === "draft") continue;
    const score = cosine(qVec, tfidfVector(tokenize(c.text), index));
    if (score >= minScore) {
      hits.push({
        chunkId: c.id,
        paperId: c.paperId,
        paperName: paperNames[c.paperId] ?? c.paperId,
        snippet: c.text.slice(0, 280) + (c.text.length > 280 ? "…" : ""),
        score,
        pageHint: c.pageHint,
        method: "lexical",
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Scan draft in windows against library (excluding draft chunks). */
export function scanDraftSimilarity(
  draftTex: string,
  chunks: CorpusChunk[],
  paperNames: Record<string, string>,
  index?: TfidfIndex
): SimilarityHit[] {
  const tfidfIndex = index ?? buildTfidfIndex(chunks);
  const windows = chunkText(draftTex, 320, 60);
  const seen = new Set<string>();
  const all: SimilarityHit[] = [];
  for (const w of windows.slice(0, 40)) {
    for (const h of findSimilarPassages(w, chunks, paperNames, tfidfIndex, { minScore: 0.1, limit: 3 })) {
      const k = `${h.paperId}:${h.snippet.slice(0, 60)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      all.push(h);
    }
  }
  return all.sort((a, b) => b.score - a.score).slice(0, 30);
}

/** @deprecated Use method "lexical" — kept for migration compatibility. */
export const LEGACY_TFIDF_LABEL = "lexical";
