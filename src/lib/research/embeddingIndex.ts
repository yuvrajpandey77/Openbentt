import type { CorpusChunk, SimilarityHit } from "@/types/researchProject";
import { chunkText } from "@/lib/research/corpusIndex";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const MAX_CHUNKS_INDEX = 120;
const MAX_EMBED_CHARS = 512;

type FeaturePipeline = (
  text: string,
  opts?: { pooling: string; normalize: boolean }
) => Promise<{ data: Float32Array | number[] }>;

let pipelinePromise: Promise<FeaturePipeline> | null = null;

async function getEmbedder(): Promise<FeaturePipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      return pipeline("feature-extraction", MODEL_ID, { dtype: "q8" }) as Promise<FeaturePipeline>;
    })();
  }
  return pipelinePromise;
}

/** L2-normalized MiniLM embedding (384-dim). Runs fully in-browser. */
export async function embedPassage(text: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const input = text.replace(/\s+/g, " ").trim().slice(0, MAX_EMBED_CHARS);
  if (!input) return [];
  const out = await extractor(input, { pooling: "mean", normalize: true });
  const data = out.data;
  return Array.from(data instanceof Float32Array ? data : (data as number[]));
}

function cosineNormalized(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export type EmbeddingIndexProgress = {
  phase: "loading-model" | "embedding" | "done";
  done: number;
  total: number;
};

let embeddingWorker: Worker | null = null;

function getEmbeddingWorker(): Worker {
  if (!embeddingWorker) {
    embeddingWorker = new Worker(new URL("../../workers/researchEmbedding.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return embeddingWorker;
}

export function buildChunkEmbeddingsInWorker(
  chunks: CorpusChunk[],
  onProgress?: (p: EmbeddingIndexProgress) => void,
  signal?: AbortSignal,
  resumeVectors?: Record<string, number[]>,
  onPartial?: (vectors: Record<string, number[]>) => void
): Promise<Record<string, number[]>> {
  const requestId = crypto.randomUUID?.() ?? `emb-${Date.now()}`;
  const worker = getEmbeddingWorker();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      worker.terminate();
      embeddingWorker = null;
      reject(new DOMException("Embedding index cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const handler = (ev: MessageEvent) => {
      const msg = ev.data;
      if (msg.requestId !== requestId) return;
      if (msg.type === "progress") {
        onProgress?.({ phase: msg.phase, done: msg.done, total: msg.total });
      } else if (msg.type === "partial" && msg.vectors) {
        onPartial?.(msg.vectors);
        onProgress?.({
          phase: "embedding",
          done: Object.keys(msg.vectors).length,
          total: chunks.filter((c) => c.paperId !== "draft").length,
        });
      } else if (msg.type === "result") {
        worker.removeEventListener("message", handler);
        signal?.removeEventListener("abort", onAbort);
        resolve(msg.vectors);
      } else if (msg.type === "error") {
        worker.removeEventListener("message", handler);
        signal?.removeEventListener("abort", onAbort);
        reject(new Error(msg.message));
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type: "build-embeddings", requestId, chunks, resumeVectors });
  });
}

/** Embed library chunks (excludes draft). Uses Web Worker when available. */
export async function buildChunkEmbeddings(
  chunks: CorpusChunk[],
  onProgress?: (p: EmbeddingIndexProgress) => void,
  signal?: AbortSignal,
  resumeVectors?: Record<string, number[]>,
  onPartial?: (vectors: Record<string, number[]>) => void
): Promise<Record<string, number[]>> {
  if (typeof Worker !== "undefined" && !signal?.aborted) {
    try {
      return await buildChunkEmbeddingsInWorker(chunks, onProgress, signal, resumeVectors, onPartial);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
    }
  }
  const library = chunks.filter((c) => c.paperId !== "draft").slice(0, MAX_CHUNKS_INDEX);
  const vectors: Record<string, number[]> = { ...(resumeVectors ?? {}) };
  const pending = library.filter((c) => !vectors[c.id]);
  onProgress?.({ phase: "loading-model", done: Object.keys(vectors).length, total: library.length });
  await getEmbedder();
  onProgress?.({ phase: "embedding", done: Object.keys(vectors).length, total: library.length });
  for (let i = 0; i < pending.length; i++) {
    if (signal?.aborted) throw new DOMException("Embedding index cancelled", "AbortError");
    const c = pending[i];
    vectors[c.id] = await embedPassage(c.text);
    const done = Object.keys(vectors).length;
    onProgress?.({ phase: "embedding", done, total: library.length });
    if (done % 8 === 0) onPartial?.({ ...vectors });
  }
  onProgress?.({ phase: "done", done: library.length, total: library.length });
  return vectors;
}

export function findSemanticSimilarPassages(
  queryText: string,
  chunks: CorpusChunk[],
  vectors: Record<string, number[]>,
  paperNames: Record<string, string>,
  options?: { minScore?: number; limit?: number; queryVector?: number[] }
): SimilarityHit[] {
  const minScore = options?.minScore ?? 0.42;
  const limit = options?.limit ?? 24;
  const queryVec = options?.queryVector ?? vectors["__query__"];
  if (!queryVec?.length) return [];

  const hits: SimilarityHit[] = [];
  for (const c of chunks) {
    if (c.paperId === "draft") continue;
    const v = vectors[c.id];
    if (!v?.length) continue;
    const score = cosineNormalized(queryVec, v);
    if (score >= minScore) {
      hits.push({
        chunkId: c.id,
        paperId: c.paperId,
        paperName: paperNames[c.paperId] ?? c.paperId,
        snippet: c.text.slice(0, 280) + (c.text.length > 280 ? "…" : ""),
        score,
        pageHint: c.pageHint,
        method: "semantic",
        semanticScore: score,
        confidence: score >= 0.55 ? "high" : score >= 0.45 ? "medium" : "low",
        provenance: `MiniLM cosine ${(score * 100).toFixed(0)}%`,
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Async semantic search with on-the-fly query embedding. */
export async function findSemanticSimilarPassagesAsync(
  queryText: string,
  chunks: CorpusChunk[],
  vectors: Record<string, number[]>,
  paperNames: Record<string, string>,
  options?: { minScore?: number; limit?: number }
): Promise<SimilarityHit[]> {
  const queryVector = await embedPassage(queryText);
  return findSemanticSimilarPassages(queryText, chunks, vectors, paperNames, {
    ...options,
    queryVector,
  });
}

/** Scan draft windows against precomputed chunk embeddings. */
export async function scanDraftSemanticSimilarity(
  draftTex: string,
  chunks: CorpusChunk[],
  vectors: Record<string, number[]>,
  paperNames: Record<string, string>,
  onProgress?: (p: EmbeddingIndexProgress) => void
): Promise<SimilarityHit[]> {
  const libraryChunks = chunks.filter((c) => c.paperId !== "draft" && vectors[c.id]);
  if (libraryChunks.length === 0) return [];

  const merged: Record<string, number[]> = { ...vectors };
  const seen = new Set<string>();
  const all: SimilarityHit[] = [];
  const windows = chunkText(draftTex.replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, " "), 320, 60).slice(0, 24);

  onProgress?.({ phase: "loading-model", done: 0, total: windows.length });
  await getEmbedder();

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    merged.__query__ = await embedPassage(w);
    onProgress?.({ phase: "embedding", done: i + 1, total: windows.length });
    for (const h of findSemanticSimilarPassages(w, libraryChunks, merged, paperNames, {
      minScore: 0.45,
      limit: 2,
    })) {
      const key = `${h.paperId}:${h.snippet.slice(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(h);
    }
  }
  onProgress?.({ phase: "done", done: windows.length, total: windows.length });
  return all.sort((a, b) => b.score - a.score).slice(0, 30);
}

export { MAX_CHUNKS_INDEX };

export function isEmbeddingIndexReady(vectors: Record<string, number[]> | undefined): boolean {
  if (!vectors) return false;
  return Object.keys(vectors).some((k) => k !== "__query__");
}
