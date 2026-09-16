/**
 * Phase 2 — Bounded resource behavior for document processing.
 * Mirrors the philosophy of pdfText caps + projectLimits; additive only.
 */
export const DOCUMENT_LIMITS = {
  maxFileBytes: 48 * 1024 * 1024,
  maxPages: 100,
  maxExtractedChars: 220_000,
  maxUrlResponseBytes: 2 * 1024 * 1024,
  maxTableCols: 50,
  maxTableRows: 500,
  maxArchiveFiles: 200,
  maxArchiveExpandedBytes: 64 * 1024 * 1024,
  maxBlocks: 5000,
  urlFetchTimeoutMs: 15_000,
  maxRedirects: 3,
} as const;

export type DocumentErrorCode =
  | "unsupported-type"
  | "too-large"
  | "too-many-pages"
  | "malformed"
  | "archive-traversal"
  | "archive-too-large"
  | "ocr-required"
  | "url-blocked"
  | "url-timeout"
  | "url-too-large"
  | "url-bad-content"
  | "extraction-failed";

export function userMessageForCode(code: DocumentErrorCode): string {
  switch (code) {
    case "unsupported-type": return "This file type is not supported yet.";
    case "too-large": return "This file exceeds the size limit and was not imported.";
    case "too-many-pages": return "This document has more pages than can be processed; only the first pages were kept.";
    case "malformed": return "This file appears damaged and could not be read.";
    case "archive-traversal": return "This office file contains unsafe internal paths and was rejected.";
    case "archive-too-large": return "This office file expands to more data than can be safely processed.";
    case "ocr-required": return "This looks like a scanned document. OCR is not available yet — the document is kept but not indexed.";
    case "url-blocked": return "This URL was blocked (only public HTTPS pages can be imported).";
    case "url-timeout": return "Fetching this URL timed out.";
    case "url-too-large": return "This page is larger than the import limit.";
    case "url-bad-content": return "This URL did not return an importable HTML page.";
    case "extraction-failed": return "Text extraction failed. You can retry the import.";
    default: return "Document import failed. You can retry.";
  }
}
