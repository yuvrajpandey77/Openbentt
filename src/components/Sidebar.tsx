import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import {
  Plus,
  MessageSquare,
  FolderKanban,
  BookOpen,
  NotebookPen,
  FlaskConical,
  ServerCog,
  Settings,
  Menu,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { AccountMenu } from "@/components/AccountMenu";
import { LocalAIStatus } from "@/components/LocalAIStatus";

/**
 * Phase 9 — one persistent sidebar for the whole app. Every destination is
 * real: Chat, Projects, Library (/labs), Notebook, Benchmark, Providers
 * (/setup), Settings. Recent chats are live ChatContext data.
 * 
 * Hierarchy:
 * - ACTIONS: Search, New Chat
 * - WORKSPACE: Chat, Projects, Library, Notebook
 * - MORE: Benchmark, Providers, Settings
 * - RECENT: recent chats
 * - BOTTOM: Local AI status, Account
 */

const NAV_ITEMS = [
  { icon: MessageSquare, label: "Chat", id: "chat", to: "/chat" },
  { icon: FolderKanban, label: "Projects", id: "projects", to: "/projects" },
  { icon: BookOpen, label: "Library", id: "library", to: "/labs" },
  { icon: NotebookPen, label: "Notebook", id: "notebook", to: "/notebook" },
];

const MORE_ITEMS = [
  { icon: FlaskConical, label: "Benchmark", id: "benchmark", to: "/benchmark" },
  { icon: ServerCog, label: "Providers", id: "providers", to: "/setup" },
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
  const { chats, currentChatId, createNewChat, selectChat } = useChat();

  const handleNewChat = () => {
    createNewChat();
    navigate("/chat");
    onCloseMobile();
  };

  const handleSelectChat = (chatId: string) => {
    selectChat(chatId);
    navigate("/chat");
    onCloseMobile();
  };

  const iconOnly = !isMobile && collapsed;
  const showLabels = isMobile || !collapsed;

  const recentChats = chats.slice(-30).reverse();

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
            {showLabels && <span className="sidebar-nav-label">{item.label}</span>}
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
        "fixed inset-y-0 left-0 z-50 flex flex-col",
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

        {/* ACTIONS */}
        <nav className={cn("flex flex-col", isMobile ? "mb-6 gap-2" : "mb-4 gap-1")} aria-label="Actions">
          {renderActionButton("search", "Search", "⌘K", Search, () => {
            onOpenSearch();
            onCloseMobile();
          })}
          {renderActionButton("new", "New chat", "⌘N", Plus, handleNewChat)}
        </nav>

        {/* WORKSPACE NAVIGATION */}
        {showLabels && (
          <>
            <div className={cn("h-px bg-[#24292D]", isMobile ? "mx-5 mb-4" : "mx-2 mb-3")} />
            <p className={cn("sidebar-label mb-2 uppercase tracking-wider", isMobile ? "px-5" : "px-2")}>
              Workspace
            </p>
            <nav className="flex flex-col gap-1" aria-label="Workspace">
              {NAV_ITEMS.map(renderNavItem)}
            </nav>
          </>
        )}

        {/* MORE */}
        {showLabels && (
          <>
            <div className={cn("h-px bg-[#24292D]", isMobile ? "mx-5 mb-4" : "mx-2 mb-3")} />
            <p className={cn("sidebar-label mb-2 uppercase tracking-wider", isMobile ? "px-5" : "px-2")}>
              More
            </p>
            <nav className="flex flex-col gap-1" aria-label="More">
              {MORE_ITEMS.map(renderNavItem)}
            </nav>
          </>
        )}

        {/* RECENT CHATS */}
        {showLabels && (
          <>
            <div className={cn("h-px bg-[#24292D]", isMobile ? "mx-5 mb-4" : "mx-2 mb-3")} />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {recentChats.length > 0 ? (
                <>
                  <p className={cn("sidebar-label mb-2 uppercase tracking-wider", isMobile ? "px-5" : "px-2")}>
                    Recent
                  </p>
                  <div className={cn("flex-1 space-y-0.5 overflow-y-auto", isMobile ? "px-3" : "pr-1")}>
                    {recentChats.map((chat) => (
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
                        <span className="truncate">{chat.title || "Untitled chat"}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className={cn("text-xs text-[#96A0AB]/80", isMobile ? "px-5" : "px-2")}>
                  No chats yet — start a new chat above.
                </p>
              )}
            </div>
          </>
        )}

        {/* BOTTOM: Local AI Status + Account */}
        <div className={cn("mt-auto flex flex-col gap-1 pt-3", collapsed ? "items-center" : isMobile ? "px-3" : "")}>
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
