import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, PanelLeft, Info, Search, Smartphone } from "lucide-react";
import { canSendChat } from "@/types/chat";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { CapabilitiesSheet } from "@/components/CapabilitiesSheet";
import { LocalModelStatusBar } from "@/components/LocalModelStatusBar";
import { ContextMeter } from "@/components/ContextMeter";
import { ProviderQuotaMeter } from "@/components/ProviderQuotaMeter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChat } from "@/context/ChatContext";
import type { WorkspaceRouteMeta } from "@/config/workspaceRouteMeta";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { isWebClient } from "@/config/platformSurface";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWebChatUiOptional } from "@/context/WebChatUiContext";
import { useChatPwaInstall } from "@/hooks/useChatPwaInstall";
import { cn } from "@/lib/utils";

interface AppChromeHeaderProps {
  onOpenMobileSidebar: () => void;
  sidebarCollapsed: boolean;
  onExpandSidebar: () => void;
  workspaceMeta?: WorkspaceRouteMeta;
}

/** Shared top bar: route title + primary actions. Meters live behind the status popover. */
export const AppChromeHeader: React.FC<AppChromeHeaderProps> = ({
  onOpenMobileSidebar,
  sidebarCollapsed,
  onExpandSidebar,
  workspaceMeta,
}) => {
  const { apiConfig, currentChatId, chats } = useChat();
  const webUi = useWebChatUiOptional();
  const { showMobileInstall, standalone } = useChatPwaInstall();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const isChat = pathname === "/chat";
  const isWebChat = isWebClient() && isChat;
  const hasThreadMessages =
    (chats.find((c) => c.id === currentChatId)?.messages.length ?? 0) > 0;

  return (
    <header
      className={cn(
        "flex shrink-0 items-center justify-between gap-2 backdrop-blur-md",
        isWebChat
          ? "z-20 border-0 bg-background px-3 py-2 md:bg-transparent md:px-4"
          : "border-b border-border/60 bg-background/90 px-2 py-2 supports-[backdrop-filter]:bg-background/80 md:px-3"
      )}
    >
      {/* Left: mobile menu, sidebar expand, route label */}
      <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0 md:hidden",
            isWebChat
              ? "h-10 w-10 rounded-full bg-muted/40 hover:bg-muted/60 md:h-11 md:w-11"
              : "h-9 w-9"
          )}
          onClick={onOpenMobileSidebar}
          aria-label="Open menu"
        >
          <Menu size={isWebChat ? 22 : 20} />
        </Button>

        {sidebarCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "hidden shrink-0 md:inline-flex",
                  isWebChat ? "h-10 w-10 rounded-full bg-muted/40 hover:bg-muted/60 md:h-11 md:w-11" : "h-9 w-9"
                )}
                onClick={onExpandSidebar}
                aria-label="Show sidebar"
              >
                <PanelLeft size={isWebChat ? 22 : 20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Show sidebar</TooltipContent>
          </Tooltip>
        )}

        <div className={cn(isWebChat && "sr-only")}>
          {workspaceMeta ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-display text-[10px] uppercase tracking-wide">
                {workspaceMeta.tag}
              </Badge>
              <span className="text-xs font-medium text-foreground md:text-sm">{workspaceMeta.title}</span>
              <Link
                to={isDesktopApp() ? "/projects" : "/chat"}
                className="hidden text-[10px] text-muted-foreground/70 hover:text-foreground hover:underline sm:inline"
              >
                {isDesktopApp() ? "← Projects" : "← Chat"}
              </Link>
            </div>
          ) : (
            <p className="truncate text-sm font-medium text-foreground">Chat</p>
          )}
        </div>
      </div>

      {/* Right: share (primary) + status popover */}
      <div className="flex shrink-0 items-center gap-0.5 md:gap-1.5">
        {isWebChat && showMobileInstall && !standalone && (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full bg-muted/30 text-muted-foreground hover:bg-muted/50 md:h-11 md:w-11"
            onClick={() => webUi.openInstall()}
            aria-label="Install on mobile"
          >
            <Smartphone size={18} className="md:h-5 md:w-5" />
          </Button>
        )}

        {isWebChat && hasThreadMessages && (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full bg-muted/30 text-muted-foreground hover:bg-muted/50 md:h-11 md:w-11"
            onClick={() => webUi.openSearch()}
            aria-label="Search chat"
          >
            <Search size={18} className="md:h-5 md:w-5" />
          </Button>
        )}

        {!(isWebChat && isMobile) && <ShareLinkButton />}

        {canSendChat(apiConfig) && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "text-muted-foreground",
                  isWebChat
                    ? "h-10 w-10 rounded-full bg-muted/30 hover:bg-muted/50 md:h-11 md:w-11"
                    : "h-8 w-8"
                )}
                aria-label="Status"
              >
                <Info size={isWebChat ? 18 : 16} className={isWebChat ? "md:h-5 md:w-5" : undefined} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3 space-y-3" align="end">
              <p className="text-xs font-medium text-foreground">Session status</p>
              {currentChatId && (
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Context window</p>
                  <ContextMeter />
                </div>
              )}
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Provider quota</p>
                <ProviderQuotaMeter />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Local models</p>
                <LocalModelStatusBar />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Model capabilities</p>
                <CapabilitiesSheet />
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </header>
  );
};
