/** Extract plaintext from PDF in the browser (pdf.js). */
import * as pdfjs from "pdfjs-dist";
import { sanitizeDocumentTextForPrompt } from "@/lib/security/documentPromptGuard";

const isVitest = import.meta.env.VITEST === true || import.meta.env.VITEST === "true";
if (!isVitest) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
}

/** Chat composer attachment: text merged into the user message (balance context vs payload). */
export const MAX_CHARS_CHAT_PDF = 96_000;
export const MAX_PAGES_CHAT_PDF = 64;

/**
 * Notebook Source from PDF: markers + layout-aware text for Compile.
 * Higher than chat — user expects to work from extracted text here.
 */
export const MAX_CHARS_NOTEBOOK = 220_000;
export const MAX_PAGES_NOTEBOOK = 100;

/**
 * Notebook workspace **system assist** snapshot: must stay bounded for model context windows.
 * Full Source remains in the editor; this only limits what we repeat in the system prompt each turn.
 */
export const MAX_CHARS_ASSIST_SNAPSHOT = 96_000;

/** Cluster glyph runs onto the same line if baseline Y differs by at most this (PDF units). */
const LINE_Y_EPS = 4;

async function destroyPdfDocument(doc: { destroy?: () => Promise<void> } | null): Promise<void> {
  if (doc && typeof doc.destroy === "function") {
    try {
      await doc.destroy();
    } catch {
      /* ignore */
    }
  }
}

function layoutPageText(
  items: { str: string; x: number; y: number }[]
): string {
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

export async function extractTextFromPdfFile(
  file: File,
  maxChars: number = MAX_CHARS_CHAT_PDF,
  maxPages: number = MAX_PAGES_CHAT_PDF
): Promise<string> {
  const buf = await file.arrayBuffer();
  const loading = pdfjs.getDocument({ data: new Uint8Array(buf) });
  let doc: Awaited<ReturnType<typeof loading.promise>> | null = null;
  try {
    doc = await loading.promise;
    let out = "";
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n && out.length < maxChars; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const line = textContent.items
        .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
        .join(" ");
      out += line + "\n";
    }
    const raw = out.replace(/\s+\n/g, "\n").trim();
    const hitChar = raw.length > maxChars;
    let result = raw.slice(0, maxChars);
    if (doc.numPages > maxPages || hitChar) {
      result += `\n\n[Note: PDF text truncated for chat — up to ${maxPages} page(s) and ${maxChars.toLocaleString()} characters.]`;
    }
    return sanitizeDocumentTextForPrompt(result).text;
  } finally {
    await destroyPdfDocument(doc);
  }
}

/**
 * Notebook Source: layout-aware extraction with `--- PDF PAGE i / n ---` markers.
 * Preserves line breaks and reading order so edits track structure; Compile maps each block to an output page.
 */
async function pdfBytesFromInput(file: File | ArrayBuffer): Promise<Uint8Array> {
  if (file instanceof ArrayBuffer) return new Uint8Array(file.slice(0));
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf.slice(0));
}

export async function extractNotebookSourceFromPdf(
  file: File | ArrayBuffer,
  maxChars: number = MAX_CHARS_NOTEBOOK,
  maxPages: number = MAX_PAGES_NOTEBOOK
): Promise<string> {
  const buf = await pdfBytesFromInput(file);
  const loading = pdfjs.getDocument({ data: buf });
  let doc: Awaited<ReturnType<typeof loading.promise>> | null = null;
  try {
    doc = await loading.promise;
    const totalPages = doc.numPages;
    const n = Math.min(totalPages, maxPages);
    const parts: string[] = [];
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
      const body = layoutPageText(items);
      parts.push(`--- PDF PAGE ${i} / ${totalPages} ---\n\n${body}`);
      if (parts.join("\n\n").length >= maxChars) break;
    }
    let out = parts.join("\n\n");
    if (totalPages > maxPages) {
      out += `\n\n[Note: ${totalPages - maxPages} further page(s) not included (extract limit ${maxPages} pages).]`;
    }
    const lenBeforeSlice = out.length;
    out = out.slice(0, maxChars);
    if (lenBeforeSlice > maxChars) {
      out += `\n\n[Note: Source truncated at ${maxChars.toLocaleString()} characters — open Source to edit or paste more.]`;
    }
    return sanitizeDocumentTextForPrompt(out).text;
  } finally {
    await destroyPdfDocument(doc);
  }
}
