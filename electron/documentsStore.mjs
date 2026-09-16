/**
 * Phase 2 — Desktop document persistence (additive, v7 tables).
 * No changes to papers/corpus_chunks/embeddings. Uses parameterized SQL only.
 */
import { getDb } from "./researchDb.mjs";

export function upsertDocument(app, doc) {
  const db = getDb(app);
  db.prepare(
    `INSERT INTO documents (id, project_id, title, source, source_type, mime_type, size, checksum,
      extractor_version, metadata_json, extraction_status, status, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       project_id=excluded.project_id, title=excluded.title, source=excluded.source,
       source_type=excluded.source_type, mime_type=excluded.mime_type, size=excluded.size,
       checksum=excluded.checksum, extractor_version=excluded.extractor_version,
       metadata_json=excluded.metadata_json, extraction_status=excluded.extraction_status,
       status=excluded.status, version=excluded.version, updated_at=excluded.updated_at`
  ).run(
    doc.id, doc.projectId ?? null, doc.title ?? "", doc.source ?? "", doc.sourceType ?? "unknown",
    doc.mimeType ?? "", doc.size ?? 0, doc.checksum ?? "", doc.extractorVersion ?? "",
    JSON.stringify(doc.metadata ?? {}), doc.extractionStatus ?? "failed", doc.status ?? "failed",
    doc.version ?? 1, doc.createdAt ?? new Date().toISOString(), doc.updatedAt ?? new Date().toISOString()
  );
  return doc.id;
}

export function getDocument(app, id) {
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
  if (!row) return null;
  return { ...row, metadata: JSON.parse(row.metadata_json ?? "{}") };
}

export function listDocuments(app, projectId) {
  const db = getDb(app);
  const rows = projectId
    ? db.prepare("SELECT * FROM documents WHERE project_id = ? ORDER BY updated_at DESC").all(projectId)
    : db.prepare("SELECT * FROM documents ORDER BY updated_at DESC").all();
  return rows.map((r) => ({ ...r, metadata: JSON.parse(r.metadata_json ?? "{}") }));
}

export function findDocumentByChecksum(app, checksum) {
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM documents WHERE checksum = ? LIMIT 1").get(checksum);
  if (!row) return null;
  return { ...row, metadata: JSON.parse(row.metadata_json ?? "{}") };
}

export function deleteDocument(app, id) {
  const db = getDb(app);
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
}

export function putExtractionCache(app, entry) {
  const db = getDb(app);
  db.prepare(
    `INSERT INTO document_extract_cache (cache_key, document_id, extractor, extractor_version, status, content_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET document_id=excluded.document_id, extractor=excluded.extractor,
       extractor_version=excluded.extractor_version, status=excluded.status,
       content_json=excluded.content_json, created_at=excluded.created_at`
  ).run(
    entry.cacheKey, entry.documentId, entry.extractor ?? "", entry.extractorVersion ?? "",
    entry.status ?? "failed", JSON.stringify(entry.content ?? {}), new Date().toISOString()
  );
}

export function getExtractionCache(app, cacheKey) {
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM document_extract_cache WHERE cache_key = ?").get(cacheKey);
  if (!row) return null;
  return { ...row, content: JSON.parse(row.content_json ?? "{}") };
}
