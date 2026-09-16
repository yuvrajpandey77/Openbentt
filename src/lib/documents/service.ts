/**
 * Phase 2 — DocumentService: stable internal application boundary.
 * ingest/inspect/extract/normalize/structure/index/search/get/delete/reindex.
 * Internal only (no public network API). Renderer-safe + dependency-free
 * except the extraction layer; heavy parsing/indexing stays in callers'
 * workers/job queue (see docs). No RAG constant changes.
 */
import { logger } from "@/lib/log";
import { DOCUMENT_LIMITS } from "@/lib/documents/limits";
import { documentIdForChecksum, fnv1aHex, sha256Hex } from "@/lib/documents/hashing";
import {
  EXTRACTOR_VERSION, buildPdfContent, pickExtractor, type ExtractionResult, type ExtractorInput,
} from "@/lib/documents/extractors";
import { enrichResearchMetadata, mergeMetadata } from "@/lib/documents/metadata";
import { detectSections } from "@/lib/documents/structure";
import { chunkDocumentBlocks } from "@/lib/documents/chunking";
import { fetchPageForIngest, validateIngestUrl } from "@/lib/documents/urlIngest";
import { extractHtmlArticle } from "@/lib/documents/extractors";
import type {
  DocumentChunk, DocumentContent, DocumentExtraction, DocumentStatus, DocumentVersion,
  ExtractionStatus, OpenbenttDocument,
} from "@/lib/documents/types";

export interface IngestInput {
  fileName: string;
  mimeType: string;
  bytes?: Uint8Array;
  text?: string;
  projectId?: string;
  sourceUrl?: string;
  userTitle?: string;
}

export interface PdfPagesInput {
  pages: { pageNumber: number; text: string; empty: boolean }[];
  totalPages: number;
  truncated?: boolean;
}

interface Registry {
  documents: Map<string, OpenbenttDocument>;
  versions: Map<string, DocumentVersion>;
  contents: Map<string, DocumentContent>;
  chunks: Map<string, DocumentChunk[]>;
  /** extraction cache key: checksum + extractorVersion */
  extractionCache: Map<string, DocumentExtraction>;
  /** checksum -> documentId (duplicate detection across filenames/projects) */
  byChecksum: Map<string, string>;
  staleIndex: Set<string>;
}

function blankRegistry(): Registry {
  return {
    documents: new Map(), versions: new Map(), contents: new Map(), chunks: new Map(),
    extractionCache: new Map(), byChecksum: new Map(), staleIndex: new Set(),
  };
}

// Module-level in-memory registry (desktop persists via documentsStore.mjs; web via project JSON).
const registry: Registry = blankRegistry();

const nowIso = (): string => new Date().toISOString();

function statusForExtraction(status: ExtractionStatus): DocumentStatus {
  if (status === "ocr-required") return "needs-ocr";
  if (status === "unsupported") return "unsupported";
  if (status === "failed") return "failed";
  return "ready";
}

export function getDocument(id: string): OpenbenttDocument | undefined {
  return registry.documents.get(id);
}

export function listDocuments(projectId?: string): OpenbenttDocument[] {
  const all = [...registry.documents.values()];
  return projectId ? all.filter((d) => d.projectId === projectId) : all;
}

export function findDuplicate(checksum: string): OpenbenttDocument | undefined {
  const id = registry.byChecksum.get(checksum);
  return id ? registry.documents.get(id) : undefined;
}

export function getChunks(documentId: string): DocumentChunk[] {
  return registry.chunks.get(documentId) ?? [];
}

