import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Menu, PanelLeft, Info, Cpu, Cloud } from "lucide-react";
import { canSendChat } from "@/types/chat";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { CapabilitiesSheet } from "@/components/CapabilitiesSheet";
import { ContextMeter } from "@/components/ContextMeter";
import { ProviderQuotaMeter } from "@/components/ProviderQuotaMeter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChat } from "@/context/ChatContext";
import { ExecutionBadge } from "@/components/conversation/ExecutionBadge";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { LocalModelStatusBar } from "@/components/LocalModelStatusBar";
import { useLocalAI } from "@/context/LocalAIContext";
import { friendlyModelLabel } from "@/lib/ollama/selection";
import type { WorkspaceRouteMeta } from "@/config/workspaceRouteMeta";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface AppChromeHeaderProps {
  onOpenMobileSidebar: () => void;
  sidebarCollapsed: boolean;
  onExpandSidebar: () => void;
  workspaceMeta?: WorkspaceRouteMeta;
}

export const AppChromeHeader: React.FC<AppChromeHeaderProps> = ({
  onOpenMobileSidebar,
  sidebarCollapsed,
  onExpandSidebar,
  workspaceMeta,
}) => {
  const { apiConfig, currentChatId, activeProjectId, chats, openCodeLayer, openCodeModel } = useChat();
  const activeChat = chats.find((c) => c.id === currentChatId);
  const projectId = activeProjectId ?? activeChat?.projectId ?? null;
  const { effectiveModel } = useLocalAI();
  /** Universal layer owns model selection on desktop — hide legacy badges. */
  const layerOwnsChat = isDesktopApp() && openCodeLayer.available;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const modelLabel = effectiveModel
    ? `${friendlyModelLabel(effectiveModel.modelId || "")} · ${effectiveModel.location === "local" ? "Local" : "Cloud"}`
    : "No model";

  const modelIcon = effectiveModel?.location === "local" ? <Cpu size={12} className="shrink-0 text-primary" /> : <Cloud size={12} className="shrink-0 text-muted-foreground" />;
  const modelAvailable = effectiveModel?.available ?? false;

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/90 px-2 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 md:px-3">
      <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
        {/* Global back: mistaken taps always have a way out. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => navigate(-1)}
              aria-label="Go back"
            >
              <ArrowLeft size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Back</TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 md:hidden h-9 w-9"
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
                className="hidden shrink-0 md:inline-flex h-9 w-9"
                onClick={onExpandSidebar}
                aria-label="Show sidebar"
              >
                <PanelLeft size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Show sidebar</TooltipContent>
          </Tooltip>
        )}

        <div>
          {workspaceMeta ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-display text-[10px] uppercase tracking-wide">
                {workspaceMeta.tag}
              </Badge>
              <span className="text-xs font-medium text-foreground md:text-sm">{workspaceMeta.title}</span>
              <Link
                to={isDesktopApp() ? "/projects" : "/"}
                className="hidden text-[10px] text-muted-foreground/70 hover:text-foreground hover:underline sm:inline"
              >
                ← Projects
              </Link>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">
                {projectId ? "Project conversation" : "Chat"}
              </p>
              {layerOwnsChat ? (
                <Badge variant="default" className="gap-1 px-1.5 py-0 text-[10px] font-normal">
                  <Cpu size={12} className="shrink-0" />
                  {openCodeModel === "auto" ? "OpenCode · auto" : openCodeModel}
                </Badge>
              ) : (
                <Badge variant={modelAvailable ? "default" : "destructive"} className="gap-1 px-1.5 py-0 text-[10px] font-normal">
                  {modelIcon}
                  {modelLabel}
                </Badge>
              )}
              {isDesktopApp() && !isMobile && <ExecutionBadge />}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 md:gap-1.5">
        <FeedbackDialog compact />
        <ShareLinkButton />

        {canSendChat(apiConfig) && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground h-8 w-8"
                aria-label="Status"
              >
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
