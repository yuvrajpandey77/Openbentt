/**
 * Phase 2 — Canonical document intelligence representation.
 *
 * Minimal, extensible, additive. Does NOT replace ResearchPaper/CorpusChunk;
 * adapters map Document <-> ResearchPaper so existing workflows keep working.
 * No agents/MCP/connectors/auth. No new backend.
 */

/** Deterministic ingestion lifecycle. Every stage has an explicit status. */
export type DocumentStatus =
  | "queued"
  | "validating"
  | "extracting"
  | "normalizing"
  | "structuring"
  | "chunking"
  | "indexing"
  | "ready"
  | "needs-ocr"
  | "unsupported"
  | "failed";

export type ExtractionStatus = "extracted" | "partial" | "failed" | "ocr-required" | "unsupported";

export type DocumentSourceType =
  | "pdf"
  | "markdown"
  | "text"
  | "html"
  | "url"
  | "docx"
  | "pptx"
  | "xlsx"
  | "image"
  | "unknown";

export type MetadataOrigin =
  | "embedded"
  | "filename"
  | "user-provided"
  | "url"
  | "external"
  | "inferred";

export interface MetadataField<T> {
  value: T;
  origin: MetadataOrigin;
}

export interface DocumentMetadata {
  title?: MetadataField<string>;
  authors?: MetadataField<string>;
  publisher?: MetadataField<string>;
  language?: MetadataField<string>;
  createdDate?: MetadataField<string>;
  modifiedDate?: MetadataField<string>;
  pageCount?: MetadataField<number>;
  wordCount?: MetadataField<number>;
  charCount?: MetadataField<number>;
  mimeType?: MetadataField<string>;
  fileSize?: MetadataField<number>;
  checksum?: MetadataField<string>;
  sourceUrl?: MetadataField<string>;
  doi?: MetadataField<string>;
  arxivId?: MetadataField<string>;
  isbn?: MetadataField<string>;
  journal?: MetadataField<string>;
  conference?: MetadataField<string>;
  year?: MetadataField<string>;
}

export type BlockKind =
  | "paragraph"
  | "heading"
  | "list"
  | "table"
  | "code"
  | "quote"
  | "image"
  | "formula"
  | "caption"
  | "footnote"
  | "reference";

export interface DocumentBlock {
  id: string;
  kind: BlockKind;
  text: string;
  page?: number;
  sectionId?: string;
  level?: number;
  /** Structured table payload when kind === "table" (chunking uses text fallback). */
  table?: { columns: string[]; rows: string[][]; caption?: string; page?: number };
  figure?: { caption?: string; page?: number };
}

export interface DocumentPage {
  pageNumber: number;
  text: string;
  charCount: number;
  /** True when the page contributed no extractable glyphs (scan candidate). */
  empty: boolean;
}

export interface DocumentSection {
  id: string;
  title: string;
  level: number;
  page?: number;
  blockIds: string[];
}

export interface DocumentReference {
  id: string;
  text: string;
  page?: number;
  doi?: string;
  arxivId?: string;
}

export interface DocumentAsset {
  id: string;
  documentId: string;
  kind: "source" | "thumbnail" | "attachment";
  mimeType: string;
  size: number;
  /** Filesystem/desktop path or object URL; never inlined binary in the model. */
  uri?: string;
}

export interface OpenbenttDocument {
  id: string;
  title: string;
  source: string;
  sourceType: DocumentSourceType;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  /** SHA-256 hex of canonical source bytes (duplicate/version/cache identity). */
  checksum: string;
  /** Extractor implementation version that produced the cached extraction. */
  extractorVersion: string;
  metadata: DocumentMetadata;
  extractionStatus: ExtractionStatus;
  status: DocumentStatus;
  /** Safe, user-actionable failure code (never raw stack/paths). */
  errorCode?: string;
  errorDetail?: string;
  projectId?: string;
  version: number;
  previousVersionId?: string;
}

export interface DocumentContent {
  pages: DocumentPage[];
  sections: DocumentSection[];
  blocks: DocumentBlock[];
  references: DocumentReference[];
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  checksum: string;
  createdAt: string;
  source: string;
  extractorVersion: string;
  previousVersionId?: string;
}

export interface DocumentExtraction {
  documentId: string;
  versionId: string;
  extractor: string;
  extractorVersion: string;
  status: ExtractionStatus;
  content: DocumentContent;
  metadata: DocumentMetadata;
  createdAt: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  documentVersionId: string;
  paperId?: string;
  projectId?: string;
  page?: number;
  sectionId?: string;
  blockId?: string;
  chunkIndex: number;
  text: string;
  checksum: string;
}

/** Provenance chain — every retrieval result must carry one. */
export interface SourceRef {
  documentId: string;
  documentVersionId?: string;
  page?: number;
  section?: string;
  block?: string;
  chunkId: string;
  sourceType: DocumentSourceType;
  sourceUri?: string;
  title?: string;
}

export interface DocumentIndexRecord {
  documentId: string;
  versionId: string;
  chunkIds: string[];
  embeddingModel: string;
  indexedAt: string;
  stale: boolean;
}
