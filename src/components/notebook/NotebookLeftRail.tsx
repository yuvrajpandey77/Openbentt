import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useResearchWorkspace } from "@/context/ResearchWorkspaceContext";
import { useChat } from "@/context/ChatContext";
import {
  NOTEBOOK_EXPLORER_LEFT_PX,
  NOTEBOOK_EXPLORER_TOP_OFFSET_PX,
  NOTEBOOK_STUDIO_TOOLBAR_HEIGHT_PX,
  useNotebookStudio,
} from "@/context/NotebookStudioContext";
import { RESEARCH_PANEL_NAV, parseResearchPanelFromSearch, type ResearchPanelNavItem } from "@/config/researchPanelNav";
import { PANEL_LABELS, type ResearchSidePanelId } from "@/lib/research/workspaceLayout";
import { ResearchSidePanel } from "@/components/research/ResearchSidePanel";
import { NotebookFileTree } from "@/components/notebook/NotebookFileTree";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronRight,
  Files,
  ListTree,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Wrench,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type RailTab = "files" | "chats" | "outline" | "tools";

const TAB_HINTS: Record<RailTab, string> = {
  files: "Project files, PDFs, and assets",
  chats: "Chat threads for this session",
  outline: "LaTeX section headings from main.tex",
  tools: "Citations, Zotero, notes, and research panels",
};

function parseOutline(tex: string): { label: string; line: number }[] {
  const headings: { label: string; line: number }[] = [];
  tex.split("\n").forEach((line, i) => {
    const m = line.match(/\\(section|subsection|chapter)\*?\{([^}]+)\}/);
    if (m) headings.push({ label: m[2].trim(), line: i });
  });
  return headings;
}

function RailTabButton({
  id,
  label,
  Icon,
  active,
  onSelect,
}: {
  id: RailTab;
  label: string;
  Icon: typeof Files;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors",
            active
              ? "bg-muted text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
          onClick={onSelect}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px]">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{TAB_HINTS[id]}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ToolNavCard({
  item,
  active,
  onClick,
}: {
  item: ResearchPanelNavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={item.label}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-primary/40 bg-primary/8 text-primary"
          : "border-border/50 bg-muted/10 text-foreground hover:border-primary/25 hover:bg-muted/40"
      )}
    >
      <span className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground")}>
        <item.Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-none">{item.label}</p>
        <p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
          {item.description}
        </p>
      </div>
    </button>
  );
}

