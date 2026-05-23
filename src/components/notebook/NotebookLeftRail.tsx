import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

function ToolNavButton({
  item,
  active,
  onClick,
}: {
  item: ResearchPanelNavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={item.label}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors",
            active
              ? "bg-primary/10 text-primary shadow-sm"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
          onClick={onClick}
        >
          <item.Icon className="h-4 w-4 shrink-0 opacity-85" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px]">
        <p className="font-medium">{item.label}</p>
        <p className="text-xs text-muted-foreground">{item.description}</p>
      </TooltipContent>
    </Tooltip>
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
  const activeTool =
    layout.activeSidePanel !== "editor" ? (layout.activeSidePanel as ResearchSidePanelId) : null;

  const onBulkUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (file.type === "application/pdf") await uploadPaperPdf(file);
    }
  };

  const openTool = (id: ResearchSidePanelId) => {
    if (activeTool === id && sidePanelDrawerOpen) {
      closeTool();
      return;
    }
    openResearchToolPanel(id);
    setSearchParams({ panel: id }, { replace: true });
    setTab("tools");
  };

  const closeTool = () => {
    closeResearchToolPanel();
    const next = new URLSearchParams(searchParams);
    next.delete("panel");
    setSearchParams(next, { replace: true });
  };

  const onToolDrawerOpenChange = (open: boolean) => {
    if (open) {
      if (activeTool) openResearchToolPanel(activeTool);
      return;
    }
    closeTool();
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

          {tab === "tools" && (
            <ScrollArea className="min-h-0 flex-1">
              <div className="grid grid-cols-4 justify-items-center gap-1 p-2">
                {RESEARCH_PANEL_NAV.map((item) => (
                  <ToolNavButton
                    key={item.id}
                    item={item}
                    active={activeTool === item.id && sidePanelDrawerOpen}
                    onClick={() => openTool(item.id)}
                  />
                ))}
              </div>
            </ScrollArea>
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

      <Sheet open={sidePanelDrawerOpen} onOpenChange={onToolDrawerOpenChange}>
        <SheetContent
          key={sidePanelDrawerOpen && activeTool ? `${activeTool}-open` : "tool-drawer-closed"}
          side="right"
          className="flex w-[min(400px,90vw)] flex-col p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
            <SheetTitle>{activeTool ? PANEL_LABELS[activeTool] : "Research tool"}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            {activeTool && sidePanelDrawerOpen ? <ResearchSidePanel id={activeTool} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
