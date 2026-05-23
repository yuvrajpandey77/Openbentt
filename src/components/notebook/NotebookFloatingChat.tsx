import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GripHorizontal, Maximize2, MessageSquare, Minimize2, Minimize, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

const MIN_W = 300;
const MIN_H = 280;
const MAX_W = 920;
const MAX_H = 900;

const CONNECTION_HINT_KEY = "openbentt-notebook-connection-hint-seen";

type NotebookFloatingChatProps = {
  containerRef: React.RefObject<HTMLElement | null>;
};

export function NotebookFloatingChat({ containerRef }: NotebookFloatingChatProps) {
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

  if (!chatPanelOpen) {
    return (
      <Button
        type="button"
        size="icon"
        className="absolute bottom-4 right-4 z-40 h-11 w-11 rounded-full shadow-lg"
        aria-label="Open project chat"
        onClick={() => setChatPanelOpen(true)}
      >
        <MessageSquare className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "absolute z-50 flex flex-col overflow-hidden rounded-xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-md",
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
        className="flex shrink-0 cursor-grab items-center gap-2 border-b border-border/50 bg-muted/30 px-2 py-1.5 active:cursor-grabbing"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">Project chat</span>
        <div className="flex flex-col items-center gap-0.5" title="Context connections">
          <div className="flex items-center gap-2">
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
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label={isExpanded ? "Restore chat size" : "Expand chat panel"}
          title={isExpanded ? "Restore size" : "Expand chat"}
          onClick={toggleExpanded}
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
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showConnectionHint && (
        <div className="flex shrink-0 items-start gap-2 border-b border-primary/30 bg-primary/10 px-2 py-1.5 text-[11px] text-foreground/90">
          <span className="min-w-0 flex-1">
            <strong className="font-medium">Two connection types:</strong>{" "}
            <span className="text-primary">LaTeX</span> sends source text from editor tabs;{" "}
            <span className="text-primary">PDF</span> sends the open preview page. Drag a dot to its matching
            target, or click both ends. Release near a target to snap.
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

      {(chatConnections.texFileKeys.length > 0 || chatConnections.pdfPaperIds.length > 0) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-primary/5 px-2 py-1 text-[10px] text-muted-foreground">
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
          <span className="min-w-0 truncate">
          Connected:
          {chatConnections.texFileKeys.map((key, i) => (
            <span key={key}>
              {i > 0 && " · "}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => toggleChatConnection("tex", key)}
              >
                LaTeX{chatConnections.texFileKeys.length > 1 ? ` (${key === "draft" ? "main.tex" : key})` : ""}
              </button>
            </span>
          ))}
          {chatConnections.texFileKeys.length > 0 && chatConnections.pdfPaperIds.length > 0 && " · "}
          {chatConnections.pdfPaperIds.map((id, i) => (
            <span key={id}>
              {(i > 0 || chatConnections.texFileKeys.length > 0) && i === 0 && chatConnections.texFileKeys.length === 0 ? "" : i > 0 ? " · " : ""}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => toggleChatConnection("pdf", id)}
              >
                PDF{id === "compiled" ? " (compiled)" : ""}
              </button>
            </span>
          ))}
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatMessages messages={messages} isLoading={isLoading} emptyVariant="studio" />
      </div>
      <div className="relative shrink-0 border-t border-border/40 p-2 pb-3 pr-8">
        <ChatInput
          isLoading={isLoading}
          placeholderOverride="Ask about your draft, PDFs, or compile errors…"
          variant="studio"
        />
      </div>

      <div
        className={cn(
          "absolute bottom-0 left-0 z-10 flex h-7 w-7 cursor-se-resize items-end justify-end rounded-tr-md",
          "bg-muted/40 hover:bg-muted/70",
          "border-r border-t border-border/50"
        )}
        aria-label="Resize chat panel — drag corner"
        title="Drag to resize chat"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
      >
        <svg viewBox="0 0 16 16" className="m-0.5 h-4 w-4 text-muted-foreground">
          <path
            d="M14 14L8 14M14 14L14 8M14 10L10 14M14 12L12 14"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      </div>
    </div>
  );
}
