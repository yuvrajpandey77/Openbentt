/**
 * Canonical corpus chunking — shared by renderer (via corpusIndex.ts) and Electron chunkWorker.
 */

export function chunkText(text, chunkSize = 480, overlap = 80) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks = [];
  let i = 0;
  while (i < normalized.length) {
    chunks.push(normalized.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

/** @param {{ id: string, extractedText?: string }[]} papers @param {string} [projectId] scopes draft chunk IDs per project */
export function buildCorpusChunks(papers, draftTex = "", projectId = "") {
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
  const draftPrefix = projectId ? `${projectId}:` : "";
  const draftParts = chunkText(String(draftTex ?? "").replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, " "));
  draftParts.forEach((text, i) => {
    out.push({ id: `${draftPrefix}draft-${i}`, paperId: "draft", text });
  });
  return out;
}
