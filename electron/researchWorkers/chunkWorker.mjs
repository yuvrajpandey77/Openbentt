/**
 * Worker thread: corpus chunking (keeps main Electron process responsive).
 */
import { parentPort, workerData } from "node:worker_threads";

const STOP = new Set(
  "a an the and or but in on at to for of is are was were be been being have has had do does did will would could should may might this that these those with from by as it its".split(
    " "
  )
);

function chunkText(text, chunkSize = 480, overlap = 80) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks = [];
  let i = 0;
  while (i < normalized.length) {
    chunks.push(normalized.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

function buildCorpusChunks(papers, draftTex) {
  const out = [];
  for (const p of papers) {
    const parts = chunkText(p.extractedText ?? "");
    parts.forEach((text, i) => {
      out.push({
        id: `${p.id}-${i}`,
        paperId: p.id,
        text,
        pageHint: Math.floor(i / 3) + 1,
      });
    });
  }
  const draftParts = chunkText((draftTex ?? "").replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, " "));
  draftParts.forEach((text, i) => {
    out.push({ id: `draft-${i}`, paperId: "draft", text });
  });
  return out;
}

try {
  const { type, payload } = workerData;
  if (type === "rechunk") {
    const result = buildCorpusChunks(payload.papers ?? [], payload.draftTex ?? "");
    parentPort.postMessage({ result });
  } else {
    parentPort.postMessage({ error: `Unknown worker type: ${type}` });
  }
} catch (e) {
  parentPort.postMessage({ error: e?.message ?? String(e) });
}
