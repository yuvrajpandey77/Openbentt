import type { CorpusChunk, SimilarityHit } from "@/types/researchProject";
import {
  buildChunkEmbeddingsFromChunks,
  cosineNormalized,
  embedPassage,
  MAX_CHUNKS_INDEX,
} from "@/lib/research/embedCore.mjs";

export { embedPassage, MAX_CHUNKS_INDEX };

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
  return buildChunkEmbeddingsFromChunks(chunks, {
    onProgress,
    signal,
    resumeVectors,
    onPartial,
  });
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

export function isEmbeddingIndexReady(vectors: Record<string, number[]> | undefined): boolean {
  if (!vectors) return false;
  return Object.keys(vectors).some((k) => k !== "__query__");
}
