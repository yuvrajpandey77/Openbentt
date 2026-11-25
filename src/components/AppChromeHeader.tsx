import React from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NavBackButton } from "@/components/NavBackButton";
import { ChromeCenterPill } from "@/components/ChromeCenterPill";
import { MenuIcon } from "@/components/icons";
import type { WorkspaceRouteMeta } from "@/config/workspaceRouteMeta";

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
  const location = useLocation();
  const showBack =
    Boolean(workspaceMeta) ||
    (location.pathname.startsWith("/projects/") && location.pathname !== "/projects");

  return (
    <header className="relative grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 bg-background px-3 py-2.5 md:px-3">
      <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 md:hidden"
          onClick={onOpenMobileSidebar}
          aria-label="Open menu"
        >
          <MenuIcon size={20} />
        </Button>

        {showBack ? <NavBackButton fallback="/chat" className="hidden sm:inline-flex" /> : null}

        {workspaceMeta ? (
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="secondary" className="font-display text-[10px] uppercase tracking-wide">
              {workspaceMeta.tag}
            </Badge>
            <span className="truncate text-xs font-medium text-foreground md:text-sm">
              {workspaceMeta.title}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex justify-center">
        <ChromeCenterPill open={rightSidebarOpen} onToggle={onToggleRightSidebar} />
      </div>

      <div className="min-w-0" aria-hidden />
    </header>
  );
};
