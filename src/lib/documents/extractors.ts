/**
 * Phase 2 — Extraction boundary.
 * interface DocumentExtractor { supports, extract }. Only formats supportable
 * reliably + locally are implemented. No new dependencies (office uses jszip).
 */
import { DOCUMENT_LIMITS } from "@/lib/documents/limits";
import type {
  DocumentBlock, DocumentContent, DocumentMetadata, DocumentSourceType, ExtractionStatus,
} from "@/lib/documents/types";
import { isOcrRequired } from "@/lib/documents/ocr";
import { extractDocx, extractPptx, extractXlsx, isOfficeKind } from "@/lib/documents/officeExtract";

export const EXTRACTOR_VERSION = "doc-extract-v1";

export interface ExtractorInput {
  fileName: string;
  mimeType: string;
  bytes?: Uint8Array;
  text?: string;
}

export interface ExtractionResult {
  sourceType: DocumentSourceType;
  content: DocumentContent;
  metadata: DocumentMetadata;
  status: ExtractionStatus;
  pageCount?: number;
}

export interface DocumentExtractor {
  readonly name: string;
  supports(input: ExtractorInput): boolean;
  extract(input: ExtractorInput): Promise<ExtractionResult>;
}

function baseMeta(fileName: string, mime: string, size: number): DocumentMetadata {
  return {
    title: { value: fileName.replace(/\.[^.]+$/, "") || fileName, origin: "filename" },
    mimeType: { value: mime, origin: "filename" },
    fileSize: { value: size, origin: "embedded" },
  };
}

function pagesForText(full: string): DocumentContent["pages"] {
  if (!full.trim()) return [];
  return [{ pageNumber: 1, text: full, charCount: full.length, empty: false }];
}

export class PlainTextExtractor implements DocumentExtractor {
  readonly name = "plaintext";
  supports(i: ExtractorInput): boolean {
    return i.mimeType === "text/plain" || /\.txt$/i.test(i.fileName);
  }
  async extract(i: ExtractorInput): Promise<ExtractionResult> {
    const raw = i.text ?? (i.bytes ? new TextDecoder().decode(i.bytes.slice(0, DOCUMENT_LIMITS.maxExtractedChars * 4)) : "");
    const text = raw.replace(/\r\n/g, "\n").slice(0, DOCUMENT_LIMITS.maxExtractedChars);
    const lines = text.split("\n");
    const blocks: DocumentBlock[] = lines.filter((l) => l.trim()).slice(0, DOCUMENT_LIMITS.maxBlocks)
      .map((line, idx) => ({ id: `b${idx}`, kind: "paragraph" as const, text: line.slice(0, 8000) }));
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return {
      sourceType: "text",
      content: { pages: pagesForText(text), sections: [], blocks, references: [] },
      metadata: {
        ...baseMeta(i.fileName, "text/plain", i.bytes?.length ?? text.length),
        wordCount: { value: words, origin: "inferred" },
        charCount: { value: text.length, origin: "inferred" },
      },
      status: "extracted",
    };
  }
}

const MD_TABLE_SEP = /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/;

