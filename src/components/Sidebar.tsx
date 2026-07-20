import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import {
  Plus,
  MessageSquare,
  FolderKanban,
  ScrollText,
  Code2,
  Paintbrush,
  Settings,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppSettingsDialog } from "@/components/AppSettingsDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";

const NAV_ITEMS = [
  { icon: Plus, label: "New chat", id: "new" },
  { icon: MessageSquare, label: "Chats", id: "chats", to: "/chat" },
  { icon: FolderKanban, label: "Projects", id: "projects", to: "/projects" },
  { icon: ScrollText, label: "Artifacts", id: "artifacts", to: "/artifacts" },
  { icon: Code2, label: "Code", id: "code", to: "/code" },
  { icon: Paintbrush, label: "Customize", id: "customize" },
];

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen,
  onCloseMobile,
  collapsed,
  onToggleCollapsed,
}) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { chats, currentChatId, createNewChat, selectChat } = useChat();

  const handleNewChat = () => {
    createNewChat();
    onCloseMobile();
  };

  const handleSelectChat = (chatId: string) => {
    selectChat(chatId);
    onCloseMobile();
  };

  const iconOnly = !isMobile && collapsed;
  const showLabels = isMobile || !collapsed;

  const recentChats = chats.slice(-8).reverse();

  return (
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col",
          "bg-[#000000]",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isMobile
            ? "w-full border-0"
            : collapsed
              ? "w-[60px] border-r border-[#1a1a1a]"
              : "w-[200px] border-r border-[#1a1a1a]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Mobile close */}
        {isMobileOpen && isMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#16A34A] text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}

      <div className={cn("flex h-full flex-col", collapsed ? "py-4 px-2" : isMobile ? "overflow-y-auto py-6 px-5" : "py-4 px-3")}>
        {/* Header: Logo + collapse toggle */}
        <div
          className={cn(
            "flex items-center",
            collapsed ? "mb-8 justify-center" : isMobile ? "mb-10 justify-between" : "mb-8 justify-between px-1"
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

        {/* Primary nav icons */}
        <nav className={cn("flex flex-col", isMobile ? "mb-8 gap-2" : "mb-6 gap-1")}>
          {NAV_ITEMS.map((item) => {
            const active = item.to
              ? location.pathname === item.to || location.pathname.startsWith(item.to + "/")
              : false;
            const Icon = item.icon;

            if (item.id === "new") {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleNewChat}
                      className={cn(
                        "sidebar-nav-item",
                        collapsed && "sidebar-nav-item--icon-only",
                        isMobile && "sidebar-nav-item--mobile"
                      )}
                      aria-label={item.label}
                    >
                      <Icon className={cn("shrink-0", collapsed ? "h-6 w-6" : isMobile ? "h-5 w-5" : "h-5 w-5")} strokeWidth={1.5} />
                      {showLabels && <span className="sidebar-nav-label">{item.label}</span>}
                    </button>
                  </TooltipTrigger>
                  {iconOnly && (
                    <TooltipContent side="right" className="bg-black text-white border-[#333] text-xs">
                      {item.label}
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            }

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.to || "#"}
                    onClick={onCloseMobile}
                    className={cn(
                      "sidebar-nav-item",
                      collapsed && "sidebar-nav-item--icon-only",
                      isMobile && "sidebar-nav-item--mobile",
                      active && "sidebar-nav-item--active"
                    )}
                  >
                    <Icon className={cn("shrink-0", collapsed ? "h-6 w-6" : isMobile ? "h-5 w-5" : "h-5 w-5")} strokeWidth={1.5} />
                    {showLabels && <span className="sidebar-nav-label">{item.label}</span>}
                  </NavLink>
                </TooltipTrigger>
                {iconOnly && (
                  <TooltipContent side="right" className="bg-black text-white border-[#333] text-xs">
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </nav>

        {/* Divider + Recent chats */}
        {showLabels && (
          <>
            <div className={cn("h-px bg-[#1a1a1a]", isMobile ? "mx-5 mb-4" : "mx-2 mb-3")} />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {recentChats.length > 0 && (
                <>
                  <p className={cn("sidebar-label mb-2 uppercase tracking-wider", isMobile ? "px-5" : "px-2")}>Recent</p>
                  <div className={cn("flex-1 overflow-y-auto space-y-0.5", isMobile ? "px-3" : "pr-1")}>
                    {recentChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => handleSelectChat(chat.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg text-left text-sm transition-colors duration-200",
                          isMobile ? "px-4 py-2.5" : "px-2 py-1.5",
                          currentChatId === chat.id
                            ? "bg-[#16A34A]/10 text-[#16A34A]"
                            : "text-[#666666] hover:text-[#cccccc] hover:bg-[#16A34A]/5"
                        )}
                      >
                        <span className="truncate">{chat.title}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Footer: Settings + Profile */}
        <div className={cn("mt-auto flex flex-col gap-1 pt-3", collapsed ? "items-center" : isMobile ? "px-3" : "")}>
          <div className={cn("w-full", collapsed && "flex justify-center")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <AppSettingsDialog
                  trigger={
                    <button
                      type="button"
                      className={cn(
                        "sidebar-nav-item",
                        collapsed && "sidebar-nav-item--icon-only",
                        isMobile && "sidebar-nav-item--mobile"
                      )}
                      aria-label="Settings"
                    >
                      <Settings className={cn("shrink-0", collapsed ? "h-6 w-6" : isMobile ? "h-5 w-5" : "h-5 w-5")} strokeWidth={1.5} />
                      {showLabels && <span className="sidebar-nav-label">Settings</span>}
                    </button>
                  }
                />
              </TooltipTrigger>
              {iconOnly && (
                <TooltipContent side="right" className="bg-black text-white border-[#333] text-xs">
                  Settings
                </TooltipContent>
              )}
            </Tooltip>
          </div>

          {/* Profile */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg transition-colors duration-200",
                  collapsed
                    ? "justify-center px-0 py-2"
                    : isMobile
                      ? "px-4 py-3 hover:bg-[#16A34A]/5"
                      : "px-2.5 py-2 hover:bg-[#16A34A]/5"
                )}
              >
                <div className={cn("flex shrink-0 items-center justify-center rounded-full bg-[#16A34A] text-xs font-bold text-white", isMobile ? "h-10 w-10 text-sm" : "h-8 w-8")}>
                  YP
                </div>
                {showLabels && (
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-semibold text-[#cccccc]", isMobile ? "text-base" : "text-sm")}>Yuvraj</p>
                    <p className={cn("text-[#666666]", isMobile ? "text-sm" : "text-[11px]")}>Free plan</p>
                  </div>
                )}
              </div>
            </TooltipTrigger>
            {iconOnly && (
              <TooltipContent side="right" className="bg-black text-white border-[#333] text-xs">
                Yuvraj · Free plan
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