export function NotebookExplorerDock({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const { openCommandPalette } = useResearchWorkspace();
  const { explorerOpen, toggleExplorer } = useNotebookStudio();

  const dockBtnClass = cn(
    "h-7 w-7 shrink-0 rounded-md border border-border/70 bg-background shadow-sm",
    "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
  );

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)} style={style}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={dockBtnClass}
            onClick={openCommandPalette}
            aria-label="Search commands"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Search commands</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              dockBtnClass,
              explorerOpen && "border-border/70 bg-background text-foreground"
            )}
            onClick={toggleExplorer}
            aria-label={explorerOpen ? "Close explorer" : "Open explorer"}
            aria-expanded={explorerOpen}
          >
            {explorerOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{explorerOpen ? "Close explorer" : "Open explorer"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function NotebookLeftRail() {
  const { project, uploadPaperPdf } = useResearchProject();
  const {
    requestFocusSection,
    layout,
    openResearchToolPanel,
    closeResearchToolPanel,
    sidePanelDrawerOpen,
  } = useResearchWorkspace();
  const { chats, currentChatId, selectChat, createNewChat } = useChat();
  const { openChatPanel, explorerOpen, setExplorerOpen, explorerWidth, setExplorerWidth } = useNotebookStudio();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<RailTab>("files");
  const uploadRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const panel = parseResearchPanelFromSearch(searchParams.toString());
    if (panel) {
      setTab("tools");
      setExplorerOpen(true);
    }
  }, [searchParams, setExplorerOpen]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      setExplorerWidth(resizeRef.current.startWidth + delta);
    };
    const onUp = () => {
      resizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setExplorerWidth]);

  if (!project) return null;

  const outline = parseOutline(project.draftTex);
  // Only treat as "active" when the drawer was explicitly opened by the user.
  const activeTool: ResearchSidePanelId | null =
    sidePanelDrawerOpen && layout.activeSidePanel !== "editor"
      ? (layout.activeSidePanel as ResearchSidePanelId)
      : null;

  const onBulkUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (file.type === "application/pdf") await uploadPaperPdf(file);
    }
  };

  const openTool = (id: ResearchSidePanelId) => {
    openResearchToolPanel(id);
    setSearchParams({ panel: id }, { replace: true });
    setTab("tools");
    setExplorerOpen(true);
  };

  const closeTool = () => {
    closeResearchToolPanel();
    const next = new URLSearchParams(searchParams);
    next.delete("panel");
    setSearchParams(next, { replace: true });
  };

  const tabs: { id: RailTab; label: string; Icon: typeof Files }[] = [
    { id: "files", label: "Files", Icon: Files },
    { id: "chats", label: "Chats", Icon: MessageSquare },
    { id: "outline", label: "Outline", Icon: ListTree },
    { id: "tools", label: "Tools", Icon: Wrench },
  ];

  const selectTab = (id: RailTab) => {
    setTab(id);
    if (id === "tools" && activeTool) openResearchToolPanel(activeTool);
  };

  const startResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: explorerWidth };
  };

  return (
    <>
      <aside
        aria-hidden={!explorerOpen}
        className={cn(
          "pointer-events-auto absolute bottom-0 z-[55] flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card/95 shadow-xl backdrop-blur-sm transition-[opacity,transform] duration-200",
          explorerOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-2 opacity-0"
        )}
        style={{
          left: NOTEBOOK_EXPLORER_LEFT_PX,
          top: NOTEBOOK_STUDIO_TOOLBAR_HEIGHT_PX + NOTEBOOK_EXPLORER_TOP_OFFSET_PX,
          width: explorerWidth,
        }}
      >
        <nav className="flex shrink-0 flex-row items-center justify-evenly border-b border-border/40 px-1 py-1.5">
          {tabs.map(({ id, label, Icon }) => (
            <RailTabButton
              key={id}
              id={id}
              label={label}
              Icon={Icon}
              active={tab === id}
              onSelect={() => selectTab(id)}
            />
          ))}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {tab === "files" && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <input
                ref={uploadRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  void onBulkUpload(e.target.files);
                  e.target.value = "";
                }}
              />
              <NotebookFileTree onUploadPdfs={() => uploadRef.current?.click()} />
            </div>
          )}

          {tab === "chats" && (
            <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mb-2 mt-2 h-8 shrink-0 gap-1.5 text-xs"
                onClick={() => createNewChat()}
              >
                <Plus className="h-3.5 w-3.5" />
                New chat
              </Button>
              <ScrollArea className="min-h-0 flex-1">
                <ul className="space-y-0.5">
                  {chats.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50",
                          currentChatId === c.id && "bg-primary/8 text-primary"
                        )}
                        onClick={() => {
                          selectChat(c.id);
                          openChatPanel();
                        }}
                      >
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="min-w-0 truncate">{c.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          {tab === "outline" && (
            <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
              {outline.length === 0 ? (
                <p className="px-1 py-4 text-xs text-muted-foreground">
                  Add <code className="rounded bg-muted px-1">\section{"{…}"}</code> in main.tex.
                </p>
              ) : (
                <ul className="space-y-0.5 py-2">
                  {outline.map((h) => (
                    <li key={h.line}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                        onClick={() => requestFocusSection(h.line)}
                      >
                        <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
                        <span className="truncate">{h.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          )}

          {tab === "tools" && !activeTool && (
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-1 p-2">
                {RESEARCH_PANEL_NAV.map((item) => (
                  <ToolNavCard
                    key={item.id}
                    item={item}
                    active={false}
                    onClick={() => openTool(item.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}

          {tab === "tools" && activeTool && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Panel header with back button */}
              <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 bg-muted/20 px-2 py-1.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={closeTool}
                  aria-label="Back to tools list"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
                {(() => {
                  const navItem = RESEARCH_PANEL_NAV.find((n) => n.id === activeTool);
                  return (
                    <div className="flex min-w-0 items-center gap-1.5">
                      {navItem && (
                        <navItem.Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                      <span className="truncate text-xs font-semibold">
                        {PANEL_LABELS[activeTool]}
                      </span>
                    </div>
                  );
                })()}
              </div>
              {/* Panel content renders inline — no modal, no sheet */}
              <div className="min-h-0 flex-1 overflow-hidden">
                <ResearchSidePanel id={activeTool} />
              </div>
            </div>
          )}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize explorer"
          title="Drag to resize"
          className="absolute bottom-0 right-0 top-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/40"
          onMouseDown={startResize}
        />
      </aside>

    </>
  );
}