export class MarkdownExtractor implements DocumentExtractor {
  readonly name = "markdown";
  supports(i: ExtractorInput): boolean {
    return i.mimeType === "text/markdown" || /\.(md|markdown)$/i.test(i.fileName);
  }
  async extract(i: ExtractorInput): Promise<ExtractionResult> {
    const raw = i.text ?? (i.bytes ? new TextDecoder().decode(i.bytes.slice(0, DOCUMENT_LIMITS.maxExtractedChars * 4)) : "");
    const text = raw.replace(/\r\n/g, "\n").slice(0, DOCUMENT_LIMITS.maxExtractedChars);
    const lines = text.split("\n");
    const blocks: DocumentBlock[] = [];
    let bi = 0;
    let j = 0;
    while (j < lines.length && blocks.length < DOCUMENT_LIMITS.maxBlocks) {
      const line = lines[j];
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        blocks.push({ id: `b${bi++}`, kind: "heading", text: heading[2].trim().slice(0, 2000), level: heading[1].length });
        j++;
        continue;
      }
      if (/^```/.test(line)) {
        const buf: string[] = [];
        j++;
        while (j < lines.length && !/^```/.test(lines[j])) { buf.push(lines[j]); j++; }
        j++;
        blocks.push({ id: `b${bi++}`, kind: "code", text: buf.join("\n").slice(0, 8000) });
        continue;
      }
      if (/^\s*>\s?/.test(line)) {
        const buf: string[] = [];
        while (j < lines.length && /^\s*>\s?/.test(lines[j])) { buf.push(lines[j].replace(/^\s*>\s?/, "")); j++; }
        blocks.push({ id: `b${bi++}`, kind: "quote", text: buf.join("\n").slice(0, 8000) });
        continue;
      }
      // Markdown table: header row + separator row + body rows.
      if (line.includes("|") && j + 1 < lines.length && MD_TABLE_SEP.test(lines[j + 1])) {
        const splitRow = (r: string): string[] =>
          r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).slice(0, DOCUMENT_LIMITS.maxTableCols);
        const columns = splitRow(line);
        const rows: string[][] = [];
        j += 2;
        while (j < lines.length && lines[j].includes("|") && rows.length < DOCUMENT_LIMITS.maxTableRows) {
          rows.push(splitRow(lines[j]));
          j++;
        }
        blocks.push({
          id: `b${bi++}`, kind: "table",
          text: [columns.join(" | "), ...rows.map((r) => r.join(" | "))].join("\n").slice(0, 12000),
          table: { columns, rows },
        });
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const buf: string[] = [];
        while (j < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[j]) || /^\s{2,}\S/.test(lines[j]))) {
          buf.push(lines[j].trim());
          j++;
        }
        blocks.push({ id: `b${bi++}`, kind: "list", text: buf.join("\n").slice(0, 8000) });
        continue;
      }
      if (!line.trim()) { j++; continue; }
      const buf: string[] = [line.trim()];
      j++;
      while (j < lines.length && lines[j].trim() && !/^(#{1,6}\s|```|>|(\s*([-*+]|\d+[.)])\s+))/.test(lines[j]) && !(lines[j].includes("|") && j + 1 < lines.length && MD_TABLE_SEP.test(lines[j + 1]))) {
        buf.push(lines[j].trim());
        j++;
      }
      blocks.push({ id: `b${bi++}`, kind: "paragraph", text: buf.join(" ").slice(0, 8000) });
    }
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return {
      sourceType: "markdown",
      content: { pages: pagesForText(text), sections: [], blocks, references: [] },
      metadata: {
        ...baseMeta(i.fileName, "text/markdown", i.bytes?.length ?? text.length),
        wordCount: { value: words, origin: "inferred" },
        charCount: { value: text.length, origin: "inferred" },
      },
      status: "extracted",
    };
  }
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}

