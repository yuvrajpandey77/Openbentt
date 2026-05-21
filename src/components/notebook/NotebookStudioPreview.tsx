import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConnectionHandle } from "@/components/notebook/ConnectionHandle";
import { useNotebookStudio } from "@/context/NotebookStudioContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import {
  computeFitWidthScale,
  cancelCanvasRender,
  openPdfDocument,
  renderPdfPage,
  renderPdfThumbnail,
} from "@/lib/pdfViewer";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type PdfJsDoc = Awaited<ReturnType<typeof openPdfDocument>>["doc"];

type NotebookStudioPreviewProps = {
  previewBuffer: ArrayBuffer | null;
  pdfScale: number;
  setPdfScale: (n: number | ((s: number) => number)) => void;
  activePaperId: string | null;
  onChoosePdf: () => void;
  busy: boolean;
};

const ZOOM_MIN = 0.65;
const ZOOM_MAX = 2.25;
const ZOOM_STEP = 0.15;

export function NotebookStudioPreview({
  previewBuffer,
  pdfScale,
  setPdfScale,
  activePaperId,
  onChoosePdf,
  busy,
}: NotebookStudioPreviewProps) {
  const { project, updatePaperReview } = useResearchProject();
  const {
    pdfPage,
    pdfNumPages,
    setPdfPageInfo,
    chatConnections,
    toggleChatConnection,
    pendingConnection,
    setChatConnection,
    registerConnectionAnchor,
    connectionDrag,
  } = useNotebookStudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PdfJsDoc | null>(null);
  const destroyRef = useRef<(() => Promise<void>) | null>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const renderGenRef = useRef(0);
  const [fitWidth, setFitWidth] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [pageNote, setPageNote] = useState("");

  const paper = project?.papers.find((p) => p.id === activePaperId);
  const pdfConnected =
    chatConnections.pdfPaperId === (activePaperId ?? "compiled") ||
    (!!activePaperId && chatConnections.pdfPaperId === activePaperId);
  const pdfSnapHighlight = connectionDrag?.snapTargetId === "pdf-preview";

  useEffect(() => {
    setPageNote(paper?.pageNotes?.[pdfPage] ?? "");
  }, [paper?.id, paper?.pageNotes, pdfPage]);

  useEffect(() => {
    if (!previewBuffer) {
      void destroyRef.current?.();
      docRef.current = null;
      destroyRef.current = null;
      setPdfPageInfo(1, 0);
      return;
    }
    let cancelled = false;
    void (async () => {
      setRendering(true);
      await destroyRef.current?.();
      try {
        const { doc, handle } = await openPdfDocument(previewBuffer);
        if (cancelled) {
          await handle.destroy();
          return;
        }
        docRef.current = doc;
        destroyRef.current = handle.destroy;
        const startPage =
          paper?.lastReviewedPage && paper.lastReviewedPage <= handle.numPages
            ? paper.lastReviewedPage
            : 1;
        setPdfPageInfo(startPage, handle.numPages);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewBuffer, paper?.id, paper?.lastReviewedPage, setPdfPageInfo]);

  useEffect(() => {
    if (!activePaperId || !pdfNumPages) return;
    void updatePaperReview(activePaperId, {
      lastReviewedPage: pdfPage,
      reviewStatus: "reviewing",
    });
  }, [activePaperId, pdfPage, pdfNumPages, updatePaperReview]);

  const renderCurrentPage = useCallback(async () => {
    const canvas = canvasRef.current;
    const doc = docRef.current;
    const scroll = scrollRef.current;
    if (!canvas || !doc || !pdfNumPages) return;

    const gen = ++renderGenRef.current;
    setRendering(true);
    try {
      const page = await doc.getPage(Math.min(Math.max(1, pdfPage), pdfNumPages));
      if (gen !== renderGenRef.current) return;
      const baseVp = page.getViewport({ scale: 1 });
      let scale = pdfScale;
      if (fitWidth && scroll) {
        scale = computeFitWidthScale(baseVp.width, scroll.clientWidth);
      }
      await renderPdfPage(doc, pdfPage, canvas, scale);
    } catch (err) {
      if (gen === renderGenRef.current) {
        console.warn("[NotebookStudioPreview] page render failed", err);
      }
    } finally {
      if (gen === renderGenRef.current) setRendering(false);
    }
  }, [pdfPage, pdfNumPages, pdfScale, fitWidth]);

  useEffect(() => {
    if (!previewBuffer || !docRef.current) return;
    const canvas = canvasRef.current;
    void renderCurrentPage();
    return () => {
      renderGenRef.current += 1;
      if (canvas) cancelCanvasRender(canvas);
    };
  }, [previewBuffer, pdfPage, pdfScale, fitWidth, pdfNumPages, renderCurrentPage]);

  useEffect(() => {
    const doc = docRef.current;
    const el = thumbsRef.current;
    if (!doc || !el || !pdfNumPages) return;
    el.innerHTML = "";
    let cancelled = false;
    const limit = Math.min(pdfNumPages, 24);
    void (async () => {
      for (let p = 1; p <= limit; p++) {
        if (cancelled) return;
        const wrap = document.createElement("button");
        wrap.type = "button";
        wrap.className = cn(
          "shrink-0 overflow-hidden rounded border bg-white p-0.5 transition-colors",
          p === pdfPage ? "border-primary ring-1 ring-primary" : "border-border/60 opacity-80 hover:opacity-100"
        );
        wrap.title = `Page ${p}`;
        wrap.onclick = () => setPdfPageInfo(p, pdfNumPages);
        const c = document.createElement("canvas");
        wrap.appendChild(c);
        el.appendChild(wrap);
        try {
          await renderPdfThumbnail(doc, p, c, 56);
        } catch {
          /* thumbnail cancelled or doc closed */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfNumPages, pdfPage, setPdfPageInfo, previewBuffer]);

  const nudgeZoom = (delta: number) => {
    setFitWidth(false);
    setPdfScale((s) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((s + delta) * 100) / 100)));
  };

  const savePageNote = () => {
    if (!activePaperId || !paper) return;
    const pageNotes = { ...(paper.pageNotes ?? {}), [pdfPage]: pageNote.trim() };
    if (!pageNote.trim()) delete pageNotes[pdfPage];
    void updatePaperReview(activePaperId, { pageNotes });
  };

  const markReviewed = () => {
    if (!activePaperId) return;
    void updatePaperReview(activePaperId, {
      reviewStatus: "reviewed",
      reviewedAt: new Date().toISOString(),
      lastReviewedPage: pdfPage,
    });
  };

  if (!previewBuffer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm font-medium">No PDF open</p>
        <p className="max-w-xs text-xs text-muted-foreground">Select a file from the tree or compile LaTeX.</p>
        <Button type="button" size="sm" variant="secondary" onClick={onChoosePdf} disabled={busy}>
          Open PDF
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20" data-notebook-preview>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-card/80 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <ConnectionHandle
            id="pdf-preview"
            kind="pdf-preview"
            label="Connect chat → PDF preview"
            connected={pdfConnected}
            highlight={pendingConnection?.from === "chat-pdf"}
            snapHighlight={pdfSnapHighlight}
            registerAnchor={registerConnectionAnchor}
            onClick={() => {
              const id = activePaperId ?? "compiled";
              if (pendingConnection?.from === "chat-pdf") setChatConnection("pdf", id);
              else toggleChatConnection("pdf", id);
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={pdfPage <= 1}
            onClick={() => setPdfPageInfo(pdfPage - 1, pdfNumPages)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[5rem] text-center text-xs tabular-nums text-muted-foreground">
            {pdfPage} / {pdfNumPages || "—"}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={pdfPage >= pdfNumPages}
            onClick={() => setPdfPageInfo(pdfPage + 1, pdfNumPages)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Input
            className="h-8 w-14 text-center text-xs tabular-nums"
            value={pdfPage}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (n >= 1 && n <= pdfNumPages) setPdfPageInfo(n, pdfNumPages);
            }}
          />
        </div>
        <div className="flex items-center gap-0.5">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setFitWidth(true)} aria-label="Fit width">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => nudgeZoom(-ZOOM_STEP)} aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-[3rem] text-center text-xs tabular-nums">{Math.round(fitWidth ? 100 : pdfScale * 100)}%</span>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => nudgeZoom(ZOOM_STEP)} aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
        {activePaperId && (
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={markReviewed}>
            <Check className="h-3.5 w-3.5" />
            Mark reviewed
          </Button>
        )}
      </div>
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto p-4">
        {rendering && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <canvas ref={canvasRef} className="mx-auto block max-w-full rounded-md border border-border/60 bg-white shadow-sm" />
      </div>
      {activePaperId && (
        <div className="shrink-0 border-t border-border/50 bg-card/90 px-3 py-2">
          <Textarea
            className="min-h-[52px] resize-none text-xs"
            placeholder={`Note for page ${pdfPage}…`}
            value={pageNote}
            onChange={(e) => setPageNote(e.target.value)}
            onBlur={savePageNote}
          />
        </div>
      )}
      <div ref={thumbsRef} className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-border/50 bg-muted/30 px-2 py-2" />
    </div>
  );
}
