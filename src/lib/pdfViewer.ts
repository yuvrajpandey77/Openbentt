/** Single-page PDF viewer utilities (pdf.js) — desktop notebook studio. */

export type PdfDocumentHandle = {
  numPages: number;
  destroy: () => Promise<void>;
};

type PdfJsDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfJsPage>;
  destroy?: () => Promise<void>;
};

type PdfJsPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => PdfRenderTask;
  getTextContent?: () => Promise<{ items: Array<{ str?: string }> }>;
};

type PdfRenderTask = {
  promise: Promise<void>;
  cancel: () => void;
};

const activeCanvasRenders = new WeakMap<HTMLCanvasElement, PdfRenderTask>();

function isRenderingCancelled(err: unknown): boolean {
  if (err && typeof err === "object" && "name" in err) {
    return (err as { name: string }).name === "RenderingCancelledException";
  }
  return false;
}

/** Cancel any in-flight pdf.js render on this canvas (safe to call before a new render). */
export function cancelCanvasRender(canvas: HTMLCanvasElement): void {
  activeCanvasRenders.get(canvas)?.cancel();
  activeCanvasRenders.delete(canvas);
}

async function renderPageToCanvas(
  page: PdfJsPage,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<{ width: number; height: number }> {
  cancelCanvasRender(canvas);

  const vp = page.getViewport({ scale });
  canvas.width = vp.width;
  canvas.height = vp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  const task = page.render({ canvasContext: ctx, viewport: vp });
  activeCanvasRenders.set(canvas, task);

  try {
    await task.promise;
  } catch (err) {
    if (isRenderingCancelled(err)) {
      return { width: vp.width, height: vp.height };
    }
    throw err;
  } finally {
    if (activeCanvasRenders.get(canvas) === task) {
      activeCanvasRenders.delete(canvas);
    }
  }

  return { width: vp.width, height: vp.height };
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  return pdfjs;
}

export async function openPdfDocument(data: ArrayBuffer): Promise<{ doc: PdfJsDoc; handle: PdfDocumentHandle }> {
  const pdfjs = await loadPdfJs();
  const copy = data.slice(0);
  const loading = pdfjs.getDocument({ data: new Uint8Array(copy) });
  const doc = (await loading.promise) as PdfJsDoc;
  return {
    doc,
    handle: {
      numPages: doc.numPages,
      destroy: async () => {
        try {
          await doc.destroy?.();
        } catch {
          /* ignore */
        }
      },
    },
  };
}

export async function renderPdfPage(
  doc: PdfJsDoc,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageNum);
  return renderPageToCanvas(page, canvas, scale);
}

export async function renderPdfThumbnail(
  doc: PdfJsDoc,
  pageNum: number,
  canvas: HTMLCanvasElement,
  maxWidth = 72
): Promise<void> {
  const page = await doc.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  const scale = maxWidth / base.width;
  await renderPageToCanvas(page, canvas, scale);
}

export function computeFitWidthScale(pageWidth: number, containerWidth: number, padding = 24): number {
  const w = Math.max(120, containerWidth - padding);
  return w / Math.max(1, pageWidth);
}

export type PdfSearchHit = {
  page: number;
  snippet: string;
  index: number;
};

/** Search PDF text layer (case-insensitive substring match per page). */
export async function searchPdfDocument(
  doc: PdfJsDoc,
  query: string,
  opts?: { maxHits?: number }
): Promise<PdfSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return [];
  const maxHits = opts?.maxHits ?? 40;
  const hits: PdfSearchHit[] = [];
  for (let page = 1; page <= doc.numPages && hits.length < maxHits; page++) {
    const p = await doc.getPage(page);
    const content = await p.getTextContent?.();
    if (!content?.items?.length) continue;
    const text = content.items.map((it) => it.str ?? "").join(" ");
    const lower = text.toLowerCase();
    let idx = 0;
    while (hits.length < maxHits) {
      const found = lower.indexOf(q, idx);
      if (found < 0) break;
      const start = Math.max(0, found - 30);
      const end = Math.min(text.length, found + q.length + 30);
      hits.push({ page, snippet: text.slice(start, end).trim(), index: hits.length });
      idx = found + q.length;
    }
  }
  return hits;
}
