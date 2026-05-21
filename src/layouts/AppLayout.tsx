import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, PanelRightOpen } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ChatInput from "@/components/ChatInput";
import { PrivacyAnalytics } from "@/components/PrivacyAnalytics";
import { DesktopUpdateNotifier } from "@/components/DesktopUpdateNotifier";
import { useChat } from "@/context/ChatContext";
import { canSendChat } from "@/types/chat";
import { cn } from "@/lib/utils";
import { AppChromeHeader } from "@/components/AppChromeHeader";
import { getWorkspaceRouteMeta } from "@/config/workspaceRouteMeta";
import { SIDEBAR_COLLAPSED_KEY } from "@/lib/storageMigrate";
import { sidebarMainMarginClass } from "@/lib/sidebarLayout";
import { isDesktopApp } from "@/lib/isDesktopApp";
import ChatMessages from "@/components/ChatMessages";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";

const WORKSPACE_PANEL_KEY = "openbentt-workspace-panel-open";

/**
 * Persistent shell: sidebar + header + page content + global composer.
 * Workspace routes start with the chat pane full-width; the second pane
 * opens when the user clicks the workspace toggle button.
 */
const AppLayout: React.FC = () => {
  const { apiConfig, isLoadingConfig, isLoading, chats, currentChatId, createNewChat, setWorkspaceRouteAssist } =
    useChat();
  const location = useLocation();
  const workspaceMeta = getWorkspaceRouteMeta(location.pathname);
  const isMobile = useIsMobile();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored !== null) return stored === "1";
      return isDesktopApp();
    } catch {
      return isDesktopApp();
    }
  });
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(() => {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem(WORKSPACE_PANEL_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch { /* ignore */ }
  }, [sidebarCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACE_PANEL_KEY, workspacePanelOpen ? "1" : "0");
    } catch { /* ignore */ }
  }, [workspacePanelOpen]);

  useEffect(() => {
    if (!currentChatId && canSendChat(apiConfig)) {
      createNewChat();
    }
  }, [currentChatId, createNewChat, apiConfig]);

  useEffect(() => {
    if (!workspaceMeta) {
      setWorkspaceRouteAssist(undefined);
      return;
    }
    if (location.pathname === "/notebook") return;
    setWorkspaceRouteAssist(workspaceMeta.systemAssist);
  }, [workspaceMeta, location.pathname, setWorkspaceRouteAssist]);

  useEffect(() => {
    if (location.pathname === "/notebook" && new URLSearchParams(location.search).has("panel")) {
      setWorkspacePanelOpen(true);
    }
  }, [location.pathname, location.search]);

  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages ?? [];

  if (isLoadingConfig) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <div className="text-center">
          <p className="font-medium text-foreground">Loading Openbentt</p>
          <p className="mt-1 text-sm text-muted-foreground">Restoring settings and chat history…</p>
        </div>
      </div>
    );
  }

  // Redirect to setup if no provider is configured
  if (!canSendChat(apiConfig)) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <div className={cn("flex overflow-hidden", isDesktopApp() ? "h-full" : "h-screen")}>
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
      />
      <PrivacyAnalytics />
      <DesktopUpdateNotifier />

      {isMobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="fixed left-[280px] top-4 z-50 md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          >
            <X size={20} />
          </Button>
        </>
      )}

      <main
        className={cn(
          "flex min-h-0 flex-1 flex-col transition-[margin] duration-300 ease-out",
          sidebarMainMarginClass(sidebarCollapsed)
        )}
      >
        <AppChromeHeader
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          workspaceMeta={workspaceMeta}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {workspaceMeta && isMobile ? (
            /* Mobile: tab switcher between chat and workspace */
            <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <TabsList className="mx-2 mt-2 grid h-9 w-auto shrink-0 grid-cols-2 rounded-lg bg-muted/80 p-1">
                <TabsTrigger value="chat" className="text-xs sm:text-sm">Chat</TabsTrigger>
                <TabsTrigger value="workspace" className="text-xs sm:text-sm">Workspace</TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="mt-0 min-h-0 flex-1 overflow-hidden focus-visible:outline-none">
                <div className="flex h-full min-h-0 flex-col border-t border-border/60">
                  <ChatMessages messages={messages} isLoading={isLoading} />
                </div>
              </TabsContent>
              <TabsContent value="workspace" className="mt-0 min-h-0 flex-1 overflow-hidden focus-visible:outline-none">
                <div className="flex h-full min-h-0 flex-col overflow-y-auto border-t border-border/60">
                  <Outlet />
                </div>
              </TabsContent>
            </Tabs>
          ) : workspaceMeta && workspacePanelOpen ? (
            /* Desktop with workspace panel open: resizable split */
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId="openbentt-workspace-thread-split-h"
              className="min-h-0 flex-1"
            >
              <ResizablePanel defaultSize={45} minSize={22} maxSize={72} className="min-h-0 min-w-0">
                <div className="flex h-full min-h-0 flex-col border-r border-border/70">
                  <ChatMessages messages={messages} isLoading={isLoading} />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle className="w-px shrink-0 bg-muted/40" />
              <ResizablePanel defaultSize={55} minSize={28} className="min-h-0 min-w-0">
                <div className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden">
                  <Outlet />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : workspaceMeta && !workspacePanelOpen ? (
            /* Desktop with workspace available but panel closed: full-width chat + open button */
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ChatMessages messages={messages} isLoading={isLoading} />
              <div className="shrink-0 border-t border-border/50 px-3 py-1.5 text-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setWorkspacePanelOpen(true)}
                    >
                      <PanelRightOpen size={14} />
                      Open {workspaceMeta.title} workspace panel
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{workspaceMeta.subtitle}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ) : (
            /* No workspace route — just render the page */
            <Outlet />
          )}
        </div>

        <div className="shrink-0 bg-gradient-to-t from-card/90 to-background/95 backdrop-blur-sm">
          <ChatInput isLoading={isLoading} workspaceMeta={workspaceMeta} />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
