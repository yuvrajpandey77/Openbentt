import React, { useState } from "react";
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

  const iconOnly = !isMobile && collapsed;
  const showLabels = isMobile || !collapsed;

  const recentChats = chats.slice(-30).reverse();
  const projectChats = activeProjectId
    ? chats.filter((c) => c.projectId === activeProjectId).slice(-20).reverse()
    : [];
  const [showAllChats, setShowAllChats] = useState(false);

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
            ? "w-[60px] border-r border-[#24292D]"
            : "w-[220px] border-r border-[#24292D]",
        isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
      aria-label="Primary"
    >
      {isMobileOpen && isMobile && (
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close menu"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#a3c987] text-[#101314]"
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
                          ? "bg-accent/10 text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/5 hover:text-foreground"
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
              {MORE_ITEMS.map(renderNavItem)}
            </nav>
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
                            ? "bg-[#a3c987]/10 text-[#a3c987]"
                            : "text-[#96A0AB] hover:bg-[#a3c987]/10 hover:text-[#E8F1F6]"
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
