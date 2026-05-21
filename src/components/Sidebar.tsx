import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useChat } from "@/context/ChatContext";
import {
  PlusCircle,
  Trash2,
  MessageSquare,
  Settings,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { appHomePath } from "@/lib/appHomePath";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { cn } from "@/lib/utils";
import { getPrimaryWorkspaceNavItems } from "@/config/workspaceNav";
import { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_ICON } from "@/lib/sidebarLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import SettingsPanel from "@/components/SettingsPanel";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";

function chatInitials(title: string): string {
  const t = title.trim() || "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return t.slice(0, 2).toUpperCase();
}

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

function IconNavItem({
  to,
  label,
  description,
  icon: Icon,
  active,
  onClick,
  showLabel,
}: {
  to?: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active?: boolean;
  onClick?: () => void;
  showLabel: boolean;
}) {
  const className = cn(
    "flex items-center rounded-xl transition-colors",
    showLabel ? "w-full gap-2.5 px-2.5 py-2 text-sm" : "h-10 w-10 justify-center",
    active
      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
      : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
  );

  const inner = (
    <>
      <Icon className={cn("shrink-0", showLabel ? "h-4 w-4" : "h-[18px] w-[18px]")} strokeWidth={2} />
      {showLabel && <span className="min-w-0 flex-1 truncate">{label}</span>}
    </>
  );

  const node = to ? (
    <NavLink to={to} onClick={onClick} className={className} aria-current={active ? "page" : undefined}>
      {inner}
    </NavLink>
  ) : (
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {inner}
    </button>
  );

  if (showLabel) return node;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px]">
        <p className="font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen,
  onCloseMobile,
  collapsed,
  onToggleCollapsed,
}) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const desktopApp = isDesktopApp();
  /** Desktop chat sidebar stays icon-only; labels show in hover tooltips only. */
  const iconOnly = !isMobile && collapsed;
  const showLabels = isMobile || !collapsed;

  const { chats, currentChatId, createNewChat, selectChat, deleteChat, clearChats } = useChat();

  const handleNewChat = () => {
    createNewChat();
    onCloseMobile();
  };

  const handleSelectChat = (chatId: string) => {
    selectChat(chatId);
    onCloseMobile();
  };

  const workspaceItems = getPrimaryWorkspaceNavItems();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border/80 bg-sidebar transition-[width,transform] duration-300 ease-out",
        isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
      style={{ width: iconOnly ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH_EXPANDED }}
    >
      <div
        className={cn(
          "flex h-full flex-col py-3",
          iconOnly ? "items-center px-1.5" : "px-3"
        )}
      >
        {/* Header: logo + collapse */}
        <div
          className={cn(
            "mb-2 flex w-full shrink-0 items-center",
            iconOnly ? "flex-col gap-1.5" : "justify-between gap-2"
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to={appHomePath()}
                onClick={onCloseMobile}
                className="flex shrink-0 items-center rounded-lg outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                aria-label="Openbentt — all projects"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src="/openbentt-logo.svg" alt="" />
                  <AvatarFallback className="font-display text-xs">OB</AvatarFallback>
                </Avatar>
                {showLabels && (
                  <span className="ml-2 truncate font-display text-base font-semibold text-sidebar-foreground">
                    Openbentt
                  </span>
                )}
              </Link>
            </TooltipTrigger>
            {iconOnly && (
              <TooltipContent side="right">All projects</TooltipContent>
            )}
          </Tooltip>

          {!isMobile && collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-sidebar-foreground/80"
                  onClick={onToggleCollapsed}
                  aria-label="Pin sidebar wide (show labels)"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Pin wide sidebar (optional labels)</TooltipContent>
            </Tooltip>
          )}
          {!isMobile && !collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-sidebar-foreground/80"
                  onClick={onToggleCollapsed}
                  aria-label="Icon-only sidebar"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Icons only</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* New chat */}
        <div className={cn("mb-2 w-full shrink-0", iconOnly && "flex justify-center")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                className={cn(
                  "bg-primary",
                  iconOnly ? "h-10 w-10 p-0" : "w-full justify-center gap-2"
                )}
                onClick={handleNewChat}
                aria-label="New chat"
              >
                <PlusCircle size={iconOnly ? 18 : 16} />
                {showLabels && <span>New chat</span>}
              </Button>
            </TooltipTrigger>
            {iconOnly && <TooltipContent side="right">New chat</TooltipContent>}
          </Tooltip>
        </div>

        {/* Workspace: Projects + Library only */}
        <nav
          className={cn(
            "mb-2 shrink-0 space-y-1",
            iconOnly && "flex flex-col items-center"
          )}
        >
          {workspaceItems.map((item) => {
            const active =
              location.pathname === item.to ||
              location.pathname.startsWith(`${item.to}/`) ||
              (item.to === "/projects" && location.pathname === "/notebook");

            return (
              <IconNavItem
                key={item.to}
                to={item.to}
                label={item.label}
                description={item.description}
                icon={item.Icon}
                active={active}
                onClick={onCloseMobile}
                showLabel={showLabels}
              />
            );
          })}
        </nav>

        <Separator className={cn("mb-2 bg-sidebar-border/80", iconOnly && "w-8")} />

        {/* Chat history */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ScrollArea className={cn("min-h-0 flex-1", !iconOnly && "-mx-1 px-1")}>
            {chats.length > 0 ? (
              iconOnly ? (
                <div className="flex flex-col items-center gap-1 pb-2">
                  {chats.map((chat) => (
                    <Tooltip key={chat.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl text-[11px] font-semibold transition-colors",
                            currentChatId === chat.id
                              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                              : "bg-sidebar-accent/70 text-sidebar-foreground hover:bg-sidebar-accent"
                          )}
                          onClick={() => handleSelectChat(chat.id)}
                        >
                          {chatInitials(chat.title)}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[240px]">
                        <p className="font-medium">{chat.title}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5 pr-1">
                  {chats.map((chat) => (
                    <div
                      key={chat.id}
                      className={cn(
                        "group flex cursor-pointer items-center justify-between rounded-xl p-2.5 transition-colors hover:bg-sidebar-accent",
                        currentChatId === chat.id && "bg-sidebar-accent"
                      )}
                      onClick={() => handleSelectChat(chat.id)}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                        <MessageSquare
                          size={16}
                          className={cn(
                            "shrink-0",
                            currentChatId === chat.id ? "text-primary" : "text-sidebar-foreground/70"
                          )}
                        />
                        <span className="truncate text-sm font-medium leading-snug">{chat.title}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChat(chat.id);
                        }}
                      >
                        <Trash2 size={14} className="text-sidebar-foreground/70" />
                      </Button>
                    </div>
                  ))}
                </div>
              )
            ) : (
              showLabels && (
                <p className="px-2 py-6 text-center text-xs text-sidebar-foreground/50">
                  No chats yet — use New chat above.
                </p>
              )
            )}
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className={cn("mt-auto space-y-1 pt-2", iconOnly && "flex flex-col items-center")}>
          <Separator className={cn("mb-2 bg-sidebar-border/80", iconOnly && "w-8")} />

          {!desktopApp &&
            (iconOnly ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavLink
                    to="/download"
                    onClick={onCloseMobile}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-sidebar-foreground/85 hover:bg-sidebar-accent"
                  >
                    <Download className="h-[18px] w-[18px]" strokeWidth={2} />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">Get desktop app</TooltipContent>
              </Tooltip>
            ) : (
              <NavLink
                to="/download"
                onClick={onCloseMobile}
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-sidebar-foreground/90 hover:bg-sidebar-accent"
              >
                <Download className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span>Get desktop app</span>
              </NavLink>
            ))}

          <Dialog>
            {iconOnly ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 border-sidebar-border bg-sidebar-accent/30"
                      aria-label="Settings"
                    >
                      <Settings size={18} />
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">Settings</TooltipContent>
              </Tooltip>
            ) : (
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2 border-sidebar-border bg-sidebar-accent/30"
                >
                  <Settings size={16} />
                  Settings
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="flex max-h-[min(92vh,860px)] w-[calc(100vw-1.25rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
              <DialogHeader className="border-b border-border/60 px-6 py-4 text-left">
                <DialogTitle className="font-display text-xl font-semibold tracking-tight">Settings</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  AI providers, appearance, and developer tools (Benchmark, WebGPU) — stored locally.
                </p>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <SettingsPanel />
              </div>
            </DialogContent>
          </Dialog>

          {chats.length > 0 &&
            (iconOnly ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive hover:bg-destructive/10"
                    onClick={clearChats}
                  >
                    <Trash2 size={18} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Clear all chats</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10"
                onClick={clearChats}
              >
                <Trash2 size={16} />
                Clear all chats
              </Button>
            ))}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
