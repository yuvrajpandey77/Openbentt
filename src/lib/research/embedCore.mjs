/**
 * Canonical MiniLM embedding logic — shared by renderer, Web Worker, and Electron embedWorker.
 */

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const MAX_CHUNKS_INDEX = 120;
export const MAX_EMBED_CHARS = 512;

/** @type {Promise<((text: string, opts?: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array | number[] }>)> | null} */
let pipelinePromise = null;

export async function getEmbedder() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = typeof window !== "undefined";
      return pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
    })();
  }
  return pipelinePromise;
}

/** L2-normalized MiniLM embedding (384-dim). */
export async function embedPassage(text) {
  const extractor = await getEmbedder();
  const input = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EMBED_CHARS);
  if (!input) return [];
  const out = await extractor(input, { pooling: "mean", normalize: true });
  const data = out.data;
  return Array.from(data instanceof Float32Array ? data : data);
}

/** Cosine similarity for L2-normalized vectors (dot product). */
export function cosineNormalized(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * @param {{ id: string, paperId: string, text: string }[]} chunks
 * @param {{
 *   onProgress?: (p: { phase: string, done: number, total: number }) => void,
 *   signal?: AbortSignal,
 *   resumeVectors?: Record<string, number[]>,
 *   onPartial?: (vectors: Record<string, number[]>) => void,
 * }} [opts]
 */
export async function buildChunkEmbeddingsFromChunks(chunks, opts = {}) {
  const { onProgress, signal, resumeVectors, onPartial } = opts;
  const library = chunks.filter((c) => c.paperId !== "draft").slice(0, MAX_CHUNKS_INDEX);
  const vectors = { ...(resumeVectors ?? {}) };
  const pending = library.filter((c) => !vectors[c.id]);

  onProgress?.({ phase: "loading-model", done: Object.keys(vectors).length, total: library.length });
  await getEmbedder();
  onProgress?.({ phase: "embedding", done: Object.keys(vectors).length, total: library.length });

  for (let i = 0; i < pending.length; i++) {
    if (signal?.aborted) {
      throw Object.assign(new Error("Embedding index cancelled"), { name: "AbortError" });
    }
    const c = pending[i];
    vectors[c.id] = await embedPassage(c.text);
    const done = Object.keys(vectors).length;
    onProgress?.({ phase: "embedding", done, total: library.length });
    if (done % 8 === 0) onPartial?.({ ...vectors });
  }
  onProgress?.({ phase: "done", done: library.length, total: library.length });
  return vectors;
}
