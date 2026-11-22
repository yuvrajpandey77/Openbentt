import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import {
  Plus,
  MessageSquare,
  FolderKanban,
  Files,
  BookOpen,
  FileStack,
  NotebookPen,
  FlaskConical,
  Settings,
  Menu,
  Search,
  Bot,
  Cpu,
  Plug,
  Stethoscope,
  ChevronRight,
  ChevronUp,
  ListTodo,
  MoreHorizontal,
  History,
  FileType2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { AccountMenu } from "@/components/AccountMenu";
import { LocalAIStatus } from "@/components/LocalAIStatus";
import { isWorkspacePathAllowedOnWeb } from "@/config/platformSurface";

/**
 * Central sidebar — primary destinations always visible (including when collapsed).
 * Broken / niche routes stay under More.
 */

type NavItem = {
  icon: React.ElementType;
  label: string;
  id: string;
  to?: string;
  shortcut?: string | null;
  action?: "new-chat";
  hint?: string;
};

/** Always one click away — chat, projects, notebook/compile, library, settings. */
const PRIMARY_NAV: NavItem[] = [
  { icon: Plus, label: "New chat", id: "new-chat", shortcut: "⌘N", action: "new-chat" },
  { icon: MessageSquare, label: "Chat", id: "chat", to: "/chat", hint: "Home conversation" },
  { icon: FolderKanban, label: "Projects", id: "projects", to: "/projects", hint: "Research projects" },
  {
    icon: NotebookPen,
    label: "Notebook",
    id: "notebook",
    to: "/notebook",
    hint: "Write · compile · preview PDF",
  },
  { icon: FileStack, label: "Documents", id: "documents", to: "/documents" },
  { icon: BookOpen, label: "Research", id: "research", to: "/labs", hint: "Library & synthesis" },
];

const WORKSPACE_NAV: NavItem[] = [
  { icon: Files, label: "Files", id: "files", to: "/files" },
  { icon: ListTodo, label: "Tasks", id: "tasks", to: "/tasks" },
  { icon: FileType2, label: "Math / LaTeX", id: "write", to: "/write", hint: "KaTeX scratchpad" },
];

const MORE_NAV: NavItem[] = [
  { icon: Bot, label: "Agent", id: "agent", to: "/agent" },
  { icon: Plug, label: "Integrations", id: "integrations", to: "/setup" },
  { icon: Cpu, label: "Models", id: "models", to: "/settings" },
  { icon: FlaskConical, label: "Benchmark", id: "developer", to: "/benchmark" },
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
  const { projects: researchProjects } = useResearchProject();
  const activeProject = researchProjects.find((p) => p.id === activeProjectId);

  const [recentGlobalChats, setRecentGlobalChats] = useState<typeof chats>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showMoreNav, setShowMoreNav] = useState(false);

  const RECENT_CHATS_PER_PAGE = 8;

  useEffect(() => {
    const timer = setTimeout(() => {
      const filtered = chats.filter((c) => !c.projectId).reverse();
      setRecentGlobalChats(filtered.slice(0, RECENT_CHATS_PER_PAGE));
    }, 80);
    return () => clearTimeout(timer);
  }, [chats]);

  const iconOnly = !isMobile && collapsed;
  const showLabels = isMobile || !collapsed;
  const allowed = (item: NavItem) => !item.to || isWorkspacePathAllowedOnWeb(item.to);
  const primaryNav = PRIMARY_NAV.filter(allowed);
  const workspaceNav = WORKSPACE_NAV.filter(allowed);
  const moreNav = MORE_NAV.filter(allowed);

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

  const handleSelectProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
    onCloseMobile();
    setShowProjectDropdown(false);
  };

  const pathActive = (to?: string) => {
    if (!to) return false;
    if (to === "/chat") {
      return location.pathname === "/chat" || location.pathname.startsWith("/chat/");
    }
    if (to === "/projects") {
      return location.pathname === "/projects" || location.pathname.startsWith("/projects/");
    }
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  const renderNavItem = (item: NavItem) => {
    const active =
      item.action === "new-chat"
        ? location.pathname === "/chat" && !currentChatId
        : pathActive(item.to);
    const Icon = item.icon;

    const handleClick = () => {
      if (item.action === "new-chat") handleNewChat();
      else if (item.to) {
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
            <p className="font-medium">{item.label}</p>
            {item.hint && <p className="text-muted-foreground">{item.hint}</p>}
          </TooltipContent>
        )}
      </Tooltip>
    );
  };

  const renderRecentChat = (chat: { id: string; title: string }) => {
    const active = currentChatId === chat.id;
    return (
      <Tooltip key={chat.id}>
        <TooltipTrigger asChild>
          <button
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
            <MessageSquare className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} strokeWidth={1.5} />
            {showLabels && (
              <span className="sidebar-nav-label truncate">{chat.title || "Untitled chat"}</span>
            )}
          </button>
        </TooltipTrigger>
        {iconOnly && <TooltipContent side="right">Open conversation</TooltipContent>}
      </Tooltip>
    );
  };

  const sectionLabel = (text: string, Icon: React.ElementType) =>
    showLabels ? (
      <div className="mb-1.5 mt-1 flex shrink-0 items-center gap-2 px-1">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{text}</span>
      </div>
    ) : null;

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[var(--z-sidebar)] flex flex-col",
          "border-r border-border bg-background",
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
            <span className="text-lg leading-none">×</span>
          </button>
        )}

        <div className={cn("flex h-full flex-col", collapsed ? "px-2" : "px-3")}>
          <div
            className={cn(
              "flex h-[52px] shrink-0 items-center justify-between gap-2",
              collapsed ? "justify-center py-3" : "px-1 py-3"
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <img
                src="/openbentt-logo.svg"
                alt="Openbentt"
                className={cn(
                  "shrink-0 object-contain transition-all duration-200",
                  collapsed ? "h-8 w-8" : "h-7 w-7"
                )}
              />
              {showLabels && (
                <span className={cn("truncate font-medium text-foreground", isMobile ? "text-sm" : "text-base")}>
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
                      className="sidebar-nav-item rounded-lg p-1.5"
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
                      className="sidebar-nav-item rounded-lg p-1.5"
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
                    className="sidebar-nav-item rounded-lg p-1.5"
                    aria-label="Expand sidebar"
                  >
                    <Menu className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              </Tooltip>
            )}
          </div>

          {!collapsed && researchProjects.length > 0 && (
            <div className="relative mb-3">
              <button
                type="button"
                onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-muted/50 px-2 py-2 text-left transition-colors hover:bg-muted"
                aria-expanded={showProjectDropdown}
                aria-label="Switch project"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium text-foreground">
                    {activeProject?.title || researchProjects[0]?.title || "Select project"}
                  </span>
                </div>
                <ChevronRight
                  className={cn(
                    "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                    showProjectDropdown && "rotate-90"
                  )}
                />
              </button>
              {showProjectDropdown && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 animate-fade-in-up rounded-lg border border-border bg-card py-1 shadow-lg">
                  {researchProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => handleSelectProject(project.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
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
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span>All projects</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {collapsed && researchProjects.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() =>
                    navigate(activeProjectId ? `/projects/${activeProjectId}` : "/projects")
                  }
                  className="sidebar-nav-item sidebar-nav-item--icon-only mb-2"
                  aria-label="Open active project"
                >
                  <FolderKanban className="h-5 w-5" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {activeProject?.title || "Projects"}
              </TooltipContent>
            </Tooltip>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hide">
            <FeatureErrorBoundary feature="sidebar-nav">
              {sectionLabel("Main", NotebookPen)}
              <nav className="mb-3 flex shrink-0 flex-col gap-0.5" aria-label="Primary navigation">
                {primaryNav.map(renderNavItem)}
              </nav>

              {sectionLabel("Workspace", Files)}
              <nav className="mb-3 flex shrink-0 flex-col gap-0.5" aria-label="Workspace">
                {workspaceNav.map(renderNavItem)}
              </nav>

              {showLabels && recentGlobalChats.length > 0 && (
                <>
                  {sectionLabel("Recent", History)}
                  <nav className="mb-2 flex shrink-0 flex-col gap-0.5" aria-label="Recent conversations">
                    {recentGlobalChats.map(renderRecentChat)}
                  </nav>
                  {chats.filter((c) => !c.projectId).length > recentGlobalChats.length && (
                    <button
                      type="button"
                      onClick={() => {
                        const filtered = chats.filter((c) => !c.projectId).reverse();
                        setRecentGlobalChats((prev) => [
                          ...prev,
                          ...filtered.slice(prev.length, prev.length + RECENT_CHATS_PER_PAGE),
                        ]);
                      }}
                      className="mb-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <History className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        Load more (
                        {chats.filter((c) => !c.projectId).length - recentGlobalChats.length})
                      </span>
                    </button>
                  )}
                </>
              )}

              {sectionLabel("More", MoreHorizontal)}
              {showLabels && moreNav.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowMoreNav((v) => !v)}
                  className="mb-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground hover:text-foreground"
                  aria-expanded={showMoreNav}
                >
                  <ChevronRight className={cn("h-3 w-3 transition-transform", showMoreNav && "rotate-90")} />
                  {showMoreNav ? "Show less" : `Show ${moreNav.length - 3} more`}
                </button>
              )}
              <nav className="mb-4 flex shrink-0 flex-col gap-0.5" aria-label="More capabilities">
                {(showLabels
                  ? showMoreNav
                    ? moreNav
                    : moreNav.slice(0, 3)
                  : moreNav.filter((i) => i.id === "settings" || i.id === "integrations")
                ).map(renderNavItem)}
              </nav>
            </FeatureErrorBoundary>
          </div>

          <div
            className={cn(
              "mt-auto flex shrink-0 flex-col gap-2 border-t border-border pt-3",
              collapsed && "items-center"
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onOpenLocalAI}
                  className={cn(
                    "sidebar-nav-item",
                    collapsed ? "w-auto justify-center sidebar-nav-item--icon-only" : "w-full justify-start"
                  )}
                  aria-label="Local AI Status"
                >
                  <Cpu className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} strokeWidth={1.5} />
                  {showLabels && <LocalAIStatus onOpen={onOpenLocalAI} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="w-64">
                Local AI status and settings
              </TooltipContent>
            </Tooltip>

            <AccountMenu
              collapsed={collapsed}
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
