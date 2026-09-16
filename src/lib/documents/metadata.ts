/**
 * Phase 2 — Normalized metadata extraction. Never fabricates: every field
 * carries an origin; "inferred" is never presented as authoritative.
 * Extends (not replaces) inferPdfMetadata used by ResearchPaper.
 */
import type { DocumentMetadata, DocumentSourceType } from "@/lib/documents/types";

const DOI_RE = /10\.\d{4,9}\/[^\s"<>]+/;
const ARXIV_RE = /(?:arxiv[\s:]*|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5}(?:v\d+)?)/i;
const YEAR_RE = /\b((?:19|20)\d{2})\b/;

export function enrichResearchMetadata(
  fullText: string,
  fileName: string,
  sourceType: DocumentSourceType,
  sourceUrl?: string
): Partial<DocumentMetadata> {
  const out: Partial<DocumentMetadata> = {};
  const head = fullText.slice(0, 4000);
  const doi = DOI_RE.exec(head)?.[0]?.replace(/[).;,]+$/, "");
  if (doi) out.doi = { value: doi, origin: "inferred" };
  const arxiv = ARXIV_RE.exec(head)?.[1];
  if (arxiv) out.arxivId = { value: arxiv, origin: "inferred" };
  if (sourceType === "pdf" || sourceType === "markdown" || sourceType === "text") {
    const lines = head.split("\n").map((l) => l.trim())
      .filter((l) => l.length >= 8 && l.length <= 200 && !l.startsWith("--- PDF PAGE") && !l.startsWith("[Note:"));
    if (lines[0]) out.title = { value: lines[0].slice(0, 300), origin: "inferred" };
    if (lines[1] && (lines[1].includes(",") || / and /i.test(lines[1]))) {
      out.authors = { value: lines[1].slice(0, 500), origin: "inferred" };
    }
    const year = YEAR_RE.exec(head)?.[1];
    if (year) out.year = { value: year, origin: "inferred" };
  }
  if (sourceUrl) out.sourceUrl = { value: sourceUrl, origin: "url" };
  if (!out.title) {
    const stem = fileName.replace(/\.[^.]+$/, "") || fileName;
    if (stem) out.title = { value: stem.slice(0, 300), origin: "filename" };
  }
  return out;
}

/** Merge precedence: embedded > user-provided > url > filename > inferred. */
const RANK = { embedded: 5, "user-provided": 4, url: 3, filename: 2, external: 2, inferred: 1 } as const;

export function mergeMetadata(
  base: DocumentMetadata,
  overlay: Partial<DocumentMetadata>
): DocumentMetadata {
  const out: DocumentMetadata = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (!v) continue;
    const key = k as keyof DocumentMetadata;
    const cur = out[key] as { origin: keyof typeof RANK } | undefined;
    const nxt = v as { origin: keyof typeof RANK };
    if (!cur || RANK[nxt.origin] >= RANK[cur.origin]) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}
