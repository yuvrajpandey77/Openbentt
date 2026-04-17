import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useChat } from "@/context/ChatContext";
import {
  PlusCircle,
  Trash2,
  MessageCircle,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  MessagesSquare,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKSPACE_NAV_ITEMS } from "@/config/workspaceNav";
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
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  }
  return t.slice(0, 2).toUpperCase();
}

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
  const narrow = collapsed && !isMobile;
  const location = useLocation();

  const {
    chats,
    currentChatId,
    createNewChat,
    selectChat,
    deleteChat,
    clearChats,
  } = useChat();

  const handleNewChat = () => {
    createNewChat();
    onCloseMobile();
  };

  const handleSelectChat = (chatId: string) => {
    selectChat(chatId);
    onCloseMobile();
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-sidebar transition-[width,transform] duration-300 ease-out",
        narrow ? "w-16 md:w-16" : "w-72",
        isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      <div
        className={cn(
          "flex h-full flex-col p-3",
          narrow && "items-center px-2 py-3 md:items-stretch"
        )}
      >
        <div
          className={cn(
            "mb-3 flex shrink-0 items-center",
            narrow ? "flex-col gap-2" : "justify-between"
          )}
        >
          <Link
            to="/"
            onClick={onCloseMobile}
            className={cn(
              "flex min-w-0 items-center rounded-lg outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              narrow && "flex-col"
            )}
            aria-label="Openbentt home"
          >
            <Avatar className={cn("h-9 w-9 shrink-0", narrow && "h-8 w-8")}>
              <AvatarImage src="/openbentt-logo.svg" alt="" />
              <AvatarFallback className="font-display text-xs">OB</AvatarFallback>
            </Avatar>
            {!narrow && (
              <h1 className="ml-2 truncate font-display text-lg font-semibold tracking-tight text-sidebar-foreground">
                Openbentt
              </h1>
            )}
          </Link>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "hidden h-8 w-8 shrink-0 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground md:inline-flex",
                  narrow && "w-full"
                )}
                onClick={onToggleCollapsed}
                aria-label={narrow ? "Expand sidebar" : "Collapse sidebar"}
              >
                {narrow ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="hidden md:block">
              {narrow ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              className={cn(
                "openbentt-button mb-3 flex shrink-0 items-center gap-2 bg-primary",
                narrow ? "h-10 w-10 justify-center p-0" : "w-full justify-center"
              )}
              onClick={handleNewChat}
            >
              <PlusCircle size={narrow ? 18 : 16} />
              {!narrow && <span>New chat</span>}
            </Button>
          </TooltipTrigger>
          {narrow && (
            <TooltipContent side="right">New chat</TooltipContent>
          )}
        </Tooltip>

        <div className={cn("mb-2 shrink-0 space-y-1", narrow && "flex flex-col items-center")}>
          {!narrow && (
            <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              <MessageSquare className="h-3 w-3" aria-hidden />
              Conversation
            </div>
          )}
          {narrow ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <NavLink
                  to="/chat"
                  end
                  onClick={onCloseMobile}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                    location.pathname === "/chat"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                  aria-current={location.pathname === "/chat" ? "page" : undefined}
                >
                  <MessageSquare className="h-[18px] w-[18px]" strokeWidth={2} />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px]">
                <p className="font-medium">Thread</p>
                <p className="text-xs text-muted-foreground">Full chat only — no workspace tools</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <NavLink
              to="/chat"
              end
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cn(
                  "mb-1 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-primary/12 font-medium text-sidebar-primary"
                    : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <MessageSquare
                    className={cn("h-4 w-4 shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70")}
                    strokeWidth={2}
                  />
                  <span className="min-w-0 flex-1 truncate">Thread</span>
                </>
              )}
            </NavLink>
          )}
          {narrow ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <NavLink
                  to="/download"
                  onClick={onCloseMobile}
                  className={cn(
                    "mt-1 flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                    location.pathname === "/download"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                  aria-current={location.pathname === "/download" ? "page" : undefined}
                >
                  <Download className="h-[18px] w-[18px]" strokeWidth={2} />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px]">
                <p className="font-medium">Download</p>
                <p className="text-xs text-muted-foreground">Desktop installers &amp; docs</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <NavLink
              to="/download"
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cn(
                  "mt-1 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-primary/12 font-medium text-sidebar-primary"
                    : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Download
                    className={cn("h-4 w-4 shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70")}
                    strokeWidth={2}
                  />
                  <span className="min-w-0 flex-1 truncate">Download</span>
                </>
              )}
            </NavLink>
          )}
        </div>

        <div className={cn("mb-2 shrink-0 space-y-1", narrow && "flex flex-col items-center")}>
          {!narrow && (
            <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              <LayoutGrid className="h-3 w-3" aria-hidden />
              Workspace
            </div>
          )}
          {WORKSPACE_NAV_ITEMS.map((item) => {
            const active =
              !item.disabled &&
              (location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));
            const disabledClass =
              "cursor-not-allowed opacity-50 text-sidebar-foreground/40 select-none";

            if (item.disabled) {
              return narrow ? (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl",
                        disabledClass
                      )}
                      aria-disabled="true"
                    >
                      <item.Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[200px]">
                    <p className="font-medium text-muted-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm",
                        disabledClass
                      )}
                      aria-disabled="true"
                    >
                      <item.Icon className="h-4 w-4 shrink-0 text-sidebar-foreground/35" strokeWidth={2} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[200px]">
                    <p className="font-medium text-muted-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return narrow ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.to}
                    onClick={onCloseMobile}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <item.Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px]">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-primary/12 font-medium text-sidebar-primary"
                      : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.Icon
                      className={cn("h-4 w-4 shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70")}
                      strokeWidth={2}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        <Separator className={cn("mb-2 bg-sidebar-border/80", narrow && "mx-auto w-8")} />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!narrow && (
            <div className="mb-1.5 flex shrink-0 items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              <MessagesSquare className="h-3 w-3" aria-hidden />
              Chats
            </div>
          )}
          <ScrollArea className={cn("min-h-0 flex-1", narrow ? "-mx-0 w-full px-0" : "-mx-2 px-2")}>
          {chats.length > 0 ? (
            narrow ? (
              <div className="flex flex-col items-center gap-1.5 pb-2">
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
              <div className="space-y-1 pr-1">
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
                      <MessageCircle
                        size={16}
                        className={cn(
                          "shrink-0",
                          currentChatId === chat.id
                            ? "text-primary"
                            : "text-sidebar-foreground/70"
                        )}
                      />
                      <span className="truncate text-sm font-medium leading-snug">
                        {chat.title}
                      </span>
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
            !narrow && (
              <div className="py-8 text-center text-sm text-sidebar-foreground/60">
                <p className="font-medium text-sidebar-foreground/75">No chats yet</p>
                <p className="mt-1.5 text-xs leading-relaxed text-sidebar-foreground/50">
                  Use <span className="text-sidebar-foreground/70">New chat</span>, then type in the composer below.
                </p>
              </div>
            )
          )}
        </ScrollArea>
        </div>

        <div className={cn("mt-auto space-y-2 pt-2", narrow && "flex w-full flex-col items-center")}>
          <Dialog>
            {narrow ? (
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
                <DialogTitle className="font-display text-xl font-semibold tracking-tight">
                  Settings
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Appearance, AI providers, research tools, and experiments — stored in this browser only.
                </p>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <SettingsPanel />
              </div>
            </DialogContent>
          </Dialog>

          {chats.length > 0 &&
            (narrow ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
                className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
