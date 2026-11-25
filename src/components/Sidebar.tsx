import React, { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import {
  Plus,
  MessageSquare,
  FolderKanban,
  NotebookPen,
  Search,
  LayoutGrid,
  ChevronRight,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { AccountMenu } from "@/components/AccountMenu";
import { ChatActionsMenu } from "@/components/ChatActionsMenu";
import { sidebarWidthClass } from "@/lib/sidebarLayout";

type NavItem = {
  icon: React.ElementType;
  label: string;
  id: string;
  to?: string;
  action?: "new-chat" | "settings";
};

const PRIMARY_NAV: NavItem[] = [
  { icon: MessageSquare, label: "Chat", id: "chat", to: "/chat" },
  { icon: FolderKanban, label: "Projects", id: "projects", to: "/projects" },
  { icon: NotebookPen, label: "Notebook", id: "notebook", to: "/notebook" },
];

function projectAccent(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 48%)`;
}

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen,
  onCloseMobile,
  collapsed,
  onToggleCollapsed,
  onOpenSearch,
  onOpenSettings,
}) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { chats, currentChatId, createNewChat, selectChat, setActiveProjectId } = useChat();
  const { project, projects, selectProject } = useResearchProject();

  const [recentGlobalChats, setRecentGlobalChats] = useState<typeof chats>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setRecentGlobalChats(chats.filter((c) => !c.projectId).reverse().slice(0, 8));
    }, 80);
    return () => clearTimeout(timer);
  }, [chats]);

  const iconOnly = !isMobile && collapsed;
  const showLabels = isMobile || !collapsed;

  const activeTitle = project?.title ?? null;
  const activeId = project?.id ?? null;
  const accent = useMemo(
    () => (activeId ? projectAccent(activeId) : "hsl(var(--muted-foreground))"),
    [activeId]
  );

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

  const handleSelectProject = async (projectId: string) => {
    try {
      await selectProject(projectId);
    } catch {
      /* store may still update */
    }
    setActiveProjectId(projectId);
    setShowProjectDropdown(false);
    onCloseMobile();
    if (location.pathname.startsWith("/notebook")) return;
    navigate(`/projects/${projectId}`);
  };

  const pathActive = (to?: string) => {
    if (!to) return false;
    if (to === "/chat") return location.pathname === "/chat" || location.pathname.startsWith("/chat/");
    if (to === "/projects") {
      return location.pathname === "/projects" || location.pathname.startsWith("/projects/");
    }
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  const ProjectMark = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-white",
        size === "lg" ? "h-14 w-14 text-lg" : size === "md" ? "h-9 w-9 text-sm" : "h-8 w-8 text-xs"
      )}
      style={{ backgroundColor: accent }}
      aria-hidden
    >
      {(activeTitle ?? "P").slice(0, 1).toUpperCase()}
    </span>
  );

  /* ─── Collapsed icon rail ─── */
  if (iconOnly) {
    return (
      <TooltipProvider>
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-[var(--z-sidebar)] flex flex-col items-center",
            "border-r border-border bg-background",
            "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            sidebarWidthClass(true),
            isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          )}
          aria-label="Primary navigation"
        >
          <div className="flex w-full flex-col items-center gap-3 px-1.5 py-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
                  aria-label="Expand sidebar"
                >
                  <img src="/openbentt-logo.svg" alt="" className="h-8 w-8 object-contain" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand</TooltipContent>
            </Tooltip>

            <div className="h-px w-8 bg-border" />

            {projects.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeId) void handleSelectProject(activeId);
                      else navigate("/projects");
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/70 ring-1 ring-border/60"
                    aria-label={activeTitle ?? "Projects"}
                  >
                    <ProjectMark size="sm" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{activeTitle ?? "Projects"}</TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex w-full flex-col items-center gap-2 px-1.5 pb-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="New chat"
                >
                  <Plus className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">New chat</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    navigate("/projects");
                    onCloseMobile();
                  }}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground",
                    pathActive("/projects") && "bg-muted text-foreground"
                  )}
                  aria-label="Projects"
                >
                  <LayoutGrid className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Projects</TooltipContent>
            </Tooltip>

            <AccountMenu collapsed onOpenSettings={onOpenSettings} />
          </div>
        </aside>
      </TooltipProvider>
    );
  }

  /* ─── Expanded / mobile ─── */
  return (
    <TooltipProvider>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[var(--z-sidebar)] flex flex-col",
          "border-r border-border bg-background",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isMobile ? "w-full border-0" : cn(sidebarWidthClass(false), "border-r border-border"),
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

        <div className="flex h-full flex-col px-3 pb-3 pt-3">
          <div className="mb-1 flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={onOpenSearch}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Search (⌘K)"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNewChat}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="New chat"
            >
              <Plus className="h-4 w-4" />
            </button>
            {!isMobile && (
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Collapse sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mb-4 flex flex-col items-center gap-2 px-2 pt-1">
            <img src="/openbentt-logo.svg" alt="" className="h-16 w-16 object-contain" />
            <p className="text-base font-semibold tracking-tight text-foreground">Openbentt</p>
          </div>

          {projects.length > 0 && (
            <div className="relative mb-4">
              <button
                type="button"
                onClick={() => setShowProjectDropdown((v) => !v)}
                className="flex w-full items-center gap-3 rounded-2xl bg-muted/45 px-3 py-2.5 text-left ring-1 ring-border/50 transition-colors hover:bg-muted/70"
                aria-expanded={showProjectDropdown}
                aria-label="Switch project"
              >
                <ProjectMark size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {activeTitle ?? "Select project"}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {activeTitle ? "Active project" : "No project selected"}
                  </span>
                </span>
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                    showProjectDropdown && "rotate-90"
                  )}
                />
              </button>
              {showProjectDropdown && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg">
                  {projects.map((p) => {
                    const selected = p.id === activeId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => void handleSelectProject(p.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted",
                          selected ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                          style={{ backgroundColor: projectAccent(p.id) }}
                        >
                          {p.title.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="truncate">{p.title}</span>
                        {selected ? <span className="ml-auto text-primary">✓</span> : null}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      navigate("/projects");
                      onCloseMobile();
                      setShowProjectDropdown(false);
                    }}
                    className="flex w-full items-center gap-2 border-t border-border/50 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <LayoutGrid className="h-4 w-4 shrink-0" />
                    <span>All projects</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hide">
            <FeatureErrorBoundary feature="sidebar-nav">
              <nav className="mb-4 flex shrink-0 flex-col gap-1" aria-label="Primary navigation">
                {PRIMARY_NAV.map((item) => {
                  const active = pathActive(item.to);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.to) {
                          navigate(item.to);
                          onCloseMobile();
                        }
                      }}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        active
                          ? "bg-muted font-medium text-foreground ring-1 ring-border/60"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                      <span className="truncate text-[15px]">{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              {showLabels && recentGlobalChats.length > 0 && (
                <div className="mb-2">
                  <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Recent
                  </p>
                  <nav className="flex flex-col gap-0.5" aria-label="Recent conversations">
                    {recentGlobalChats.map((chat) => {
                      const active = currentChatId === chat.id;
                      return (
                        <div key={chat.id} className="group flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleSelectChat(chat.id)}
                            title={chat.title || "Untitled chat"}
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                              active
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            )}
                            aria-current={active ? "page" : undefined}
                          >
                            <MessageSquare className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
                            <span className="truncate">{chat.title || "Untitled chat"}</span>
                          </button>
                          <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <ChatActionsMenu chatId={chat.id} compact />
                          </div>
                        </div>
                      );
                    })}
                  </nav>
                </div>
              )}
            </FeatureErrorBoundary>
          </div>

          <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border/60 pt-3">
            <AccountMenu
              collapsed={false}
              onOpenSettings={() => {
                onOpenSettings();
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
