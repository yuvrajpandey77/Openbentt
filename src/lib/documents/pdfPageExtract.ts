/**
 * PDF page text + raster helpers for scanned-document OCR (renderer / pdf.js).
 */
import * as pdfjs from "pdfjs-dist";
import { DOCUMENT_LIMITS } from "@/lib/documents/limits";
import type { PdfPageInput } from "@/lib/documents/extractors";

const isVitest = import.meta.env.VITEST === true || import.meta.env.VITEST === "true";
if (!isVitest && typeof document !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
}

const LINE_Y_EPS = 4;

function layoutPageText(items: { str: string; x: number; y: number }[]): string {
  if (!items.length) return "";
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: string[] = [];
  let row: typeof items = [];
  let rowY: number | null = null;
  for (const it of sorted) {
    if (rowY === null || Math.abs(it.y - rowY) <= LINE_Y_EPS) {
      row.push(it);
      rowY = it.y;
    } else {
      row.sort((a, b) => a.x - b.x);
      lines.push(row.map((r) => r.str).join(""));
      row = [it];
      rowY = it.y;
    }
  }
  if (row.length) {
    row.sort((a, b) => a.x - b.x);
    lines.push(row.map((r) => r.str).join(""));
  }
  return lines.join("\n");
}

async function destroyPdfDocument(doc: { destroy?: () => Promise<void> } | null): Promise<void> {
  if (doc && typeof doc.destroy === "function") {
    try {
      await doc.destroy();
    } catch {
      /* ignore */
    }
  }
}

export async function extractPdfPageInputs(
  bytes: Uint8Array,
  maxPages: number = DOCUMENT_LIMITS.maxPages,
): Promise<{ pages: PdfPageInput[]; totalPages: number; truncated: boolean }> {
  const loading = pdfjs.getDocument({ data: bytes.slice(0) });
  let doc: Awaited<ReturnType<typeof loading.promise>> | null = null;
  try {
    doc = await loading.promise;
    const totalPages = doc.numPages;
    const n = Math.min(totalPages, maxPages);
    const pages: PdfPageInput[] = [];
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const items: { str: string; x: number; y: number }[] = [];
      for (const item of textContent.items) {
        if (!("str" in item) || typeof item.str !== "string") continue;
        const tr = item.transform;
        if (!Array.isArray(tr) || tr.length < 6) continue;
        items.push({ str: item.str, x: tr[4], y: tr[5] });
      }
      const text = layoutPageText(items);
      pages.push({ pageNumber: i, text, empty: !text.trim() });
    }
    return { pages, totalPages, truncated: totalPages > n };
  } finally {
    await destroyPdfDocument(doc);
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Rasterize one PDF page to PNG bytes (requires DOM canvas). */
export async function renderPdfPagePng(
  bytes: Uint8Array,
  pageNumber: number,
  scale = 1.5,
): Promise<Uint8Array> {
  if (typeof document === "undefined") {
    throw new Error("ocr-render-unavailable");
  }
  const loading = pdfjs.getDocument({ data: bytes.slice(0) });
  let doc: Awaited<ReturnType<typeof loading.promise>> | null = null;
  try {
    doc = await loading.promise;
    if (pageNumber < 1 || pageNumber > doc.numPages) throw new Error("page-out-of-range");
    const page = await doc.getPage(pageNumber);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ocr-render-unavailable");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("ocr-render-failed"))), "image/png");
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    await destroyPdfDocument(doc);
  }
}