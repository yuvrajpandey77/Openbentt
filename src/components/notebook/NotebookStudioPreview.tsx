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
  searchPdfDocument,
  type PdfSearchHit,
} from "@/lib/pdfViewer";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Highlighter,
  Loader2,
  Maximize2,
  Search,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  annotationsForPage,
  createPdfAnnotation,
  DEFAULT_HIGHLIGHT_COLOR,
} from "@/lib/research/pdfAnnotations";
import type { PdfAnnotation } from "@/types/researchProject";
import { PdfSearchPanel } from "@/components/notebook/PdfSearchPanel";
import { PdfAnnotationList } from "@/components/notebook/PdfAnnotationList";

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
  const resumePageRef = useRef<number | null>(null);
  const thumbWrapsRef = useRef<HTMLButtonElement[]>([]);
  const [fitWidth, setFitWidth] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [pageRendering, setPageRendering] = useState(false);
  const [docReady, setDocReady] = useState(false);
  /** First page has been painted for the current document — avoids flashing stale canvas. */
  const [firstPagePainted, setFirstPagePainted] = useState(false);
  const [pageNote, setPageNote] = useState("");
  const [highlightMode, setHighlightMode] = useState(false);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<PdfSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const paper = project?.papers.find((p) => p.id === activePaperId);
  const pdfConnected =
    chatConnections.pdfPaperId === (activePaperId ?? "compiled") ||
    (!!activePaperId && chatConnections.pdfPaperId === activePaperId);
  const pdfSnapHighlight = connectionDrag?.snapTargetId === "pdf-preview";

  useEffect(() => {
    setPageNote(paper?.pageNotes?.[pdfPage] ?? "");
  }, [paper?.id, paper?.pageNotes, pdfPage]);

  useEffect(() => {
    resumePageRef.current = null;
    setFirstPagePainted(false);
  }, [previewBuffer, paper?.id]);

  useEffect(() => {
    if (!previewBuffer) {
      void destroyRef.current?.();
      docRef.current = null;
      destroyRef.current = null;
      setDocReady(false);
      setPdfPageInfo(1, 0);
      return;
    }
    let cancelled = false;
    setDocReady(false);
    setFirstPagePainted(false);
    void (async () => {
      setDocLoading(true);
      await destroyRef.current?.();
      try {
        const { doc, handle } = await openPdfDocument(previewBuffer);
        if (cancelled) {
          await handle.destroy();
          return;
        }
        docRef.current = doc;
        destroyRef.current = handle.destroy;
        let startPage = resumePageRef.current;
        if (startPage == null) {
          startPage =
            paper?.lastReviewedPage && paper.lastReviewedPage <= handle.numPages
              ? paper.lastReviewedPage
              : 1;
          resumePageRef.current = startPage;
        }
        setPdfPageInfo(startPage, handle.numPages);
        setDocReady(true);
      } finally {
        if (!cancelled) setDocLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setDocReady(false);
    };
  }, [previewBuffer, paper?.id, setPdfPageInfo]);

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
    setPageRendering(true);
    try {
      const page = await doc.getPage(Math.min(Math.max(1, pdfPage), pdfNumPages));
      if (gen !== renderGenRef.current) return;
      const baseVp = page.getViewport({ scale: 1 });
      let scale = pdfScale;
      if (fitWidth && scroll) {
        let width = scroll.clientWidth;
        if (width === 0) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          if (gen !== renderGenRef.current) return;
          width = scroll.clientWidth;
        }
        if (width === 0) return;
        scale = computeFitWidthScale(baseVp.width, width);
      }
      await renderPdfPage(doc, pdfPage, canvas, scale);
    } catch (err) {
      if (gen === renderGenRef.current) {
        console.warn("[NotebookStudioPreview] page render failed", err);
      }
    } finally {
      if (gen === renderGenRef.current) {
        setPageRendering(false);
        setFirstPagePainted(true);
      }
    }
  }, [pdfPage, pdfNumPages, pdfScale, fitWidth]);

  useEffect(() => {
    if (!docReady || !docRef.current || !pdfNumPages) return;
    const canvas = canvasRef.current;
    void renderCurrentPage();
    return () => {
      renderGenRef.current += 1;
      if (canvas) cancelCanvasRender(canvas);
    };
  }, [docReady, pdfPage, pdfScale, fitWidth, pdfNumPages, renderCurrentPage]);

  useEffect(() => {
    const doc = docRef.current;
    const el = thumbsRef.current;
    if (!doc || !el || !pdfNumPages || !docReady) return;
    el.innerHTML = "";
    thumbWrapsRef.current = [];
    let cancelled = false;
    const limit = Math.min(pdfNumPages, 24);
    void (async () => {
      for (let p = 1; p <= limit; p++) {
        if (cancelled) return;
        const wrap = document.createElement("button");
        wrap.type = "button";
        wrap.dataset.page = String(p);
        wrap.className = cn(
          "shrink-0 overflow-hidden rounded border bg-white p-0.5 transition-colors",
          p === pdfPage ? "border-primary ring-1 ring-primary" : "border-border/60 opacity-80 hover:opacity-100"
        );
        wrap.title = `Page ${p}`;
        wrap.onclick = () => setPdfPageInfo(p, pdfNumPages);
        const c = document.createElement("canvas");
        wrap.appendChild(c);
        el.appendChild(wrap);
        thumbWrapsRef.current.push(wrap);
        try {
          await renderPdfThumbnail(doc, p, c, 56);
        } catch {
          /* thumbnail cancelled or doc closed */
        }
      }
    })();
    return () => {
      cancelled = true;
      thumbWrapsRef.current = [];
    };
  }, [pdfNumPages, setPdfPageInfo, previewBuffer, docReady]);

  useEffect(() => {
    for (const wrap of thumbWrapsRef.current) {
      const p = Number(wrap.dataset.page);
      const active = p === pdfPage;
      wrap.className = cn(
        "shrink-0 overflow-hidden rounded border bg-white p-0.5 transition-colors",
        active ? "border-primary ring-1 ring-primary" : "border-border/60 opacity-80 hover:opacity-100"
      );
    }
  }, [pdfPage]);

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

  const pageAnnotations = annotationsForPage(paper?.annotations, pdfPage);

  const persistAnnotation = (ann: PdfAnnotation) => {
    if (!activePaperId || !paper) return;
    const annotations = [...(paper.annotations ?? []), ann];
    void updatePaperReview(activePaperId, { annotations });
  };

  const onHighlightPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!highlightMode || !canvasWrapRef.current) return;
    const r = canvasWrapRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    dragStartRef.current = { x, y };
    setDragRect({ x, y, w: 0, h: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHighlightPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || !canvasWrapRef.current) return;
    const r = canvasWrapRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const sx = dragStartRef.current.x;
    const sy = dragStartRef.current.y;
    setDragRect({
      x: Math.min(sx, x),
      y: Math.min(sy, y),
      w: Math.abs(x - sx),
      h: Math.abs(y - sy),
    });
  };

  const onHighlightPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || !dragRect) {
      dragStartRef.current = null;
      setDragRect(null);
      return;
    }
    if (dragRect.w > 0.01 && dragRect.h > 0.005) {
      persistAnnotation(createPdfAnnotation(pdfPage, dragRect));
    }
    dragStartRef.current = null;
    setDragRect(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      setCanvasSize({ w: canvas.width, h: canvas.height });
    });
    ro.observe(canvas);
    setCanvasSize({ w: canvas.width, h: canvas.height });
    return () => ro.disconnect();
  }, [firstPagePainted, pdfPage]);

  useEffect(() => {
    const doc = docRef.current;
    if (!searchOpen || !doc || searchQuery.trim().length < 2) {
      setSearchHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    void (async () => {
      try {
        const hits = await searchPdfDocument(doc, searchQuery);
        if (!cancelled) setSearchHits(hits);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchOpen, searchQuery, previewBuffer, docReady]);

  const showFullPageLoader = docLoading || !docReady || !firstPagePainted;

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
      <div className="flex min-h-0 flex-1 flex-col">
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
          <Button
            type="button"
            size="icon"
            variant={searchOpen ? "secondary" : "ghost"}
            className="h-8 w-8"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Search in PDF"
          >
            <Search className="h-4 w-4" />
          </Button>
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
          <Button
            type="button"
            size="sm"
            variant={highlightMode ? "secondary" : "outline"}
            className="h-8 gap-1 text-xs"
            onClick={() => setHighlightMode((v) => !v)}
            aria-pressed={highlightMode}
          >
            <Highlighter className="h-3.5 w-3.5" />
            Highlight
          </Button>
        )}
        {activePaperId && (
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={markReviewed}>
            <Check className="h-3.5 w-3.5" />
            Mark reviewed
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto p-4">
        {showFullPageLoader && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/85 backdrop-blur-[1px]">
            <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden />
            <p className="text-xs text-muted-foreground">Loading PDF…</p>
          </div>
        )}
        {pageRendering && firstPagePainted && !docLoading && (
          <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-background/80 p-1.5 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        <div
          ref={canvasWrapRef}
          className="relative mx-auto w-fit"
          style={canvasSize.w ? { width: canvasSize.w, height: canvasSize.h } : undefined}
        >
          <canvas
            ref={canvasRef}
            className={cn(
              "mx-auto block max-w-full rounded-md border border-border/60 bg-white shadow-sm transition-opacity duration-150",
              !firstPagePainted && "invisible opacity-0",
              pageRendering && firstPagePainted && "opacity-75"
            )}
          />
          {firstPagePainted && canvasSize.w > 0 && (
            <div
              className={cn(
                "absolute inset-0 rounded-md",
                highlightMode && "cursor-crosshair"
              )}
              aria-hidden={!highlightMode && pageAnnotations.length === 0}
              onPointerDown={highlightMode ? onHighlightPointerDown : undefined}
              onPointerMove={highlightMode ? onHighlightPointerMove : undefined}
              onPointerUp={highlightMode ? onHighlightPointerUp : undefined}
            >
              {pageAnnotations.map((ann) => (
                <div
                  key={ann.id}
                  className="pointer-events-none absolute rounded-sm border border-amber-500/30"
                  style={{
                    left: `${ann.rect.x * 100}%`,
                    top: `${ann.rect.y * 100}%`,
                    width: `${ann.rect.w * 100}%`,
                    height: `${ann.rect.h * 100}%`,
                    backgroundColor: ann.color ?? DEFAULT_HIGHLIGHT_COLOR,
                  }}
                  title={ann.text}
                />
              ))}
              {dragRect && highlightMode && (
                <div
                  className="pointer-events-none absolute rounded-sm border border-amber-600/50"
                  style={{
                    left: `${dragRect.x * 100}%`,
                    top: `${dragRect.y * 100}%`,
                    width: `${dragRect.w * 100}%`,
                    height: `${dragRect.h * 100}%`,
                    backgroundColor: DEFAULT_HIGHLIGHT_COLOR,
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
      <PdfSearchPanel
        open={searchOpen}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        hits={searchHits}
        searching={searching}
        onSelectHit={(hit) => setPdfPageInfo(hit.page, pdfNumPages)}
        onClose={() => setSearchOpen(false)}
      />
      </div>
      {activePaperId && (
        <PdfAnnotationList
          annotations={paper?.annotations ?? []}
          currentPage={pdfPage}
          onSelectPage={(p) => setPdfPageInfo(p, pdfNumPages)}
        />
      )}
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
    </div>
  );
}
