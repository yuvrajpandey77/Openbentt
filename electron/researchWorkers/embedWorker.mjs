/**
 * Worker thread: MiniLM embeddings (keeps main Electron process responsive).
 */
import { parentPort, workerData } from "node:worker_threads";
import { buildChunkEmbeddingsFromChunks } from "../../src/lib/research/embedCore.mjs";

try {
  const { type, payload } = workerData;
  if (type !== "embed") {
    parentPort.postMessage({ error: `Unknown worker type: ${type}` });
    return;
  }

  const chunks = payload.chunks ?? [];
  const resumeVectors = payload.resumeVectors ?? {};

  const vectors = await buildChunkEmbeddingsFromChunks(chunks, {
    resumeVectors,
    onProgress: (p) => {
      parentPort.postMessage({ type: "progress", progress: p });
    },
    onPartial: (partial) => {
      parentPort.postMessage({ type: "partial", vectors: partial });
    },
  });

  parentPort.postMessage({ result: { vectors } });
} catch (e) {
  if (e?.name === "AbortError") {
    parentPort.postMessage({ error: "Aborted", aborted: true });
  } else {
    parentPort.postMessage({ error: e?.message ?? String(e) });
  }
}
