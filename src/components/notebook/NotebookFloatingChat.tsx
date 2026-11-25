import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GripHorizontal, Link2, Maximize2, MessageSquare, Minimize2, Minimize, X } from "lucide-react";
import ChatMessages from "@/components/ChatMessages";
import ChatInput from "@/components/ChatInput";
import { ConnectionHandle } from "@/components/notebook/ConnectionHandle";
import { useChat } from "@/context/ChatContext";
import {
  CHAT_PANEL_EXPANDED,
  useNotebookStudio,
} from "@/context/NotebookStudioContext";
import { ContextSourcesPopover } from "@/components/notebook/ContextSourcesPopover";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MIN_W = 300;
const MIN_H = 280;
const MAX_W = 920;
const MAX_H = 900;

const CONNECTION_HINT_KEY = "openbentt-notebook-connection-hint-seen";

type NotebookFloatingChatProps = {
  containerRef: React.RefObject<HTMLElement | null>;
  /** Which studio surface is visible — used for context copy only. */
  studioSurface?: "orchestra" | "editor";
};

export function NotebookFloatingChat({
  containerRef,
  studioSurface = "editor",
}: NotebookFloatingChatProps) {
  const {
    chatPanelOpen,
    setChatPanelOpen,
    chatPanelRect,
    setChatPanelRect,
    chatConnections,
    toggleChatConnection,
    pendingConnection,
    setPendingConnection,
    setConnectionDrag,
    registerConnectionAnchor,
    bumpConnectionLayout,
  } = useNotebookStudio();
  const { project } = useResearchProject();

  const { chats, currentChatId, isLoading } = useChat();
  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages ?? [];

  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const resizeRef = useRef<{ w: number; h: number; sx: number; sy: number } | null>(null);
  const [resolvedPos, setResolvedPos] = useState<{ x: number; y: number } | null>(null);
  const [showConnectionHint, setShowConnectionHint] = useState(false);
  const [searchParams] = useSearchParams();
  const [askHint, setAskHint] = useState(false);
  const [wiggle, setWiggle] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    const fromUrl = searchParams.get("paper");
    let fromSession = false;
    try {
      fromSession = Boolean(sessionStorage.getItem("openbentt-ask-hint"));
    } catch {
      fromSession = false;
    }
    if (!fromUrl && !fromSession) return;
    setAskHint(true);
    setWiggle(true);
    const t = window.setTimeout(() => setWiggle(false), 1700);
    return () => window.clearTimeout(t);
  }, [searchParams]);

  const dismissAskHint = () => {
    setAskHint(false);
    setWiggle(false);
    try {
      sessionStorage.removeItem("openbentt-ask-hint");
    } catch {
      /* ignore */
    }
  };

  const isExpanded =
    chatPanelRect.width >= CHAT_PANEL_EXPANDED.width - 8 &&
    chatPanelRect.height >= CHAT_PANEL_EXPANDED.height - 8;

  const resolveDefaultPos = useCallback(() => {
    const container = containerRef.current;
    if (!container) return { x: 24, y: 24 };
    const cr = container.getBoundingClientRect();
    const w = chatPanelRect.width;
    const h = chatPanelRect.height;
    if (chatPanelRect.x >= 0 && chatPanelRect.y >= 0) {
      return {
        x: Math.min(chatPanelRect.x, Math.max(8, cr.width - w - 8)),
        y: Math.min(chatPanelRect.y, Math.max(8, cr.height - h - 8)),
      };
    }
    return { x: Math.max(8, cr.width - w - 16), y: Math.max(8, cr.height - h - 72) };
  }, [chatPanelRect, containerRef]);

  useEffect(() => {
    if (!chatPanelOpen) return;
    setResolvedPos(resolveDefaultPos());
    bumpConnectionLayout();
    try {
      if (!sessionStorage.getItem(CONNECTION_HINT_KEY)) setShowConnectionHint(true);
    } catch {
      /* ignore */
    }
  }, [chatPanelOpen, resolveDefaultPos, bumpConnectionLayout]);

  useEffect(() => {
    if (!chatPanelOpen) return;
    const ro = new ResizeObserver(() => bumpConnectionLayout());
    const el = containerRef.current;
    if (el) ro.observe(el);
    if (panelRef.current) ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, [chatPanelOpen, containerRef, bumpConnectionLayout]);

  const dismissConnectionHint = () => {
    setShowConnectionHint(false);
    try {
      sessionStorage.setItem(CONNECTION_HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const startConnectionDrag = (from: "chat-tex" | "chat-pdf", e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setPendingConnection({ from });
    setConnectionDrag({
      from,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
    });
    bumpConnectionLayout();
  };

  const pos = resolvedPos ?? resolveDefaultPos();

  const onDragStart = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const container = containerRef.current;
    const cr = container?.getBoundingClientRect();
    const maxX = cr ? cr.width - chatPanelRect.width - 8 : 9999;
    const maxY = cr ? cr.height - chatPanelRect.height - 8 : 9999;
    const nx = Math.max(8, Math.min(maxX, d.px + e.clientX - d.ox));
    const ny = Math.max(8, Math.min(maxY, d.py + e.clientY - d.oy));
    setResolvedPos({ x: nx, y: ny });
    bumpConnectionLayout();
  };

  const onDragEnd = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (resolvedPos) {
      setChatPanelRect((r) => ({ ...r, x: resolvedPos.x, y: resolvedPos.y }));
    }
    bumpConnectionLayout();
  };

  const onResizeStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = {
      w: chatPanelRect.width,
      h: chatPanelRect.height,
      sx: e.clientX,
      sy: e.clientY,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const nw = Math.min(MAX_W, Math.max(MIN_W, r.w + e.clientX - r.sx));
    const nh = Math.min(MAX_H, Math.max(MIN_H, r.h + e.clientY - r.sy));
    setChatPanelRect((prev) => ({ ...prev, width: nw, height: nh }));
    bumpConnectionLayout();
  };

  const onResizeEnd = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    bumpConnectionLayout();
  };

  const toggleExpanded = () => {
    const container = containerRef.current;
    const cr = container?.getBoundingClientRect();
    if (isExpanded) {
      setChatPanelRect((r) => ({ ...r, width: 420, height: 520 }));
    } else if (cr) {
      setChatPanelRect((r) => ({
        ...r,
        width: Math.min(CHAT_PANEL_EXPANDED.width, cr.width - 24),
        height: Math.min(CHAT_PANEL_EXPANDED.height, cr.height - 24),
      }));
    } else {
      setChatPanelRect((r) => ({ ...r, ...CHAT_PANEL_EXPANDED }));
    }
    bumpConnectionLayout();
  };

  const sourceCount =
    chatConnections.texFileKeys.length + chatConnections.pdfPaperIds.length;

  const statusLabel = useMemo(() => {
    const surface = studioSurface === "orchestra" ? "Orchestra" : "Editor";
    if (sourceCount === 0) return `${surface} · no sources`;
    if (sourceCount === 1) return `${surface} · 1 source`;
    return `${surface} · ${sourceCount} sources`;
  }, [sourceCount, studioSurface]);

  if (!chatPanelOpen) {
    return (
      <div className="absolute bottom-4 right-4 z-40 flex items-end gap-2">
        {askHint && (
          <button
            type="button"
            onClick={() => {
              dismissAskHint();
              setChatPanelOpen(true);
            }}
            className="max-w-[220px] rounded-xl border border-primary/40 bg-background px-3 py-2 text-left shadow-lg"
          >
            <p className="text-xs font-medium text-foreground">Ask from here</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Your paper is in the sidebar. Click the chat to ask about it.
            </p>
          </button>
        )}
        <Button
          type="button"
          size="icon"
          className={cn("h-11 w-11 rounded-full shadow-lg", wiggle && "chat-bubble-wiggle")}
          aria-label="Open project chat"
          onClick={() => {
            dismissAskHint();
            setChatPanelOpen(true);
          }}
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "absolute z-50 flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl",
        "ring-1 ring-white/5"
      )}
      style={{
        left: pos.x,
        top: pos.y,
        width: chatPanelRect.width,
        height: chatPanelRect.height,
      }}
      data-notebook-chat-panel
    >
      <div
        className="relative grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-1 px-2 py-1.5"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <div className="flex min-w-0 cursor-grab items-center gap-1.5 active:cursor-grabbing">
          <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-xs font-medium">
            {project?.title ? `${project.title} · chat` : "Notebook chat"}
          </span>
        </div>

        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
                sourceCount > 0
                  ? "border-primary/35 bg-primary/10 text-foreground"
                  : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground"
              )}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Context status: ${statusLabel}`}
            >
              <Link2 className="h-3 w-3 shrink-0 opacity-80" />
              <span className="min-w-0 truncate">{statusLabel}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            className="w-72 space-y-3 p-3"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div>
              <p className="text-xs font-medium text-foreground">Chat context</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {studioSurface === "orchestra" ? "Paper Orchestra + draft" : "Editor draft"}
                {project?.papers?.length
                  ? ` · ${project.papers.length} library paper${project.papers.length === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>

            <div className="flex items-center justify-center gap-4 py-1">
              <div className="flex flex-col items-center gap-0.5">
                <ConnectionHandle
                  id="chat-tex"
                  kind="chat-tex"
                  label="Connect chat to LaTeX tab"
                  tooltip="LaTeX: drag to a green tab dot, or click both ends"
                  connected={chatConnections.texFileKeys.length > 0}
                  active={pendingConnection?.from === "chat-tex"}
                  registerAnchor={registerConnectionAnchor}
                  onPointerDown={(e) => startConnectionDrag("chat-tex", e)}
                />
                <span className="text-[8px] font-medium uppercase tracking-wide text-primary/90">LaTeX</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <ConnectionHandle
                  id="chat-pdf"
                  kind="chat-pdf"
                  label="Connect chat to PDF preview"
                  tooltip="PDF: drag to the amber preview dot, or click both ends"
                  connected={chatConnections.pdfPaperIds.length > 0}
                  active={pendingConnection?.from === "chat-pdf"}
                  registerAnchor={registerConnectionAnchor}
                  onPointerDown={(e) => startConnectionDrag("chat-pdf", e)}
                />
                <span className="text-[8px] font-medium uppercase tracking-wide text-primary/90">PDF</span>
              </div>
            </div>

            {sourceCount > 0 ? (
              <div className="space-y-1.5">
                <ContextSourcesPopover
                  texFileKeys={chatConnections.texFileKeys}
                  pdfPaperIds={chatConnections.pdfPaperIds}
                  texLabel={(key) => {
                    if (key === "draft") return "main.tex";
                    if (key === "bib") return "references.bib";
                    return key;
                  }}
                  pdfLabel={(id) =>
                    id === "compiled"
                      ? "Compiled preview"
                      : project?.papers.find((p) => p.id === id)?.fileName ?? id
                  }
                  onDisconnectTex={(key) => toggleChatConnection("tex", key)}
                  onDisconnectPdf={(id) => toggleChatConnection("pdf", id)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Connected:{" "}
                  {[
                    ...chatConnections.texFileKeys.map((k) =>
                      k === "draft" ? "LaTeX" : `LaTeX (${k})`
                    ),
                    ...chatConnections.pdfPaperIds.map((id) =>
                      id === "compiled" ? "PDF (compiled)" : "PDF"
                    ),
                  ].join(" · ")}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-amber-600/90 dark:text-amber-400/90">
                Connect LaTeX or PDF for richer asks — drag a dot to its matching target.
              </p>
            )}
          </PopoverContent>
        </Popover>

        <div className="flex items-center justify-end gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={isExpanded ? "Restore chat size" : "Expand chat panel"}
            title={isExpanded ? "Restore size" : "Expand chat"}
            onClick={toggleExpanded}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isExpanded ? <Minimize className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Minimize chat"
            onClick={() => setChatPanelOpen(false)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Close chat"
            onClick={() => setChatPanelOpen(false)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showConnectionHint && studioSurface === "editor" && (
        <div className="flex shrink-0 items-start gap-2 border-y border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px] text-foreground/90">
          <span className="min-w-0 flex-1">
            Tap the center pill to connect <span className="text-primary">LaTeX</span> or{" "}
            <span className="text-primary">PDF</span> context.
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 shrink-0 px-2 text-[10px]"
            onClick={dismissConnectionHint}
          >
            Got it
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatMessages messages={messages} isLoading={isLoading} emptyVariant="studio" />
      </div>
      <div className="relative shrink-0 p-1.5">
        <ChatInput
          isLoading={isLoading}
          placeholderOverride={
            studioSurface === "orchestra"
              ? "Ask about the manuscript plan, idea, or draft…  (/ for commands)"
              : "Ask about your draft, PDFs, or compile errors…  (/ for commands)"
          }
          variant="studio"
        />
      </div>

      <div
        className={cn(
          "absolute bottom-0 right-0 z-10 flex h-5 w-5 cursor-se-resize items-end justify-end rounded-tl-md",
          "bg-muted/30 hover:bg-muted/60"
        )}
        aria-label="Resize chat panel — drag corner"
        title="Drag to resize chat"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
      >
        <svg viewBox="0 0 12 12" className="m-0.5 h-3 w-3 text-muted-foreground/80">
          <path
            d="M11 11L6 11M11 11L11 6M11 8L8 11"
            stroke="currentColor"
            strokeWidth="1.25"
            fill="none"
          />
        </svg>
      </div>
    </div>
  );
}
