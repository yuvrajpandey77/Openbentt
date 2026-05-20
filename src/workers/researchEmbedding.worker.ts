/**
 * Web Worker: MiniLM embeddings off the main UI thread.
 */
import type { CorpusChunk } from "@/types/researchProject";

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

async function embedPassage(text: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const input = text.replace(/\s+/g, " ").trim().slice(0, MAX_EMBED_CHARS);
  if (!input) return [];
  const out = await extractor(input, { pooling: "mean", normalize: true });
  const data = out.data;
  return Array.from(data instanceof Float32Array ? data : (data as number[]));
}

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
    const library = msg.chunks.filter((c) => c.paperId !== "draft").slice(0, MAX_CHUNKS_INDEX);
    const post = (
      payload: WorkerEmbedProgress | WorkerEmbedResult | WorkerEmbedError | WorkerEmbedPartial
    ) => {
      self.postMessage(payload);
    };
    post({ type: "progress", requestId: msg.requestId, phase: "loading-model", done: 0, total: library.length });
    await getEmbedder();
    const vectors: Record<string, number[]> = { ...(msg.resumeVectors ?? {}) };
    const pending = library.filter((c) => !vectors[c.id]);
    for (let i = 0; i < pending.length; i++) {
      const c = pending[i];
      vectors[c.id] = await embedPassage(c.text);
      const done = Object.keys(vectors).length;
      post({
        type: "progress",
        requestId: msg.requestId,
        phase: "embedding",
        done,
        total: library.length,
      });
      if (done % 8 === 0) {
        post({ type: "partial", requestId: msg.requestId, vectors: { ...vectors } });
      }
    }
    post({ type: "result", requestId: msg.requestId, vectors });
    post({ type: "progress", requestId: msg.requestId, phase: "done", done: library.length, total: library.length });
  } catch (e) {
    self.postMessage({
      type: "error",
      requestId: msg.requestId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
