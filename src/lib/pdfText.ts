/** Extract plaintext from PDF in the browser (pdf.js). */

const MAX_CHARS_DEFAULT = 12000;
const MAX_PAGES = 24;
/** Notebook: reading-order lines + page markers (compile maps one output page per marker block). */
const MAX_CHARS_NOTEBOOK = 96_000;
const MAX_PAGES_NOTEBOOK = 40;
/** Cluster glyph runs onto the same line if baseline Y differs by at most this (PDF units). */
const LINE_Y_EPS = 4;

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

export async function extractTextFromPdfFile(file: File, maxChars = MAX_CHARS_DEFAULT): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const loading = pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) });
  const doc = await loading.promise;
  let out = "";
  const n = Math.min(doc.numPages, MAX_PAGES);
  for (let i = 1; i <= n && out.length < maxChars; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const line = textContent.items
      .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .join(" ");
    out += line + "\n";
  }
  return out.replace(/\s+\n/g, "\n").trim().slice(0, maxChars);
}

/**
 * Notebook Source: layout-aware extraction with `--- PDF PAGE i / n ---` markers.
 * Preserves line breaks and reading order so edits track structure; Compile maps each block to an output page.
 */
export async function extractNotebookSourceFromPdf(file: File, maxChars = MAX_CHARS_NOTEBOOK): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const loading = pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) });
  const doc = await loading.promise;
  const totalPages = doc.numPages;
  const n = Math.min(totalPages, MAX_PAGES_NOTEBOOK);
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
  if (totalPages > MAX_PAGES_NOTEBOOK) {
    out += `\n\n[Note: ${totalPages - MAX_PAGES_NOTEBOOK} further page(s) not included (extract limit ${MAX_PAGES_NOTEBOOK}).]`;
  }
  return out.slice(0, maxChars);
}
