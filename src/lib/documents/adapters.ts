/**
 * Phase F — DocumentAdapter: ONE ingestion abstraction over the existing
 * format extractors (pdf handled by its own path; office/text/md/html here).
 *
 * Original files stay intact; only derived text/metadata enter the corpus.
 * Capabilities report honestly what each adapter extracts.
 */
import { pickExtractor } from "@/lib/documents/extractors";

export interface AdapterCapabilities {
  text: boolean;
  metadata: boolean;
  structure: boolean;
  tables: boolean;
  images: boolean;
  references: boolean;
  preview: boolean;
}

export interface IngestedDocument {
  fileName: string;
  sourceType: string;
  text: string;
  title?: string;
  pageCount?: number;
  provenance: { adapter: string; version: string; at: string };
}

const VERSION = "doc-adapter-v1";

export function canHandle(fileName: string, mimeType = ""): boolean {
  if (/\.pdf$/i.test(fileName)) return true; // dedicated pdf path
  try {
    return pickExtractor({ fileName, mimeType }) !== null;
  } catch {
    return false;
  }
}

export function adapterCapabilities(fileName: string): AdapterCapabilities {
  const base = { text: false, metadata: false, structure: false, tables: false, images: false, references: false, preview: false };
  if (/\.pdf$/i.test(fileName)) {
    return { ...base, text: true, metadata: true, structure: true, preview: true };
  }
  if (/\.(docx|pptx|xlsx)$/i.test(fileName)) {
    return { ...base, text: true, metadata: true, structure: true, tables: /\.xlsx$/i.test(fileName) };
  }
  if (/\.(md|markdown|txt|text|html?|csv|tsv|json|tex|bib)$/i.test(fileName)) {
    return { ...base, text: true, structure: /\.(md|markdown|html?)$/i.test(fileName) };
  }
  return base;
}

export async function ingestFile(args: {
  fileName: string;
  mimeType?: string;
  bytes?: Uint8Array;
  text?: string;
}): Promise<IngestedDocument | null> {
  const mime = args.mimeType ?? "";
  let extractor;
  try {
    extractor = pickExtractor({ fileName: args.fileName, mimeType: mime, bytes: args.bytes, text: args.text });
  } catch {
    return null;
  }
  if (!extractor) return null;
  const res = await extractor.extract({ fileName: args.fileName, mimeType: mime, bytes: args.bytes, text: args.text });
  const pages = res.content?.pages ?? [];
  const text = pages.map((p) => p.text).join("\n\n").slice(0, 200000).trim();
  if (!text) return null;
  return {
    fileName: args.fileName,
    sourceType: String(res.sourceType ?? "unknown"),
    text,
    title: res.metadata?.title?.value,
    pageCount: res.pageCount ?? pages.length ?? 1,
    provenance: { adapter: extractor.name, version: VERSION, at: new Date().toISOString() },
  };
}

/** Upload accept string for research ingestion (originals preserved). */
export const RESEARCH_ACCEPT =
  ".pdf,.docx,.pptx,.xlsx,.md,.markdown,.txt,.text,.html,.htm,.csv,.tsv,.json,.tex,.bib,application/pdf";
