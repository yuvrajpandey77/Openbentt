/** Render PDF pages to canvas elements (pdf.js). */

export async function renderPdfPages(
  data: ArrayBuffer,
  container: HTMLDivElement,
  scale = 1.2
): Promise<void> {
  container.innerHTML = "";
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  // pdf.js may transfer/detach the buffer in the worker — never pass React state’s buffer directly.
  const dataCopy = data.slice(0);
  const loading = pdfjs.getDocument({ data: new Uint8Array(dataCopy) });
  const doc = await loading.promise;
  const n = doc.numPages;

  for (let p = 1; p <= n; p++) {
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
}
