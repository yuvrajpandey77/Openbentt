import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Menu, PanelLeft } from "lucide-react";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useChat } from "@/context/ChatContext";
import { FeedbackDialog } from "@/components/FeedbackDialog";
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
  const { currentChatId, chats, activeProjectId } = useChat();
  const activeChat = chats.find((c) => c.id === currentChatId);
  const projectId = activeProjectId ?? activeChat?.projectId ?? null;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/90 px-2 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 md:px-3">
      <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
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
            <p className="truncate text-sm font-medium text-foreground">
              {projectId ? "Project conversation" : "Chat"}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 md:gap-1.5">
        <FeedbackDialog compact />
        <ShareLinkButton />
      </div>
    </header>
  );
};