function buildDocument(
  input: IngestInput, checksum: string, result: ExtractionResult, version: number,
  previousVersionId?: string
): { doc: OpenbenttDocument; versionRec: DocumentVersion } {
  const id = documentIdForChecksum(checksum);
  const versionId = `${id}@v${version}`;
  const enriched = enrichResearchMetadata(
    result.content.blocks.map((b) => b.text).join("\n"),
    input.fileName, result.sourceType, input.sourceUrl
  );
  const metadata = mergeMetadata(result.metadata, enriched);
  if (input.userTitle) {
    metadata.title = { value: input.userTitle.slice(0, 300), origin: "user-provided" };
  }
  const doc: OpenbenttDocument = {
    id,
    title: metadata.title?.value ?? input.fileName,
    source: input.sourceUrl ?? input.fileName,
    sourceType: result.sourceType,
    mimeType: result.metadata.mimeType?.value ?? input.mimeType,
    size: input.bytes?.length ?? input.text?.length ?? 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    checksum,
    extractorVersion: EXTRACTOR_VERSION,
    metadata,
    extractionStatus: result.status,
    status: statusForExtraction(result.status),
    projectId: input.projectId,
    version,
    previousVersionId,
  };
  return {
    doc,
    versionRec: {
      id: versionId, documentId: id, version, checksum,
      createdAt: nowIso(), source: doc.source, extractorVersion: EXTRACTOR_VERSION, previousVersionId,
    },
  };
}

/** Core ingest: validate -> identify -> extract (cached) -> normalize -> structure -> chunk. */
export async function ingest(input: IngestInput): Promise<{
  document: OpenbenttDocument;
  version: DocumentVersion;
  duplicate: boolean;
  chunks: DocumentChunk[];
}> {
  const t0 = Date.now();
  const size = input.bytes?.length ?? input.text?.length ?? 0;
  if (size > DOCUMENT_LIMITS.maxFileBytes) {
    throw Object.assign(new Error("too-large"), { code: "too-large" });
  }
  const bytesForHash = input.bytes ?? new TextEncoder().encode(input.text ?? "");
  const checksum = await sha256Hex(bytesForHash);
  const existing = findDuplicate(checksum);
  if (existing && existing.extractorVersion === EXTRACTOR_VERSION) {
    logger.info("documents", "duplicate import detected", { checksum: checksum.slice(0, 12) });
    return { document: existing, version: registry.versions.get(`${existing.id}@v${existing.version}`)!, duplicate: true, chunks: getChunks(existing.id) };
  }
  const extractorInput: ExtractorInput = { fileName: input.fileName, mimeType: input.mimeType, bytes: input.bytes, text: input.text };
  const extractor = pickExtractor(extractorInput);
  if (!extractor) {
    throw Object.assign(new Error("unsupported-type"), { code: "unsupported-type" });
  }
  const cacheKey = `${checksum}:${EXTRACTOR_VERSION}`;
  let extraction = registry.extractionCache.get(cacheKey);
  let result: ExtractionResult;
  if (extraction) {
    result = { sourceType: extraction.content.blocks.length ? "unknown" : "unknown", content: extraction.content, metadata: extraction.metadata, status: extraction.status };
  } else {
    try {
      result = await extractor.extract(extractorInput);
    } catch (err) {
      const code = err instanceof Error ? err.message : "extraction-failed";
      throw Object.assign(new Error(code), { code });
    }
    const version = (existing?.version ?? 0) + 1;
    const { doc, versionRec } = buildDocument(input, checksum, result, version, existing ? `${existing.id}@v${existing.version}` : undefined);
    const sections = detectSections(result.content);
    const content: DocumentContent = { ...result.content, sections };
    const chunks = result.status === "extracted" || result.status === "partial"
      ? chunkDocumentBlocks(content.blocks, {
        documentId: doc.id, documentVersionId: versionRec.id,
        projectId: input.projectId, paperId: doc.id,
      })
      : [];
    extraction = {
      documentId: doc.id, versionId: versionRec.id, extractor: extractor.name,
      extractorVersion: EXTRACTOR_VERSION, status: result.status, content, metadata: doc.metadata, createdAt: nowIso(),
    };
    registry.extractionCache.set(cacheKey, extraction);
    registry.documents.set(doc.id, doc);
    registry.versions.set(versionRec.id, versionRec);
    registry.contents.set(doc.id, content);
    registry.chunks.set(doc.id, chunks);
    registry.byChecksum.set(checksum, doc.id);
    if (result.status === "extracted" || result.status === "partial") registry.staleIndex.add(doc.id);
    logger.info("documents", "ingested document", {
      extractor: extractor.name, size, status: result.status,
      durationMs: Date.now() - t0, chunks: chunks.length,
    });
    return { document: doc, version: versionRec, duplicate: false, chunks };
  }
  // Cache-hit path (re-import after extractor unchanged): rebuild doc shell.
  const version = (existing?.version ?? 0) + 1;
  const fallback: ExtractionResult = {
    sourceType: existing?.sourceType ?? "unknown", content: extraction.content,
    metadata: extraction.metadata, status: extraction.status,
  };
  const { doc, versionRec } = buildDocument(input, checksum, fallback, version, existing ? `${existing.id}@v${existing.version}` : undefined);
  const chunks = chunkDocumentBlocks(extraction.content.blocks, {
    documentId: doc.id, documentVersionId: versionRec.id, projectId: input.projectId, paperId: doc.id,
  });
  registry.documents.set(doc.id, doc);
  registry.versions.set(versionRec.id, versionRec);
  registry.contents.set(doc.id, extraction.content);
  registry.chunks.set(doc.id, chunks);
  registry.byChecksum.set(checksum, doc.id);
  return { document: doc, version: versionRec, duplicate: Boolean(existing), chunks };
}

