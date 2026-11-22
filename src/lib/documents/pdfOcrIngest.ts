/**
 * Research / notebook PDF ingest with optional desktop OCR when glyphs are missing.
 * Ensures callers pass pdfBytes into ingestPdfPages so scanned PDFs leave needs-ocr.
 */
import { extractNotebookSourceFromPdf } from "@/lib/pdfText";
import { extractPdfPageInputs } from "@/lib/documents/pdfPageExtract";
import { isOcrRequired, canRetryOcr, ocrPdfBytes } from "@/lib/documents/ocr";
import { ingestPdfPages } from "@/lib/documents/service";
import type { DocumentPage } from "@/lib/documents/types";

function formatNotebookPages(
  pages: { pageNumber: number; text: string }[],
  totalPages: number,
): string {
  return pages
    .map((p) => `--- PDF PAGE ${p.pageNumber} / ${totalPages} ---\n\n${p.text.trim()}`)
    .join("\n\n");
}

export async function extractResearchPdfWithOcr(
  buf: ArrayBuffer,
  fileName: string,
  opts?: { projectId?: string },
): Promise<{ text: string; ocrApplied: boolean; ocrAvailable: boolean }> {
  const bytes = new Uint8Array(buf.slice(0));
  const glyphText = await extractNotebookSourceFromPdf(buf);
  const { pages, totalPages, truncated } = await extractPdfPageInputs(bytes);
  const docPages: DocumentPage[] = pages.map((p) => ({
    pageNumber: p.pageNumber,
    text: p.text,
    charCount: p.text.length,
    empty: p.empty,
  }));

  let text = glyphText;
  let ocrApplied = false;
  const ocrAvailable = await canRetryOcr(docPages, totalPages);

  if (isOcrRequired(docPages, totalPages) && ocrAvailable) {
    try {
      const ocrPages = await ocrPdfBytes(bytes);
      const joined = ocrPages.map((p) => p.text.trim()).join("").length;
      if (joined > 0) {
        text = formatNotebookPages(
          ocrPages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
          totalPages,
        );
        ocrApplied = true;
      }
    } catch {
      /* keep glyph text; ingest below still records needs-ocr */
    }
  }

  // Always register in the documents store with raw bytes so OCR can retry later.
  try {
    await ingestPdfPages(
      fileName,
      { pages, totalPages, truncated },
      {
        projectId: opts?.projectId,
        mimeType: "application/pdf",
        size: bytes.byteLength,
        pdfBytes: bytes,
      },
    );
  } catch {
    /* research corpus path still succeeds with extracted text */
  }

  return { text, ocrApplied, ocrAvailable };
}
