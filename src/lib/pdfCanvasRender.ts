/** Render PDF pages to canvas elements (pdf.js). */

/**
 * Rasterizing every page of a large PDF pegs CPU/GPU and allocates huge canvases.
 * Preview only needs the first chunk; users still have the full file + Source extract.
 */
export const PDF_PREVIEW_MAX_PAGES = 48;

/** pdf.js logs unsupported “Knockout groups” via `console.log` (often hundreds of times per doc). */
function installKnockoutGroupLogFilter(): () => void {
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.includes("Knockout groups not supported")) {
      return;
    }
    orig.apply(console, args);
  };
  return () => {
    console.log = orig;
  };
}

export type RenderPdfPagesOptions = {
  /** Cap canvas pages (default {@link PDF_PREVIEW_MAX_PAGES}). */
  maxPages?: number;
};

export async function renderPdfPages(
  data: ArrayBuffer,
  container: HTMLDivElement,
  scale = 1.2,
  options?: RenderPdfPagesOptions
): Promise<void> {
  container.innerHTML = "";
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const maxPages = Math.max(1, options?.maxPages ?? PDF_PREVIEW_MAX_PAGES);
  const uninstallLogFilter = installKnockoutGroupLogFilter();

  // pdf.js may transfer/detach the buffer in the worker — never pass React state’s buffer directly.
  const dataCopy = data.slice(0);
  const loading = pdfjs.getDocument({ data: new Uint8Array(dataCopy) });
  let doc: Awaited<ReturnType<typeof loading.promise>> | null = null;
  try {
    doc = await loading.promise;
    const n = doc.numPages;
    const limit = Math.min(n, maxPages);

    for (let p = 1; p <= limit; p++) {
      // Spread raster work across frames so the tab stays responsive on large previews.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      canvas.width = vp.width;
      canvas.height = vp.height;
      canvas.className = "mb-4 max-w-full rounded-md border border-border/60 bg-white shadow-sm";
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      container.appendChild(canvas);
    }

    if (n > limit) {
      const note = document.createElement("p");
      note.className =
        "mt-2 max-w-prose rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-950 dark:text-amber-100";
      note.textContent = `Preview shows the first ${limit} of ${n} pages to save CPU and memory. The full PDF file is unchanged; Source may include more extracted text (subject to extract limits).`;
      container.appendChild(note);
    }
  } finally {
    uninstallLogFilter();
    if (doc && typeof doc.destroy === "function") {
      try {
        await doc.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}