/** PDF entry point: keeps src/lib/pdfText.ts as the glyph source (unchanged). */
export async function ingestPdfPages(
  fileName: string, pdf: PdfPagesInput, opts?: { projectId?: string; mimeType?: string; size?: number }
): Promise<{ document: OpenbenttDocument; version: DocumentVersion; duplicate: boolean; chunks: DocumentChunk[] }> {
  const joined = pdf.pages.map((p) => p.text).join("\n");
  const checksum = await sha256Hex(new TextEncoder().encode(`${fileName}\n${joined.slice(0, 50000)}`));
  const result = buildPdfContent(pdf.pages, pdf.totalPages, fileName, opts?.mimeType ?? "application/pdf", opts?.size ?? joined.length, { truncated: pdf.truncated });
  const existing = findDuplicate(checksum);
  const version = (existing?.version ?? 0) + 1;
  const { doc, versionRec } = buildDocument(
    { fileName, mimeType: opts?.mimeType ?? "application/pdf", text: joined, projectId: opts?.projectId },
    checksum, result, version, existing ? `${existing.id}@v${existing.version}` : undefined
  );
  const sections = detectSections(result.content);
  const content: DocumentContent = { ...result.content, sections };
  const chunks = result.status === "extracted" || result.status === "partial"
    ? chunkDocumentBlocks(content.blocks, { documentId: doc.id, documentVersionId: versionRec.id, projectId: opts?.projectId, paperId: doc.id })
    : [];
  registry.documents.set(doc.id, doc);
  registry.versions.set(versionRec.id, versionRec);
  registry.contents.set(doc.id, content);
  registry.chunks.set(doc.id, chunks);
  registry.byChecksum.set(checksum, doc.id);
  return { document: doc, version: versionRec, duplicate: Boolean(existing), chunks };
}

