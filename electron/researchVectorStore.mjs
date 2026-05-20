/**
 * Persistent embedding vectors (Float32 BLOBs) — separate from project metadata.
 */
import { getDb } from "./researchDb.mjs";

const EMBED_DIM = 384;

function float32ToBlob(vec) {
  const arr = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) arr[i] = vec[i];
  return Buffer.from(arr.buffer);
}

function blobToFloat32(buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const f32 = new Float32Array(ab);
  return Array.from(f32);
}

export function upsertEmbeddings(app, projectId, batch) {
  const db = getDb(app);
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO embeddings (chunk_id, project_id, dim, vector, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chunk_id, project_id) DO UPDATE SET
       dim = excluded.dim,
       vector = excluded.vector,
       updated_at = excluded.updated_at`
  );
  let count = 0;
  for (const { chunkId, vector } of batch) {
    if (!vector?.length) continue;
    stmt.run(chunkId, projectId, vector.length, float32ToBlob(vector), now);
    count++;
  }
  return { count };
}

export function loadEmbeddings(app, projectId, chunkIds = null) {
  const db = getDb(app);
  let rows;
  if (chunkIds?.length) {
    const placeholders = chunkIds.map(() => "?").join(",");
    rows = db
      .prepare(
        `SELECT chunk_id, vector FROM embeddings WHERE project_id = ? AND chunk_id IN (${placeholders})`
      )
      .all(projectId, ...chunkIds);
  } else {
    rows = db
      .prepare("SELECT chunk_id, vector FROM embeddings WHERE project_id = ?")
      .all(projectId);
  }
  const out = {};
  for (const r of rows) {
    out[r.chunk_id] = blobToFloat32(r.vector);
  }
  return out;
}

export function deleteEmbeddingsForProject(app, projectId) {
  const db = getDb(app);
  db.prepare("DELETE FROM embeddings WHERE project_id = ?").run(projectId);
}

export function deleteEmbeddingsForChunks(app, projectId, chunkIds) {
  if (!chunkIds?.length) return;
  const db = getDb(app);
  const placeholders = chunkIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM embeddings WHERE project_id = ? AND chunk_id IN (${placeholders})`).run(
    projectId,
    ...chunkIds
  );
}

export function embeddingStats(app, projectId) {
  const db = getDb(app);
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM embeddings WHERE project_id = ?")
    .get(projectId);
  return { count: row?.count ?? 0, dim: EMBED_DIM };
}

export { EMBED_DIM };
