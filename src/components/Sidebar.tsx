import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { AccountMenu } from "@/components/AccountMenu";
import { LocalAIStatus } from "@/components/LocalAIStatus";

/**
 * ONE persistent sidebar — the global control surface. Chat, projects,
 * files, research, tasks, voice, and computer use are capabilities of the
 * same workspace, not destinations in different apps. Execution lives
 * inside conversations (OpenCode underneath); /agent stays hidden.
 *
 * HOME / PROJECTS / WORKSPACE / ACTIVITY, then SEE MORE for the rest.
 */

const HOME_ITEMS = [
  { icon: Home, label: "Home", id: "home", to: "/" },
  { icon: MessageSquare, label: "Chat", id: "chat", to: "/chat" },
];

const PROJECT_ITEMS = [
  { icon: FolderKanban, label: "Projects", id: "projects", to: "/projects" },
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

/** Same shell, expanded: capabilities, integrations, system. */
const MORE_ITEMS = [
  { icon: Bot, label: "Computer Use", id: "computer", to: "/diagnostics" },
  { icon: Mic, label: "Voice", id: "voice", to: "/diagnostics" },
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
  const { chats, currentChatId, createNewChat, selectChat, activeProjectId } = useChat();
  const { projects } = useResearchProject();
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const handleNewChat = () => {
    createNewChat();
    navigate("/chat");
    onCloseMobile();
  };

  const handleSelectChat = (chatId: string) => {
    // Back navigation preserves project context: project conversations
    // reopen inside their project, global ones in chat. No duplicates.
    const chat = chats.find((c) => c.id === chatId);
    selectChat(chatId);
    if (chat?.projectId) navigate(`/projects/${chat.projectId}/chat/${chatId}`);
    else navigate(`/chat/${chatId}`);
    onCloseMobile();
  };

  const fetchFilesBrowser = async () => {
    const { resolveExecutionWorkspace } = await import("@/context/ChatContext");
    const { openCodeAgentApi } = await import("@/lib/agent/openCodeAgentApi");
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
  };

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

  const recentChats = chats.slice(-30).reverse();
  const projectChats = activeProjectId
    ? chats.filter((c) => c.projectId === activeProjectId).slice(-20).reverse()
    : [];
  const [showAllChats, setShowAllChats] = useState(false);
  const [showMoreNav, setShowMoreNav] = useState(false);
  const [showFilesBrowser, setShowFilesBrowser] = useState(false);
  const [filesBrowserData, setFilesBrowserData] = useState<{ path: string; kind: string }[] | null>(null);
  const [filesBrowserLoading, setFilesBrowserLoading] = useState(false);
  const [filesBrowserError, setFilesBrowserError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const renderNavItem = (item: { icon: React.ElementType; label: string; id: string; to: string }) => {
    const active =
      location.pathname === item.to || location.pathname.startsWith(item.to + "/");
    const Icon = item.icon;
    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>
          <NavLink
            to={item.to}
            onClick={onCloseMobile}
            aria-current={active ? "page" : undefined}
            className={cn(
              "sidebar-nav-item",
              collapsed && "sidebar-nav-item--icon-only",
              isMobile && "sidebar-nav-item--mobile",
              active && "sidebar-nav-item--active"
            )}
          >
            <Icon className={cn("shrink-0", collapsed ? "h-6 w-6" : "h-5 w-5")} strokeWidth={1.5} />
            {showLabels && <span className="sidebar-nav-label truncate">{item.label}</span>}
          </NavLink>
        </TooltipTrigger>
        {iconOnly && (
          <TooltipContent side="right" className="border-[#495056] bg-[#24292D] text-xs text-[#E8F1F6]">
            {item.label}
          </TooltipContent>
        )}
      </Tooltip>
    );
  };

  const renderActionButton = (
    key: string,
    label: string,
    hint: string | undefined,
    Icon: React.ElementType,
    onClick: () => void
  ) => (
    <Tooltip key={key}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "sidebar-nav-item",
            collapsed && "sidebar-nav-item--icon-only",
            isMobile && "sidebar-nav-item--mobile"
          )}
          aria-label={hint ? `${label} (${hint})` : label}
        >
          <Icon className={cn("shrink-0", collapsed ? "h-6 w-6" : "h-5 w-5")} strokeWidth={1.5} />
          {showLabels && (
            <span className="sidebar-nav-label flex flex-1 items-center justify-between">
              {label}
              {hint && (
                <kbd className="rounded border border-border bg-muted px-1 text-[10px] text-muted-foreground">
                  {hint}
                </kbd>
              )}
            </span>
          )}
        </button>
      </TooltipTrigger>
      {iconOnly && (
        <TooltipContent side="right" className="border-[#495056] bg-[#24292D] text-xs text-[#E8F1F6]">
          {hint ? `${label} (${hint})` : label}
        </TooltipContent>
      )}
    </Tooltip>
  );

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-[var(--z-sidebar)] flex flex-col",
        "bg-[#101314]",
        "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        isMobile
          ? "w-full border-0"
          : collapsed
            ? "w-[56px] border-r border-[#24292D]"
            : "w-[240px] border-r border-[#24292D]",
        isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
      aria-label="Primary"
    >
      {isMobileOpen && isMobile && (
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close menu"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}

      <div className={cn("flex h-full flex-col", collapsed ? "px-2 py-4" : isMobile ? "overflow-y-auto px-5 py-6" : "px-3 py-4")}>
        {/* Header: Logo + Collapse Toggle */}
        <div
          className={cn(
            "flex items-center",
            collapsed ? "mb-6 justify-center" : isMobile ? "mb-8 justify-between" : "mb-6 justify-between px-1"
          )}
        >
          <div className={cn("sidebar-logo-area flex items-center gap-3", collapsed && "h-11 w-11")}>
            <img
              src="/openbentt-logo.svg"
              alt="Openbentt"
              className={cn(
                "sidebar-logo-img shrink-0 object-contain transition-opacity duration-200",
                collapsed ? "h-9 w-9" : isMobile ? "h-12 w-12" : "h-11 w-11"
              )}
            />
            {showLabels && (
              <span className={cn("font-semibold text-white", isMobile ? "text-base" : "text-sm")}>Openbentt</span>
            )}
            {!isMobile && collapsed && (
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="sidebar-collapsed-toggle"
                aria-label="Expand sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
          </div>
          {!isMobile && !collapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="sidebar-toggle-btn h-8 w-8"
              aria-label="Collapse sidebar"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* SCROLLABLE NAV — sections scroll, bottom bar never overlaps. */}
        <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hide", !isMobile && "")}>
        <FeatureErrorBoundary feature="sidebar-nav">
        {/* ACTIONS */}
        <nav className={cn("flex shrink-0 flex-col", isMobile ? "mb-6 gap-2" : "mb-4 gap-1")} aria-label="Actions">
          {renderActionButton("search", "Search", "⌘K", Search, () => {
            onOpenSearch();
            onCloseMobile();
          })}
           {renderActionButton("new", "New chat", "⌘N", Plus, handleNewChat)}
          </nav>

          {/* HOME */}
        {showLabels && (
          <>
            <div className={cn("h-px shrink-0 bg-[#24292D]", isMobile ? "mx-5 mb-4" : "mx-2 mb-3")} />
            <nav className="flex shrink-0 flex-col gap-1" aria-label="Home">
              {HOME_ITEMS.map(renderNavItem)}
            </nav>
          </>
        )}

        {/* PROJECTS (+ current project context, not a separate app) */}
        {showLabels && (
          <>
            <div className={cn("h-px shrink-0 bg-[#24292D]", isMobile ? "mx-5 mb-4" : "mx-2 mb-3")} />
            <p className={cn("sidebar-label mb-2 uppercase tracking-wider", isMobile ? "px-5" : "px-2")}>
              Projects
            </p>
            <nav className="flex shrink-0 flex-col gap-1" aria-label="Projects">
              {PROJECT_ITEMS.map(renderNavItem)}
              {activeProjectId &&
                renderNavItem({
                  icon: FolderOpen,
                  label: activeProject?.title ?? "Current project",
                  id: "current-project",
                  to: `/projects/${activeProjectId}`,
                })}
              {/* Project chats: clickable conversation options inside the project. */}
              {projectChats.length > 0 && (
                <nav className="flex shrink-0 flex-col gap-0.5" aria-label="Project chats">
                  {projectChats.map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => handleSelectChat(chat.id)}
                      title={chat.title}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg py-1.5 pl-8 pr-2 text-left text-[12px] transition-colors duration-150",
                        currentChatId === chat.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                      )}
                      aria-current={currentChatId === chat.id ? "true" : undefined}
                    >
                      <MessageSquare className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                      <span className="truncate">{chat.title || "Untitled chat"}</span>
                    </button>
                  ))}
                </nav>
              )}
            </nav>
          </>
        )}

        {/* WORKSPACE */}
        {showLabels && (
          <>
            <div className={cn("h-px shrink-0 bg-[#24292D]", isMobile ? "mx-5 mb-4" : "mx-2 mb-3")} />
            <p className={cn("sidebar-label mb-2 uppercase tracking-wider", isMobile ? "px-5" : "px-2")}>
              Workspace
            </p>
            <nav className="flex shrink-0 flex-col gap-1" aria-label="Workspace">
              {WORKSPACE_ITEMS.map(renderNavItem)}
            </nav>
          </>
        )}

        {/* ACTIVITY */}
        {showLabels && (
          <>
            <div className={cn("h-px shrink-0 bg-[#24292D]", isMobile ? "mx-5 mb-4" : "mx-2 mb-3")} />
            <p className={cn("sidebar-label mb-2 uppercase tracking-wider", isMobile ? "px-5" : "px-2")}>
              Activity
            </p>
            <nav className="flex shrink-0 flex-col gap-1" aria-label="Activity">
              {ACTIVITY_ITEMS.map(renderNavItem)}
            </nav>
          </>
        )}

        {/* MORE — all features visible, no hidden gate. */}
        {showLabels && (
          <>
            <div className={cn("h-px shrink-0 bg-[#24292D]", isMobile ? "mx-5 mb-4" : "mx-2 mb-3")} />
            <p className={cn("sidebar-label mb-2 shrink-0 uppercase tracking-wider", isMobile ? "px-5" : "px-2")}>
              More
            </p>
            <nav className="flex shrink-0 flex-col gap-1" aria-label="More capabilities">
              {(showMoreNav ? MORE_ITEMS : MORE_ITEMS.slice(0, 4)).map(renderNavItem)}
            </nav>
            {MORE_ITEMS.length > 4 && (
              <button
                type="button"
                onClick={() => setShowMoreNav((v) => !v)}
                className={cn(
                  "mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground",
                  isMobile ? "px-5" : "px-2"
                )}
              >
                {showMoreNav ? "Show less" : `Show more (${MORE_ITEMS.length - 4})`}
              </button>
            )}
          </>
        )}

        {/* FILES BROWSER — shows workspace files */}
        {showLabels && (
          <>
            <div className={cn("h-px shrink-0 bg-[#24292D]", isMobile ? "mx-5 mb-4" : "mx-2 mb-3")} />
            <div className="flex items-center justify-between mb-2">
              <p className={cn("sidebar-label uppercase tracking-wider", isMobile ? "px-5" : "px-2")}>
                Files
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowFilesBrowser((v) => !v);
                  if (!v) fetchFilesBrowser();
                }}
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
              <div className={cn("space-y-1 overflow-y-auto max-h-64", isMobile ? "px-3" : "pr-1")}>
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
                    className="w-full text-left text-[11px] text-primary hover:underline py-2"
                  >
                    Load workspace files
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* RECENT CHATS — 4 visible, show more/less toggle at bottom. */}
        {showLabels && (
          <>
            <div className={cn("h-px shrink-0 bg-[#24292D]", isMobile ? "mx-5 mb-4" : "mx-2 mb-3")} />
            <div className="flex flex-1 flex-col overflow-hidden">
              {recentChats.length > 0 ? (
                <>
                  <p className={cn("sidebar-label mb-2 uppercase tracking-wider", isMobile ? "px-5" : "px-2")}>
                    Recent
                  </p>
                  <div className={cn("flex-1 space-y-0.5 overflow-y-auto", isMobile ? "px-3" : "pr-1")}>
                    {recentChats.slice(0, showAllChats ? recentChats.length : 4).map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => handleSelectChat(chat.id)}
                        title={chat.title}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg text-left text-sm transition-colors duration-200",
                          isMobile ? "px-4 py-2.5" : "px-2 py-1.5",
                          currentChatId === chat.id
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                        )}
                        aria-current={currentChatId === chat.id ? "true" : undefined}
                      >
                        <MessageSquare className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                        <span className="truncate">{chat.title || "Untitled chat"}</span>
                      </button>
                    ))}
                  </div>
                  {recentChats.length > 4 && (
                    <button
                      type="button"
                      className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2"
                      onClick={() => setShowAllChats((v) => !v)}
                    >
                      {showAllChats ? "Show less" : `Show all (${recentChats.length})`}
                    </button>
                  )}
                </>
              ) : (
                <p className={cn("text-xs text-[#96A0AB]/80", isMobile ? "px-5" : "px-2")}>
                  No chats yet — start a new chat above.
                </p>
              )}
            </div>
          </>
        )}

        {/* BOTTOM: Local AI Status + Account (pinned, never overlapped). */}
        </FeatureErrorBoundary>
        </div>
        <div className={cn("mt-auto flex shrink-0 flex-col gap-1 pt-3", collapsed ? "items-center" : isMobile ? "px-3" : "")}>
          {showLabels && <LocalAIStatus onOpen={onOpenLocalAI} />}
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
  );
};

export default Sidebar;

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
      <div className="flex items-center gap-2 pl-6 py-0.5 text-[11px] text-muted-foreground/80">
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
