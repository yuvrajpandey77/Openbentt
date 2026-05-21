import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useResearchWorkspace } from "@/context/ResearchWorkspaceContext";
import { useChat } from "@/context/ChatContext";
import { useNotebookStudio } from "@/context/NotebookStudioContext";
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
  Wrench,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const RAIL_COLLAPSED_KEY = "openbentt-notebook-rail-collapsed";

type RailTab = "files" | "chats" | "outline" | "tools";

const TAB_HINTS: Record<RailTab, string> = {
  files: "Project files, PDFs, and assets",
  chats: "Chat threads for this session",
  outline: "LaTeX section headings from main.tex",
  tools: "Citations, Zotero, notes, and research panels",
};

function chatInitials(title: string): string {
  const t = title.trim() || "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return t.slice(0, 2).toUpperCase();
}

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
  collapsed,
  onSelect,
}: {
  id: RailTab;
  label: string;
  Icon: typeof Files;
  active: boolean;
  collapsed: boolean;
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
      <TooltipContent side={collapsed ? "right" : "bottom"} className="max-w-[220px]">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{TAB_HINTS[id]}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ToolNavButton({
  item,
  active,
  tooltipSide,
  onClick,
}: {
  item: ResearchPanelNavItem;
  active: boolean;
  tooltipSide: "right" | "bottom";
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
      <TooltipContent side={tooltipSide} className="max-w-[220px]">
        <p className="font-medium">{item.label}</p>
        <p className="text-xs text-muted-foreground">{item.description}</p>
      </TooltipContent>
    </Tooltip>
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
  const { openChatPanel } = useNotebookStudio();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<RailTab>("files");
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(RAIL_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    const panel = parseResearchPanelFromSearch(searchParams.toString());
    if (panel) setTab("tools");
  }, [searchParams]);

  if (!project) return null;

  const outline = parseOutline(project.draftTex);
  const activeTool =
    layout.activeSidePanel !== "editor" ? (layout.activeSidePanel as ResearchSidePanelId) : null;
  const toolTooltipSide = collapsed ? "right" : "bottom";

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
  };

  const closeTool = () => {
    closeResearchToolPanel();
    setSearchParams({}, { replace: true });
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

  return (
    <>
      <aside
        className={cn(
          "relative flex h-full shrink-0 flex-col border-r border-border/40 bg-background transition-[width] duration-200",
          collapsed ? "w-[52px]" : "w-[240px]"
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center border-b border-border/40 px-1.5 py-1.5",
            collapsed ? "justify-center" : "justify-end"
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? "Expand explorer rail" : "Collapse explorer rail"}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? "right" : "bottom"}>
              {collapsed ? "Expand explorer" : "Collapse explorer"}
            </TooltipContent>
          </Tooltip>
        </div>

        <nav
          className={cn(
            "flex shrink-0 border-b border-border/40",
            collapsed ? "flex-col items-center gap-0.5 py-2" : "flex-row items-center justify-evenly px-1 py-1.5"
          )}
        >
          {tabs.map(({ id, label, Icon }) => (
            <RailTabButton
              key={id}
              id={id}
              label={label}
              Icon={Icon}
              active={tab === id}
              collapsed={collapsed}
              onSelect={() => selectTab(id)}
            />
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === "files" && (
            <>
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
              {!collapsed ? (
                <NotebookFileTree onUploadPdfs={() => uploadRef.current?.click()} />
              ) : (
                <div className="flex flex-col items-center gap-1 py-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9"
                        aria-label="Upload PDFs"
                        onClick={() => uploadRef.current?.click()}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Upload PDFs</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </>
          )}

          {tab === "chats" && collapsed && (
            <ScrollArea className="h-full">
              <div className="flex flex-col items-center gap-1 py-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      aria-label="New chat"
                      onClick={() => createNewChat()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">New chat</TooltipContent>
                </Tooltip>
                {chats.map((c) => (
                  <Tooltip key={c.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-md text-[10px] font-semibold transition-colors",
                          currentChatId === c.id
                            ? "bg-primary/10 text-primary"
                            : "bg-muted/50 text-foreground hover:bg-muted"
                        )}
                        onClick={() => {
                          selectChat(c.id);
                          openChatPanel();
                        }}
                      >
                        {chatInitials(c.title)}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[240px]">
                      {c.title}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </ScrollArea>
          )}

          {tab === "chats" && !collapsed && (
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

          {tab === "outline" && collapsed && (
            <ScrollArea className="h-full">
              <div className="flex flex-col items-center gap-1 py-2">
                {outline.length === 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground/50">
                        <ListTree className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[220px]">
                      Add <code className="rounded bg-muted px-1">\section{"{…}"}</code> in main.tex
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  outline.map((h) => (
                    <Tooltip key={h.line}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          onClick={() => requestFocusSection(h.line)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[240px]">
                        {h.label}
                      </TooltipContent>
                    </Tooltip>
                  ))
                )}
              </div>
            </ScrollArea>
          )}

          {tab === "outline" && !collapsed && (
            <ScrollArea className="h-full px-2 pb-2">
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
            <ScrollArea className="h-full">
              <div
                className={cn(
                  "gap-1 p-2",
                  collapsed ? "flex flex-col items-center" : "grid grid-cols-4 justify-items-center"
                )}
              >
                {RESEARCH_PANEL_NAV.map((item) => (
                  <ToolNavButton
                    key={item.id}
                    item={item}
                    active={activeTool === item.id && sidePanelDrawerOpen}
                    tooltipSide={toolTooltipSide}
                    onClick={() => openTool(item.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </aside>

      <Sheet open={sidePanelDrawerOpen} onOpenChange={(o) => !o && closeTool()}>
        <SheetContent side="right" className="flex w-[min(400px,90vw)] flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
            <SheetTitle>{activeTool ? PANEL_LABELS[activeTool] : "Research tool"}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            {activeTool && <ResearchSidePanel id={activeTool} />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