/** Controlled HTML extraction: script/style/nav boilerplate reduction, no code execution. */
export function extractHtmlArticle(html: string): { text: string; title?: string; blocks: DocumentBlock[] } {
  let doc = String(html ?? "").slice(0, DOCUMENT_LIMITS.maxUrlResponseBytes * 2);
  const title = /<title[^>]*>([\s\S]{1,500}?)<\/title>/i.exec(doc)?.[1]?.trim();
  doc = doc.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ").replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const blocks: DocumentBlock[] = [];
  let bi = 0;
  const push = (kind: DocumentBlock["kind"], text: string, extra?: Partial<DocumentBlock>) => {
    const t = decodeEntities(text.replace(/\s+/g, " ").trim()).slice(0, 8000);
    if (!t) return;
    blocks.push({ id: `b${bi++}`, kind, text: t, ...extra });
  };
  // Headings / paragraphs / list items / table cells in document order (best-effort regex pass).
  const re = /<(h[1-6]|p|li|td|th|pre|blockquote)[^>]*>([\s\S]{1,8000}?)(?:<\/\1>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null && blocks.length < DOCUMENT_LIMITS.maxBlocks) {
    const tag = m[1].toLowerCase();
    const inner = decodeEntities(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!inner || inner.length < 2) continue;
    if (/^h[1-6]$/.test(tag)) push("heading", inner, { level: Number(tag[1]) });
    else if (tag === "li") push("list", inner);
    else if (tag === "pre") push("code", inner);
    else if (tag === "blockquote") push("quote", inner);
    else if (tag === "td" || tag === "th") push("paragraph", inner);
    else push("paragraph", inner);
  }
  const text = blocks.map((b) => b.text).join("\n\n").slice(0, DOCUMENT_LIMITS.maxExtractedChars);
  return { text, title: title ? decodeEntities(title.replace(/\s+/g, " ").trim()).slice(0, 300) : undefined, blocks };
}

export class HtmlExtractor implements DocumentExtractor {
  readonly name = "html";
  supports(i: ExtractorInput): boolean {
    return i.mimeType === "text/html" || /\.(html?|xhtml)$/i.test(i.fileName);
  }
  async extract(i: ExtractorInput): Promise<ExtractionResult> {
    const raw = i.text ?? (i.bytes ? new TextDecoder().decode(i.bytes.slice(0, DOCUMENT_LIMITS.maxUrlResponseBytes)) : "");
    const { text, title, blocks } = extractHtmlArticle(raw);
    if (!text.trim()) {
      return {
        sourceType: "html",
        content: { pages: [], sections: [], blocks: [], references: [] },
        metadata: baseMeta(i.fileName, "text/html", i.bytes?.length ?? raw.length),
        status: "failed",
      };
    }
    return {
      sourceType: "html",
      content: { pages: pagesForText(text), sections: [], blocks, references: [] },
      metadata: {
        ...baseMeta(i.fileName, "text/html", i.bytes?.length ?? raw.length),
        ...(title ? { title: { value: title, origin: "embedded" as const } } : {}),
        wordCount: { value: text.trim().split(/\s+/).length, origin: "inferred" },
        charCount: { value: text.length, origin: "inferred" },
      },
      status: "extracted",
    };
  }
}

export class ImageExtractor implements DocumentExtractor {
  readonly name = "image";
  supports(i: ExtractorInput): boolean {
    return i.mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(i.fileName);
  }
  async extract(i: ExtractorInput): Promise<ExtractionResult> {
    // Phase 2: figures are registered with location, not understood (vision is later).
    return {
      sourceType: "image",
      content: {
        pages: [],
        sections: [],
        blocks: [{ id: "b0", kind: "image", text: `[image: ${i.fileName}]` }],
        references: [],
      },
      metadata: baseMeta(i.fileName, i.mimeType || "image/png", i.bytes?.length ?? 0),
      status: "unsupported",
    };
  }
}

export class OfficeExtractor implements DocumentExtractor {
  readonly name = "office";
  supports(i: ExtractorInput): boolean {
    return isOfficeKind(i.fileName) !== null;
  }
  async extract(i: ExtractorInput): Promise<ExtractionResult> {
    if (!i.bytes) throw new Error("malformed");
    if (i.bytes.length > DOCUMENT_LIMITS.maxFileBytes) throw new Error("too-large");
    const kind = isOfficeKind(i.fileName);
    try {
      if (kind === "docx") {
        const r = await extractDocx(i.bytes, i.fileName);
        return { sourceType: "docx", ...r, status: "extracted" as const };
      }
      if (kind === "pptx") {
        const r = await extractPptx(i.bytes, i.fileName);
        return { sourceType: "pptx", ...r, status: "extracted" as const };
      }
      const r = await extractXlsx(i.bytes, i.fileName);
      return { sourceType: "xlsx", ...r, status: "extracted" as const };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "archive-traversal" || msg === "archive-too-large" || msg === "malformed" || msg === "too-large") throw err;
      throw new Error("malformed");
    }
  }
}

