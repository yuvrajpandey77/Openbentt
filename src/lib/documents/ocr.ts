/**
 * Phase 2 — OCR abstraction. Desktop uses system tesseract via IPC when available.
 */
import type { DocumentPage } from "@/lib/documents/types";
import { getDesktopApi } from "@/lib/desktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { DOCUMENT_LIMITS } from "@/lib/documents/limits";
import type { PdfPageInput } from "@/lib/documents/extractors";
import { extractPdfPageInputs, renderPdfPagePng, bytesToBase64 } from "@/lib/documents/pdfPageExtract";

export interface OcrResult {
  text: string;
  pages: { pageNumber: number; text: string }[];
  confidence?: number;
}

export interface OcrProvider {
  readonly name: string;
  supports(mimeType: string): boolean;
  recognize(input: Uint8Array | string, mimeType: string): Promise<OcrResult>;
}

/** Heuristic: many pages but (almost) no extractable glyphs => likely scanned. */
export function isOcrRequired(pages: DocumentPage[], totalPages: number): boolean {
  if (totalPages <= 0) return false;
  const chars = pages.reduce((n, p) => n + (p.text.trim().length || 0), 0);
  const emptyPages = pages.filter((p) => p.empty).length;
  if (totalPages >= 1 && chars === 0) return true;
  if (totalPages >= 3 && chars < totalPages * 20) return true;
  if (pages.length > 0 && emptyPages / pages.length > 0.8 && chars < 500) return true;
  return false;
}

/** Default provider: explicitly unavailable — never fakes OCR output. */
export class UnavailableOcrProvider implements OcrProvider {
  readonly name = "unavailable";
  supports(): boolean { return false; }
  async recognize(): Promise<OcrResult> {
    throw new Error("OCR unavailable: no local OCR provider installed (ocr-required)");
  }
}

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

export class LocalOcrProvider implements OcrProvider {
  readonly name = "local-tesseract";

  supports(mimeType: string): boolean {
    return IMAGE_MIMES.has(mimeType.toLowerCase()) || mimeType === "application/pdf";
  }

  async recognize(input: Uint8Array | string, mimeType: string): Promise<OcrResult> {
    const api = getDesktopApi();
    if (!api?.documentsOcr) {
      throw new Error("OCR unavailable: no local OCR provider installed (ocr-required)");
    }
    const status = await api.documentsOcrStatus?.().catch(() => ({ available: false }));
    if (!status?.available) {
      throw new Error("OCR unavailable: tesseract not installed (tesseract-not-installed)");
    }
    if (mimeType === "application/pdf" && input instanceof Uint8Array) {
      const pages = await ocrPdfBytes(input, this);
      const text = pages.map((p) => p.text).join("\n\n");
      return { text, pages: pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })) };
    }
    if (typeof input === "string") {
      return api.documentsOcr({ imagePath: input });
    }
    if (!(input instanceof Uint8Array)) {
      throw new Error("Invalid OCR input");
    }
    return api.documentsOcr({ dataBase64: bytesToBase64(input), mimeType });
  }
}

let cachedProvider: OcrProvider | null | undefined;

export async function getOcrProvider(): Promise<OcrProvider> {
  if (cachedProvider) return cachedProvider;
  if (isDesktopApp() && getDesktopApi()?.documentsOcr) {
    cachedProvider = new LocalOcrProvider();
    return cachedProvider;
  }
  cachedProvider = new UnavailableOcrProvider();
  return cachedProvider;
}

export function resetOcrProviderCacheForTest(): void {
  cachedProvider = undefined;
}

export async function ocrPdfBytes(pdfBytes: Uint8Array, provider?: OcrProvider): Promise<PdfPageInput[]> {
  const prov = provider ?? await getOcrProvider();
  if (!prov.supports("application/pdf")) {
    throw new Error("OCR unavailable: no local OCR provider installed (ocr-required)");
  }
  const { totalPages } = await extractPdfPageInputs(pdfBytes, 1);
  const maxPages = Math.min(totalPages, DOCUMENT_LIMITS.maxPages);
  const api = getDesktopApi();
  if (!api?.documentsOcr) throw new Error("OCR unavailable: desktop API missing");

  const batch: { pageNumber: number; dataBase64: string; mimeType: string }[] = [];
  for (let i = 1; i <= maxPages; i++) {
    const png = await renderPdfPagePng(pdfBytes, i);
    batch.push({ pageNumber: i, dataBase64: bytesToBase64(png), mimeType: "image/png" });
  }
  const result = await api.documentsOcr({ pages: batch });
  return result.pages.map((p) => ({
    pageNumber: p.pageNumber,
    text: p.text,
    empty: !p.text.trim(),
  }));
}

export async function canRetryOcr(pages: DocumentPage[], totalPages: number): Promise<boolean> {
  if (!isOcrRequired(pages, totalPages)) return false;
  if (!isDesktopApp()) return false;
  const api = getDesktopApi();
  if (!api?.documentsOcr) return false;
  const status = await api.documentsOcrStatus?.().catch(() => ({ available: false }));
  return Boolean(status?.available);
}