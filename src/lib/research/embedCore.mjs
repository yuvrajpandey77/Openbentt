/**
 * Canonical MiniLM embedding logic — shared by renderer, Web Worker, and Electron embedWorker.
 */

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
/**
 * Legacy soft default for web/in-memory indexing. Desktop SQLite embed jobs pass
 * `maxChunks: MAX_CHUNKS_INDEX_DESKTOP` so thousand-page libraries are fully covered.
 */
export const MAX_CHUNKS_INDEX = 2_000;
export const MAX_CHUNKS_INDEX_WEB = 2_000;
export const MAX_CHUNKS_INDEX_DESKTOP = 50_000;
export const MAX_EMBED_CHARS = 512;

/** @type {Promise<((text: string, opts?: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array | number[] }>)> | null} */
let pipelinePromise = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let idleDisposeTimer = null;

export async function getEmbedder() {
  if (idleDisposeTimer) {
    clearTimeout(idleDisposeTimer);
    idleDisposeTimer = null;
  }
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

/** Drop the cached MiniLM pipeline so GC can reclaim ONNX/WASM RAM after indexing. */
export function disposeEmbedder() {
  if (idleDisposeTimer) {
    clearTimeout(idleDisposeTimer);
    idleDisposeTimer = null;
  }
  const pending = pipelinePromise;
  pipelinePromise = null;
  if (!pending) return;
  void pending
    .then((pipe) => {
      try {
        if (pipe && typeof pipe.dispose === "function") pipe.dispose();
      } catch {
        /* ignore */
      }
    })
    .catch(() => {});
}

/** Keep MiniLM warm briefly across chat turns, then free RAM. */
export function scheduleIdleDisposeEmbedder(ms = 60_000) {
  if (idleDisposeTimer) clearTimeout(idleDisposeTimer);
  idleDisposeTimer = setTimeout(() => disposeEmbedder(), ms);
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
 * Fair subset for embedding when corpus exceeds maxChunks.
 * Round-robins across papers so one long PDF cannot monopolize the index.
 * @param {{ id: string, paperId: string, text: string }[]} chunks
 * @param {number} maxChunks
 */
export function selectChunksForEmbedding(chunks, maxChunks) {
  const library = (chunks ?? []).filter((c) => c.paperId !== "draft");
  if (!Number.isFinite(maxChunks) || maxChunks <= 0 || library.length <= maxChunks) {
    return library;
  }

  /** @type {Map<string, typeof library>} */
  const byPaper = new Map();
  for (const c of library) {
    const list = byPaper.get(c.paperId);
    if (list) list.push(c);
    else byPaper.set(c.paperId, [c]);
  }

  const queues = [...byPaper.values()];
  const selected = [];
  let cursor = 0;
  while (selected.length < maxChunks && queues.length > 0) {
    const qi = cursor % queues.length;
    const q = queues[qi];
    if (!q.length) {
      queues.splice(qi, 1);
      if (queues.length === 0) break;
      cursor = qi;
      continue;
    }
    selected.push(q.shift());
    cursor = qi + 1;
  }
  return selected;
}

/**
 * @param {{ id: string, paperId: string, text: string }[]} chunks
 * @param {{
 *   onProgress?: (p: { phase: string, done: number, total: number }) => void,
 *   signal?: AbortSignal,
 *   resumeVectors?: Record<string, number[]>,
 *   onPartial?: (vectors: Record<string, number[]>) => void,
 *   maxChunks?: number,
 * }} [opts]
 */
export async function buildChunkEmbeddingsFromChunks(chunks, opts = {}) {
  const { onProgress, signal, resumeVectors, onPartial } = opts;
  const maxChunks = opts.maxChunks ?? MAX_CHUNKS_INDEX;
  const library = selectChunksForEmbedding(chunks, maxChunks);
  const vectors = { ...(resumeVectors ?? {}) };
  const pending = library.filter((c) => !vectors[c.id]?.length);

  onProgress?.({ phase: "loading-model", done: Object.keys(vectors).filter((k) => k !== "__query__").length, total: library.length });
  await getEmbedder();
  onProgress?.({ phase: "embedding", done: Object.keys(vectors).filter((k) => k !== "__query__").length, total: library.length });

  /** @type {Record<string, number[]>} */
  let sincePartial = {};
  for (let i = 0; i < pending.length; i++) {
    if (signal?.aborted) {
      throw Object.assign(new Error("Embedding index cancelled"), { name: "AbortError" });
    }
    const c = pending[i];
    vectors[c.id] = await embedPassage(c.text);
    sincePartial[c.id] = vectors[c.id];
    const done = Object.keys(vectors).filter((k) => k !== "__query__").length;
    onProgress?.({ phase: "embedding", done, total: library.length });
    // Delta-only partials — never re-upsert the full vector map (was O(n²) SQLite).
    if (Object.keys(sincePartial).length >= 8) {
      onPartial?.(sincePartial);
      sincePartial = {};
    }
  }
  if (Object.keys(sincePartial).length) onPartial?.(sincePartial);
  onProgress?.({ phase: "done", done: library.length, total: library.length });
  return vectors;
}
