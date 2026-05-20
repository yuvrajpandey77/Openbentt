/** Extract review comments from PDF annotation layers (pdf.js). Local-only. */

export interface PdfReviewNote {
  page: number;
  text: string;
  subtype?: string;
}

async function loadPdfDocument(buf: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const loading = pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) });
  return loading.promise;
}

function noteFromAnnotation(ann: Record<string, unknown>, page: number): PdfReviewNote | null {
  const subtype = typeof ann.subtype === "string" ? ann.subtype : undefined;
  const contents =
    (typeof ann.contents === "string" && ann.contents.trim()) ||
    (typeof ann.title === "string" && ann.title.trim()) ||
    (typeof ann.subject === "string" && ann.subject.trim()) ||
    "";
  if (contents.length < 4) return null;
  if (subtype === "Link" && contents.length < 12) return null;
  return { page, text: contents.trim(), subtype };
}

/** Read Text/Popup/FreeText annotations from up to `maxPages` pages. */
export async function extractPdfReviewAnnotations(
  buf: ArrayBuffer,
  maxPages = 64
): Promise<PdfReviewNote[]> {
  let doc: Awaited<ReturnType<typeof loadPdfDocument>> | null = null;
  try {
    doc = await loadPdfDocument(buf);
    const notes: PdfReviewNote[] = [];
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const annotations = (await page.getAnnotations()) as Record<string, unknown>[];
      for (const ann of annotations) {
        const note = noteFromAnnotation(ann, i);
        if (note) notes.push(note);
      }
    }
    const seen = new Set<string>();
    return notes.filter((n) => {
      const key = `${n.page}:${n.text.slice(0, 80)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } finally {
    if (doc && typeof doc.destroy === "function") {
      try {
        await doc.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}

export function pdfReviewNotesToCommentText(notes: PdfReviewNote[]): string {
  return notes.map((n, i) => `${i + 1}. [p.${n.page}] ${n.text}`).join("\n\n");
}
