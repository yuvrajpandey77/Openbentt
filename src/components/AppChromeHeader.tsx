import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, PanelLeft } from "lucide-react";
import { canSendChat } from "@/types/chat";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { CapabilitiesSheet } from "@/components/CapabilitiesSheet";
import { ContextMeter } from "@/components/ContextMeter";
import { ProviderQuotaMeter } from "@/components/ProviderQuotaMeter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useChat } from "@/context/ChatContext";
import type { WorkspaceRouteMeta } from "@/config/workspaceRouteMeta";

interface AppChromeHeaderProps {
  onOpenMobileSidebar: () => void;
  sidebarCollapsed: boolean;
  onExpandSidebar: () => void;
  workspaceMeta?: WorkspaceRouteMeta;
}

/** Shared top bar: home chat title or workspace context + meters & actions. */
export const AppChromeHeader: React.FC<AppChromeHeaderProps> = ({
  onOpenMobileSidebar,
  sidebarCollapsed,
  onExpandSidebar,
  workspaceMeta,
}) => {
  const { apiConfig, currentChatId } = useChat();
  const { pathname } = useLocation();
  const isThreadOnly = pathname === "/chat";

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-background/85 px-2 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
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
                aria-label="Show sidebar: workspace & chats"
              >
                <PanelLeft size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open sidebar — workspace tools & chat history</TooltipContent>
          </Tooltip>
        )}
        <div className="hidden min-w-0 sm:block">
          {workspaceMeta ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-display text-[10px] uppercase tracking-wide">
                  {workspaceMeta.tag}
                </Badge>
                <Link
                  to="/chat"
                  className="text-[10px] font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  Thread
                </Link>
              </div>
              <p className="truncate text-xs font-medium text-foreground md:text-sm">{workspaceMeta.title}</p>
              <p className="truncate text-[10px] text-muted-foreground/90 md:text-[11px]">{workspaceMeta.subtitle}</p>
            </>
          ) : (
            <>
              <p className="truncate text-xs font-medium text-muted-foreground md:text-sm">
                {isThreadOnly ? "Thread" : "Chat"}
              </p>
              <p className="truncate text-[10px] text-muted-foreground/80 md:text-[11px]">
                {isThreadOnly
                  ? "Full conversation and composer only — open a workspace in the sidebar for tools beside your thread"
                  : "Same model &amp; settings — switch workspace in the sidebar anytime"}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="flex min-w-0 shrink items-center justify-end gap-2 overflow-hidden">
        {canSendChat(apiConfig) && (
          <div className="flex min-w-0 items-center justify-end gap-2">
            {currentChatId ? (
              <div className="min-w-0 shrink-0">
                <ContextMeter />
              </div>
            ) : null}
            <ProviderQuotaMeter />
          </div>
        )}
        <CapabilitiesSheet />
        <ShareLinkButton />
      </div>
    </header>
  );
};
