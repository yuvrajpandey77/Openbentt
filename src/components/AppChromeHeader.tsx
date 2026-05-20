import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, PanelLeft, Info } from "lucide-react";
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
  const { apiConfig, currentChatId } = useChat();
  const { pathname } = useLocation();
  const isChat = pathname === "/chat";

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-background/85 px-2 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      {/* Left: mobile menu, sidebar expand, route label */}
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 md:hidden"
          onClick={onOpenMobileSidebar}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </Button>

        {sidebarCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-9 w-9 shrink-0 md:inline-flex"
                onClick={onExpandSidebar}
                aria-label="Show sidebar"
              >
                <PanelLeft size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Show sidebar</TooltipContent>
          </Tooltip>
        )}

        <div className="hidden min-w-0 sm:block">
          {workspaceMeta ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-display text-[10px] uppercase tracking-wide">
                {workspaceMeta.tag}
              </Badge>
              <span className="text-xs font-medium text-foreground md:text-sm">{workspaceMeta.title}</span>
              <Link
                to="/chat"
                className="text-[10px] text-muted-foreground/70 hover:text-foreground hover:underline"
              >
                ← Chat
              </Link>
            </div>
          ) : (
            <p className="truncate text-sm font-medium text-foreground">
              {isChat ? "Chat" : "Chat"}
            </p>
          )}
        </div>
      </div>

      {/* Right: share (primary) + status popover */}
      <div className="flex shrink-0 items-center gap-1.5">
        <ShareLinkButton />

        {canSendChat(apiConfig) && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Status">
                <Info size={16} />
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
