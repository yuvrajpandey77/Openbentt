/**
 * Phase 2 — OCR abstraction (foundation, not a platform).
 * No OCR engine is bundled (no tesseract dependency); scanned documents are
 * detected and exposed as an explicit `ocr-required` state. A future local or
 * remote provider implements OcrProvider without touching the document model.
 */
import type { DocumentPage } from "@/lib/documents/types";

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