/** Controlled URL ingest: validate -> fetch -> extract -> ingest. */
export async function ingestUrl(
  rawUrl: string, fetchImpl?: typeof fetch, opts?: { projectId?: string }
): Promise<{ document: OpenbenttDocument; version: DocumentVersion; duplicate: boolean; chunks: DocumentChunk[] }> {
  const { url } = validateIngestUrl(rawUrl);
  const page = await fetchPageForIngest(url, fetchImpl);
  const { text, title, blocks } = extractHtmlArticle(page.html);
  if (!text.trim()) throw Object.assign(new Error("url-bad-content"), { code: "url-bad-content" });
  const host = new URL(page.finalUrl).hostname;
  const fileName = `${host}${new URL(page.finalUrl).pathname.replace(/\//g, "_").slice(0, 60) || "_index"}.html`;
  const checksum = await sha256Hex(new TextEncoder().encode(text));
  const enriched = enrichResearchMetadata(text, fileName, "url", page.finalUrl);
  const base: ExtractionResult = {
    sourceType: "url",
    content: {
      pages: text ? [{ pageNumber: 1, text, charCount: text.length, empty: false }] : [],
      sections: [], blocks, references: [],
    },
    metadata: mergeMetadata(
      {
        title: title ? { value: title, origin: "embedded" } : { value: fileName, origin: "filename" },
        mimeType: { value: "text/html", origin: "embedded" },
        fileSize: { value: page.html.length, origin: "embedded" },
        sourceUrl: { value: page.finalUrl, origin: "url" },
      },
      enriched
    ),
    status: "extracted",
  };
  const existing = findDuplicate(checksum);
  const version = (existing?.version ?? 0) + 1;
  const { doc, versionRec } = buildDocument(
    { fileName, mimeType: "text/html", text, projectId: opts?.projectId, sourceUrl: page.finalUrl },
    checksum, base, version, existing ? `${existing.id}@v${existing.version}` : undefined
  );
  const sections = detectSections(base.content);
  const content: DocumentContent = { ...base.content, sections };
  const chunks = chunkDocumentBlocks(content.blocks, {
    documentId: doc.id, documentVersionId: versionRec.id, projectId: opts?.projectId, paperId: doc.id,
  });
  registry.documents.set(doc.id, doc);
  registry.versions.set(versionRec.id, versionRec);
  registry.contents.set(doc.id, content);
  registry.chunks.set(doc.id, chunks);
  registry.byChecksum.set(checksum, doc.id);
  registry.staleIndex.add(doc.id);
  return { document: doc, version: versionRec, duplicate: Boolean(existing), chunks };
}

export function inspect(id: string): { document?: OpenbenttDocument; content?: DocumentContent; chunks?: DocumentChunk[] } {
  return { document: registry.documents.get(id), content: registry.contents.get(id), chunks: registry.chunks.get(id) };
}

export function markIndexed(documentId: string): void {
  registry.staleIndex.delete(documentId);
}

/** Index invalidation: never mix chunks across versions — stale chunks are dropped, not merged. */
export function invalidateDocument(documentId: string): void {
  registry.extractionCache.forEach((v, k) => {
    if (v.documentId === documentId) registry.extractionCache.delete(k);
  });
  registry.chunks.delete(documentId);
  registry.staleIndex.add(documentId);
  const doc = registry.documents.get(documentId);
  if (doc) {
    doc.status = "queued";
    doc.updatedAt = nowIso();
  }
}

export function deleteDocument(id: string): boolean {
  const doc = registry.documents.get(id);
  if (!doc) return false;
  invalidateDocument(id);
  registry.documents.delete(id);
  registry.contents.delete(id);
  registry.byChecksum.delete(doc.checksum);
  registry.staleIndex.delete(id);
  return true;
}

export function reindex(id: string): DocumentChunk[] {
  const doc = registry.documents.get(id);
  const content = registry.contents.get(id);
  if (!doc || !content) return [];
  const versionId = `${id}@v${doc.version}`;
  const chunks = chunkDocumentBlocks(content.blocks, {
    documentId: id, documentVersionId: versionId, projectId: doc.projectId, paperId: id,
  });
  registry.chunks.set(id, chunks);
  registry.staleIndex.add(id);
  return chunks;
}

/** Test seam: deterministic checksum helper + registry reset. */
export function checksumSyncForTest(text: string): string {
  return fnv1aHex(text);
}

export function resetRegistryForTest(): void {
  registry.documents.clear();
  registry.versions.clear();
  registry.contents.clear();
  registry.chunks.clear();
  registry.extractionCache.clear();
  registry.byChecksum.clear();
  registry.staleIndex.clear();
}

export function staleDocuments(): string[] {
  return [...registry.staleIndex];
}
