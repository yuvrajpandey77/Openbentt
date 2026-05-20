/**
 * Web Worker: MiniLM embeddings off the main UI thread.
 */
import type { CorpusChunk } from "@/types/researchProject";
import { buildChunkEmbeddingsFromChunks } from "@/lib/research/embedCore.mjs";

export type WorkerEmbedRequest = {
  type: "build-embeddings";
  requestId: string;
  chunks: CorpusChunk[];
  resumeVectors?: Record<string, number[]>;
};

export type WorkerEmbedProgress = {
  type: "progress";
  requestId: string;
  phase: "loading-model" | "embedding" | "done";
  done: number;
  total: number;
};

export type WorkerEmbedPartial = {
  type: "partial";
  requestId: string;
  vectors: Record<string, number[]>;
};

export type WorkerEmbedResult = {
  type: "result";
  requestId: string;
  vectors: Record<string, number[]>;
};

export type WorkerEmbedError = {
  type: "error";
  requestId: string;
  message: string;
};

self.onmessage = async (ev: MessageEvent<WorkerEmbedRequest>) => {
  const msg = ev.data;
  if (msg.type !== "build-embeddings") return;
  try {
    const vectors = await buildChunkEmbeddingsFromChunks(msg.chunks, {
      resumeVectors: msg.resumeVectors,
      onProgress: (p) => {
        self.postMessage({
          type: "progress",
          requestId: msg.requestId,
          phase: p.phase,
          done: p.done,
          total: p.total,
        } satisfies WorkerEmbedProgress);
      },
      onPartial: (partial) => {
        self.postMessage({
          type: "partial",
          requestId: msg.requestId,
          vectors: partial,
        } satisfies WorkerEmbedPartial);
      },
    });
    self.postMessage({ type: "result", requestId: msg.requestId, vectors } satisfies WorkerEmbedResult);
    self.postMessage({
      type: "progress",
      requestId: msg.requestId,
      phase: "done",
      done: Object.keys(vectors).length,
      total: Object.keys(vectors).length,
    } satisfies WorkerEmbedProgress);
  } catch (e) {
    self.postMessage({
      type: "error",
      requestId: msg.requestId,
      message: e instanceof Error ? e.message : String(e),
    } satisfies WorkerEmbedError);
  }
};
