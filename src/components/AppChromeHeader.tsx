import React from "react";
import { Button } from "@/components/ui/button";
import { Menu, PanelRight } from "lucide-react";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { PermissionPill } from "@/components/conversation/PermissionPill";
import { useChat } from "@/context/ChatContext";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import type { WorkspaceRouteMeta } from "@/config/workspaceRouteMeta";
import { cn } from "@/lib/utils";

interface AppChromeHeaderProps {
  onOpenMobileSidebar: () => void;
  sidebarCollapsed: boolean;
  onExpandSidebar: () => void;
  workspaceMeta?: WorkspaceRouteMeta;
  rightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
}

export const AppChromeHeader: React.FC<AppChromeHeaderProps> = ({
  onOpenMobileSidebar,
  workspaceMeta,
  rightSidebarOpen,
  onToggleRightSidebar,
}) => {
  const { currentChatId, chats } = useChat();
  const activeChat = chats.find((c) => c.id === currentChatId);

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 bg-background/90 px-3 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 md:px-3">
      <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 md:hidden"
          onClick={onOpenMobileSidebar}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </Button>

        <div className="flex min-w-0 items-center gap-2">
          {workspaceMeta ? (
            <>
              <Badge variant="secondary" className="font-display text-[10px] uppercase tracking-wide">
                {workspaceMeta.tag}
              </Badge>
              <span className="truncate text-xs font-medium text-foreground md:text-sm">
                {workspaceMeta.title}
              </span>
            </>
          ) : (
            <span className="truncate text-xs font-medium text-foreground md:text-sm">
              {activeChat?.title || "Chat"}
            </span>
          )}
        </div>

      </div>

      <div className="flex shrink-0 items-center gap-0.5 md:gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-9 w-9 shrink-0 rounded-lg transition-colors", rightSidebarOpen && "bg-muted")}
              onClick={onToggleRightSidebar}
              aria-label={rightSidebarOpen ? "Close right sidebar" : "Open right sidebar (⌘J)"}
              aria-pressed={rightSidebarOpen}
            >
              <PanelRight className={cn("h-4 w-4", rightSidebarOpen && "text-primary")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {rightSidebarOpen ? "Close right sidebar" : "Open right sidebar (⌘J)"}
          </TooltipContent>
        </Tooltip>
        <FeedbackDialog compact />
        <ShareLinkButton />
        <PermissionPill />
      </div>
    </header>
  );
};
