import React, { useState, useEffect, useCallback, useMemo } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import {
  Plus,
  Home,
  MessageSquare,
  FolderKanban,
  FolderOpen,
  Files,
  BookOpen,
  FileStack,
  NotebookPen,
  ListTodo,
  FlaskConical,
  ServerCog,
  Settings,
  Menu,
  Search,
  Bot,
  Mic,
  Cpu,
  GitBranch,
  Plug,
  Stethoscope,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FolderTree,
  FileText,
  ChevronUp,
  User,
  LogOut,
  HelpCircle,
  Pin,
  PinOff,
  MoreHorizontal,
  Image,
  Calendar,
  Zap,
  Compass,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { AccountMenu } from "@/components/AccountMenu";
import { LocalAIStatus } from "@/components/LocalAIStatus";
import { getDesktopApi } from "@/lib/desktopApi";
import { resolveExecutionWorkspace } from "@/context/ChatContext";
import { openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";

/**
 * ChatGPT-style sidebar — compact, dark, professional AI workspace.
 * Uses CSS variables for theming.
 */

const PRIMARY_NAV_ITEMS = [
  { icon: Plus, label: "New chat", id: "new-chat", shortcut: "⌘N", action: "new-chat" },
  { icon: Calendar, label: "Scheduled", id: "scheduled", shortcut: null, to: "/scheduled" },
  { icon: BookOpen, label: "Research", id: "research", shortcut: null, to: "/labs" },
  { icon: Mic, label: "Voice", id: "voice", shortcut: null, to: "/voice" },
];

const WORKSPACE_ITEMS = [
  { icon: Files, label: "Files", id: "files", to: "/files" },
  { icon: BookOpen, label: "Research", id: "research", to: "/labs" },
  { icon: FileStack, label: "Documents", id: "documents", to: "/documents" },
  { icon: NotebookPen, label: "Editor", id: "notebook", to: "/notebook" },
];

const ACTIVITY_ITEMS = [
  { icon: ListTodo, label: "Tasks", id: "tasks", to: "/tasks" },
];

const MORE_ITEMS = [
  { icon: Bot, label: "Computer Use", id: "computer", to: "/diagnostics" },
  { icon: Cpu, label: "Models", id: "models", to: "/settings" },
  { icon: GitBranch, label: "Git", id: "git", to: "/files" },
  { icon: Plug, label: "Integrations", id: "integrations", to: "/setup" },
  { icon: FlaskConical, label: "Developer", id: "developer", to: "/benchmark" },
  { icon: ServerCog, label: "Providers", id: "providers", to: "/setup" },
  { icon: Stethoscope, label: "Diagnostics", id: "diagnostics", to: "/diagnostics" },
  { icon: Settings, label: "Settings", id: "settings", to: "/settings" },
];

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenSearch: () => void;
  onOpenLocalAI: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen,
  onCloseMobile,
  collapsed,
  onToggleCollapsed,
  onOpenSearch,
  onOpenLocalAI,
}) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    chats, 
    currentChatId, 
    createNewChat, 
    selectChat, 
    activeProjectId 
  } = useChat();
  const { projects: researchProjects } = useResearchProject();
  const activeProject = researchProjects.find((p) => p.id === activeProjectId);

  const handleNewChat = () => {
    createNewChat();
    navigate("/chat");
    onCloseMobile();
  };

  const handleSelectChat = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    selectChat(chatId);
    if (chat?.projectId) navigate(`/projects/${chat.projectId}/chat/${chatId}`);
    else navigate(`/chat/${chatId}`);
    onCloseMobile();
  };

  // Recent chats (no project)
  const recentGlobalChats = useMemo(() => 
    chats.slice(-5).reverse().filter(c => !c.projectId), 
    [chats]
  );

  const recentChats = chats.slice(-30).reverse();
  const [showAllChats, setShowAllChats] = useState(false);
  const [showMoreNav, setShowMoreNav] = useState(false);
  const [showFilesBrowser, setShowFilesBrowser] = useState(false);
  const [filesBrowserData, setFilesBrowserData] = useState<{ path: string; kind: string }[] | null>(null);
  const [filesBrowserLoading, setFilesBrowserLoading] = useState(false);
  const [filesBrowserError, setFilesBrowserError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  const fetchFilesBrowser = useCallback(async () => {
    const workspaceRoot = resolveExecutionWorkspace(activeProjectId);
    let root = workspaceRoot;
    if (!root) {
      try {
        const res = await openCodeAgentApi.defaultWorkspace();
        root = res?.path;
      } catch {
        root = "";
      }
    }
    if (!root) {
      setFilesBrowserError("No workspace folder selected");
      return;
    }
    setFilesBrowserLoading(true);
    setFilesBrowserError(null);
    try {
      const api = getDesktopApi();
      if (!api?.workspaceList) {
        setFilesBrowserError("File listing not available");
        return;
      }
      const entries = await api.workspaceList(root, ".", 2);
      setFilesBrowserData(entries);
    } catch (e) {
      setFilesBrowserError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setFilesBrowserLoading(false);
    }
  }, [activeProjectId]);

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  };

  const iconOnly = !isMobile && collapsed;
  const showLabels = isMobile || !collapsed;

  const renderNavItem = (item: { 
    icon: React.ElementType; 
    label: string; 
    id: string; 
    to?: string; 
    shortcut?: string | null;
    action?: string;
  }) => {
    const isActive = item.to && (location.pathname === item.to || location.pathname.startsWith(item.to + "/"));
    const isNewChatActive = item.action === "new-chat" && location.pathname === "/chat";
    const active = isActive || isNewChatActive;
    const Icon = item.icon;

    const handleClick = () => {
      if (item.action === "new-chat") {
        handleNewChat();
      } else if (item.to) {
        navigate(item.to);
        onCloseMobile();
      }
    };

    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            aria-current={active ? "page" : undefined}
            className={cn(
              "sidebar-nav-item",
              collapsed && "sidebar-nav-item--icon-only",
              isMobile && "sidebar-nav-item--mobile",
              active && "sidebar-nav-item--active"
            )}
          >
            <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} strokeWidth={1.5} />
            {showLabels && (
              <>
                <span className="sidebar-nav-label truncate">{item.label}</span>
                {item.shortcut && !collapsed && (
                  <kbd className="ml-auto rounded border border-border bg-muted px-1.5 text-[10px] text-muted-foreground">
                    {item.shortcut}
                  </kbd>
                )}
              </>
            )}
          </button>
        </TooltipTrigger>
        {iconOnly && (
          <TooltipContent side="right" className="border-border bg-popover text-xs text-popover-foreground">
            {item.label}
          </TooltipContent>
        )}
      </Tooltip>
    );
  };

  const renderRecentChat = (chat: { id: string; title: string; projectId?: string | null }) => {
    const active = currentChatId === chat.id;
    return (
      <button
        key={chat.id}
        type="button"
        onClick={() => handleSelectChat(chat.id)}
        title={chat.title || "Untitled chat"}
        className={cn(
          "sidebar-nav-item",
          collapsed && "sidebar-nav-item--icon-only",
          isMobile && "sidebar-nav-item--mobile",
          active && "sidebar-nav-item--active"
        )}
        aria-current={active ? "page" : undefined}
      >
        <Pin className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} strokeWidth={1.5} />
        {showLabels && (
          <span className="sidebar-nav-label truncate">{chat.title || "Untitled chat"}</span>
        )}
      </button>
    );
  };

  const toggleFilesBrowser = () => {
    setShowFilesBrowser((v) => {
      if (!v) fetchFilesBrowser();
      return !v;
    });
  };

  const handleSelectProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
    onCloseMobile();
    setShowProjectDropdown(false);
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[var(--z-sidebar)] flex flex-col",
          "bg-background border-r border-border",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isMobile
            ? "w-full border-0"
            : collapsed
              ? "w-[56px] border-r border-border"
              : "w-[260px] border-r border-border",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
        aria-label="Primary navigation"
      >
        {isMobileOpen && isMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        <div className={cn("flex h-full flex-col", collapsed ? "px-2" : "px-3")}>
          {/* HEADER — 52px */}
          <div className={cn(
            "flex shrink-0 items-center justify-between gap-2",
            collapsed ? "py-3 justify-center h-[52px]" : "py-3 px-1 h-[52px]"
          )}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <img
                src="/openbentt-logo.svg"
                alt="Openbentt"
                className={cn(
                  "shrink-0 object-contain transition-all duration-200",
                  collapsed ? "h-8 w-8" : "h-7 w-7"
                )}
              />
              {showLabels && (
                <span className={cn("font-medium text-foreground truncate", isMobile ? "text-sm" : "text-base")}>
                  Openbentt
                </span>
              )}
            </div>
            
            {!isMobile && !collapsed && (
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onOpenSearch}
                      className="sidebar-nav-item p-1.5 rounded-lg"
                      aria-label="Search (⌘K)"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Search</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onToggleCollapsed}
                      className="sidebar-nav-item p-1.5 rounded-lg"
                      aria-label="Collapse sidebar"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Collapse sidebar</TooltipContent>
                </Tooltip>
              </div>
            )}
            
            {collapsed && !isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onToggleCollapsed}
                    className="sidebar-nav-item p-1.5 rounded-lg"
                    aria-label="Expand sidebar"
                  >
                    <Menu className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* PROJECT DROPDOWN — replaces project section in header */}
          {!collapsed && !isMobile && researchProjects.length > 0 && (
            <div className="relative mb-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-2 text-left rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    aria-expanded={showProjectDropdown}
                    aria-label="Switch project"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate text-foreground font-medium text-sm">
                        {activeProject?.title || (researchProjects[0]?.title || "Select project")}
                      </span>
                    </div>
                    <ChevronRight className={cn(
                      "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                      showProjectDropdown && "rotate-90"
                    )} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Switch project</TooltipContent>
              </Tooltip>
              {showProjectDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg bg-card border border-border py-1 shadow-lg animate-fade-in-up">
                  {researchProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => handleSelectProject(project.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{project.title}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      navigate("/projects");
                      onCloseMobile();
                      setShowProjectDropdown(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span>New project</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SCROLLABLE CONTENT */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hide">
            <FeatureErrorBoundary feature="sidebar-nav">
              
              {/* PRIMARY NAVIGATION — 36px rows */}
              <nav className="flex shrink-0 flex-col gap-0.5 mb-4" aria-label="Primary navigation">
                {PRIMARY_NAV_ITEMS.map(renderNavItem)}
              </nav>

              {/* PINNED SECTION */}
              {showLabels && recentGlobalChats.length > 0 && (
                <>
                  <div className="flex shrink-0 items-center gap-2 mb-2 px-1">
                    <Pin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-[12px] leading-[16px] text-muted-foreground font-medium">Recent</span>
                  </div>
                  <nav className="flex shrink-0 flex-col gap-0.5 mb-4" aria-label="Recent conversations">
                    {recentGlobalChats.map(renderRecentChat)}
                  </nav>
                </>
              )}

              {/* WORKSPACE SECTION */}
              {showLabels && (
                <>
                  <div className="flex shrink-0 items-center gap-2 mb-2 px-1">
                    <Files className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-[12px] leading-[16px] text-muted-foreground font-medium">Workspace</span>
                  </div>
                  <nav className="flex shrink-0 flex-col gap-0.5 mb-4" aria-label="Workspace">
                    {WORKSPACE_ITEMS.map(renderNavItem)}
                  </nav>
                </>
              )}

              {/* ACTIVITY SECTION */}
              {showLabels && (
                <>
                  <div className="flex shrink-0 items-center gap-2 mb-2 px-1">
                    <ListTodo className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-[12px] leading-[16px] text-muted-foreground font-medium">Activity</span>
                  </div>
                  <nav className="flex shrink-0 flex-col gap-0.5 mb-4" aria-label="Activity">
                    {ACTIVITY_ITEMS.map(renderNavItem)}
                  </nav>
                </>
              )}

              {/* MORE SECTION — collapsible */}
              {showLabels && (
                <>
                  <div className="flex shrink-0 items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-[12px] leading-[16px] text-muted-foreground font-medium">More</span>
                    </div>
                    {MORE_ITEMS.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setShowMoreNav((v) => !v)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground p-1 rounded"
                        aria-expanded={showMoreNav}
                      >
                        <ChevronRight className={cn("h-3 w-3 transition-transform", showMoreNav && "rotate-90")} />
                        <span className="hidden md:inline">{showMoreNav ? "Show less" : `Show more (${MORE_ITEMS.length - 4})`}</span>
                      </button>
                    )}
                  </div>
                  <nav className="flex shrink-0 flex-col gap-0.5 mb-4" aria-label="More capabilities">
                    {(showMoreNav ? MORE_ITEMS : MORE_ITEMS.slice(0, 4)).map(renderNavItem)}
                  </nav>
                </>
              )}

              {/* FILES BROWSER */}
              {showLabels && (
                <>
                  <div className="flex shrink-0 items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-[12px] leading-[16px] text-muted-foreground font-medium">Files</span>
                    </div>
                    <button
                      type="button"
                      onClick={toggleFilesBrowser}
                      className={cn(
                        "flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground p-1 rounded",
                        showFilesBrowser && "bg-muted"
                      )}
                      aria-expanded={showFilesBrowser}
                    >
                      <ChevronRight className={cn("h-3 w-3 transition-transform", showFilesBrowser && "rotate-90")} />
                      <span className="hidden md:inline">{showFilesBrowser ? "Hide" : "Show"}</span>
                    </button>
                  </div>
                  {showFilesBrowser && (
                    <div className={cn("space-y-1 overflow-y-auto max-h-64 mb-4", isMobile ? "px-3" : "pr-1")}>
                      {filesBrowserLoading ? (
                        <div className="flex items-center justify-center py-4 text-[11px] text-muted-foreground">
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                          Loading files…
                        </div>
                      ) : filesBrowserError ? (
                        <div className="flex flex-col items-center gap-1.5 py-4 text-[11px] text-muted-foreground">
                          <p>{filesBrowserError}</p>
                          <button
                            type="button"
                            onClick={fetchFilesBrowser}
                            className="text-primary hover:underline text-[10px]"
                          >
                            Retry
                          </button>
                        </div>
                      ) : filesBrowserData ? (
                        <>
                          {filesBrowserData.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground/70 py-2">Empty folder</p>
                          ) : (
                            filesBrowserData.map((entry) => (
                              <FileBrowserEntry
                                key={entry.path}
                                entry={entry}
                                expandedDirs={expandedDirs}
                                onToggleDir={toggleDir}
                                isMobile={isMobile}
                              />
                            ))
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={fetchFilesBrowser}
                          className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground py-2"
                        >
                          Load workspace files
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

            </FeatureErrorBoundary>
          </div>

          {/* BOTTOM ACCOUNT AREA — 48-56px */}
          <div className={cn("mt-auto flex shrink-0 flex-col gap-2 pt-3 border-t border-border", collapsed ? "items-center" : "")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onOpenLocalAI}
                  className={cn(
                    "sidebar-nav-item w-full justify-start",
                    collapsed && "sidebar-nav-item--icon-only"
                  )}
                  aria-label="Local AI Status"
                >
                  <Cpu className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} strokeWidth={1.5} />
                  {showLabels && <LocalAIStatus onOpen={onOpenLocalAI} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="w-64">Local AI status and settings</TooltipContent>
            </Tooltip>
            
            <AccountMenu
              collapsed={!showLabels}
              onOpenSettings={() => {
                navigate("/settings");
                onCloseMobile();
              }}
            />
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
};

export default Sidebar;

// File browser entry component (kept from original)
function FileBrowserEntry({
  entry,
  expandedDirs,
  onToggleDir,
  isMobile,
}: {
  entry: { path: string; kind: string };
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  isMobile: boolean;
}) {
  const isDir = entry.kind === "directory";
  const isExpanded = expandedDirs.has(entry.path);
  const name = entry.path.split("/").pop() || entry.path;

  if (!isDir) {
    return (
      <div className="flex items-center gap-2 pl-6 py-0.5 text-[11px] text-muted-foreground">
        <FileText className="h-3 w-3 shrink-0" />
        <span className="truncate">{name}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => onToggleDir(entry.path)}
        className="flex items-center gap-2 pl-4 py-0.5 text-left text-[11px] text-muted-foreground hover:text-foreground rounded"
        aria-expanded={isExpanded}
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", isExpanded && "rotate-90")} />
        <FolderTree className="h-3 w-3 shrink-0" />
        <span className="truncate">{name}</span>
      </button>
      {isExpanded && (
        <div className="pl-6">
          <LoadDirContents path={entry.path} expandedDirs={expandedDirs} onToggleDir={onToggleDir} isMobile={isMobile} />
        </div>
      )}
    </div>
  );
}

function LoadDirContents({
  path: dirPath,
  expandedDirs,
  onToggleDir,
  isMobile,
}: {
  path: string;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  isMobile: boolean;
}) {
  const [entries, setEntries] = useState<{ path: string; kind: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDesktopApi()?.workspaceList?.(dirPath, ".", 1).then((res) => {
      if (!cancelled) {
        setEntries(res);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setEntries([]);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [dirPath]);

  if (loading) {
    return <div className="flex items-center gap-2 pl-6 py-1 text-[11px] text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" /> Loading…</div>;
  }
  if (!entries || entries.length === 0) {
    return <div className="pl-6 py-1 text-[11px] text-muted-foreground/70">Empty</div>;
  }
  return (
    <>
      {entries.map((entry) => (
        <FileBrowserEntry
          key={entry.path}
          entry={entry}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
          isMobile={isMobile}
        />
      ))}
    </>
  );
}