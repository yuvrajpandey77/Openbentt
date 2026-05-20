/**
 * Worker thread: corpus chunking (keeps main Electron process responsive).
 */
import { parentPort, workerData } from "node:worker_threads";
import { buildCorpusChunks } from "../../src/lib/research/corpusChunksCore.mjs";

try {
  const { type, payload } = workerData;
  if (type === "rechunk") {
    const result = buildCorpusChunks(
      payload.papers ?? [],
      payload.draftTex ?? "",
      payload.projectId ?? ""
    );
    parentPort.postMessage({ result });
  } else {
    parentPort.postMessage({ error: `Unknown worker type: ${type}` });
  }
} catch (e) {
  parentPort.postMessage({ error: e?.message ?? String(e) });
}