export interface PdfPageInput { pageNumber: number; text: string; empty: boolean }

/**
 * PDF intelligence wrapper: callers pass per-page text already extracted by the
 * existing pdfjs pipeline (src/lib/pdfText.ts — unchanged). This layer adds
 * page spans, heading/reference detection, coordinates-free structure, and an
 * explicit extracted|partial|failed|ocr-required status. Scanned PDFs are never
 * reported as fully extracted.
 */
export function buildPdfContent(
  pages: PdfPageInput[],
  totalPages: number,
  fileName: string,
  mime: string,
  size: number,
  opts?: { truncated?: boolean }
): ExtractionResult {
  const contentPages = pages.map((p) => ({
    pageNumber: p.pageNumber, text: p.text, charCount: p.text.length, empty: p.empty,
  }));
  if (!pages.length || pages.every((p) => !p.text.trim())) {
    return {
      sourceType: "pdf",
      content: { pages: [], sections: [], blocks: [], references: [] },
      metadata: baseMeta(fileName, mime || "application/pdf", size),
      status: "ocr-required",
      pageCount: totalPages,
    };
  }
  const ocrNeeded = isOcrRequired(
    contentPages.map((p) => ({ pageNumber: p.pageNumber, text: p.text, charCount: p.charCount, empty: p.empty })),
    totalPages
  );
  const blocks: DocumentBlock[] = [];
  let bi = 0;
  for (const p of pages) {
    for (const line of p.text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 400)) {
      const refLike = /^\s*\[\d+\]/.test(line);
      const headingLike = line.length < 120 && (/^(abstract|introduction|background|methods?|methodology|results?|discussion|conclusion|references|acknowledg(e)?ments?)\b/i.test(line) || (/^[A-Z][A-Z\s\-:]{4,80}$/.test(line) && line.split(" ").length <= 10));
      blocks.push({
        id: `b${bi++}`, kind: refLike ? "reference" : headingLike ? "heading" : "paragraph",
        text: line.slice(0, 4000), page: p.pageNumber,
        ...(headingLike ? { level: 2 } : {}),
      });
      if (blocks.length > DOCUMENT_LIMITS.maxBlocks) break;
    }
  }
  const references = blocks.filter((b) => b.kind === "reference").slice(0, 300).map((b, idx) => {
    const doi = /10\.\d{4,9}\/[^\s"<>]+/.exec(b.text)?.[0];
    return { id: `ref${idx}`, text: b.text.slice(0, 2000), page: b.page, ...(doi ? { doi } : {}) };
  });
  const partial = Boolean(opts?.truncated) || totalPages > pages.length || ocrNeeded;
  const fullText = pages.map((p) => p.text).join("\n\n");
  return {
    sourceType: "pdf",
    content: { pages: contentPages, sections: [], blocks, references },
    metadata: {
      ...baseMeta(fileName, mime || "application/pdf", size),
      pageCount: { value: totalPages, origin: "embedded" },
      wordCount: { value: fullText.trim() ? fullText.trim().split(/\s+/).length : 0, origin: "inferred" },
      charCount: { value: fullText.length, origin: "inferred" },
    },
    status: partial ? "partial" : "extracted",
    pageCount: totalPages,
  };
}

export const DEFAULT_EXTRACTORS: DocumentExtractor[] = [
  new MarkdownExtractor(),
  new PlainTextExtractor(),
  new HtmlExtractor(),
  new OfficeExtractor(),
  new ImageExtractor(),
];

export function pickExtractor(input: ExtractorInput): DocumentExtractor | null {
  for (const e of DEFAULT_EXTRACTORS) {
    try {
      if (e.supports(input)) return e;
    } catch { /* ignore */ }
  }
  return null;
}
