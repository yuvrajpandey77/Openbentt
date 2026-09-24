import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PanelRightOpen } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ChatInput from "@/components/ChatInput";
import { CommandMenu } from "@/components/CommandMenu";
import { TaskCenterToasts } from "@/components/TaskCenterToasts";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useLocalAI } from "@/context/LocalAIContext";
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
import { ExecutionInspector } from "@/components/conversation/ExecutionInspector";
import { VoiceCommandFab } from "@/components/conversation/VoiceCommandFab";
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
  const { apiConfig, isLoadingConfig, isLoading, chats, currentChatId, createNewChat, setWorkspaceRouteAssist, openCodeLayer } =
    useChat();
  const { health: localAIHealth } = useLocalAI();
  const navigate = useNavigate();
  const location = useLocation();
  const workspaceMeta = getWorkspaceRouteMeta(location.pathname);
  const isMobile = useIsMobile();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const openSearch = () => setCommandMenuOpen(true);
  const openSettings = () => navigate("/settings");
  useGlobalShortcuts({ onOpenSearch: openSearch, onOpenSettings: openSettings });
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

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileSidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isMobileSidebarOpen]);

  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages ?? [];
  const activeTaskId = currentChat?.taskIds?.length ? currentChat.taskIds[currentChat.taskIds.length - 1] : undefined;

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

  // Redirect to setup only when NO layer can serve chat. The universal
  // OpenCode layer (desktop) needs no keys — it unblocks the app on its own.
  // While any layer is still being detected, render the workspace instead of
  // bouncing the user away.
  const localAIUsable = localAIHealth === "ready" || localAIHealth === "checking";
  const layerUsable = openCodeLayer.available || openCodeLayer.checking;
  if (!canSendChat(apiConfig) && !localAIUsable && !layerUsable) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <div className={cn("flex overflow-hidden", isDesktopApp() ? "h-full" : "h-screen")}>
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        onOpenSearch={openSearch}
        onOpenLocalAI={() => navigate("/settings")}
      />
      <PrivacyAnalytics />
      <DesktopUpdateNotifier />
      <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />
      <TaskCenterToasts />

      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 z-[var(--z-scrim)] bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-hidden
        />
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
            <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <TabsList className="mx-2 mt-2 grid h-9 w-auto shrink-0 grid-cols-2 rounded-lg bg-muted/80 p-1">
                <TabsTrigger value="chat" className="text-xs sm:text-sm">Chat</TabsTrigger>
                <TabsTrigger value="workspace" className="text-xs sm:text-sm">Workspace</TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="mt-0 min-h-0 flex-1 overflow-hidden focus-visible:outline-none">
                <div className="flex h-full min-h-0 flex-col border-t border-border/60">
                  <ChatMessages messages={messages} isLoading={isLoading} activeTaskId={activeTaskId} />
                </div>
              </TabsContent>
              <TabsContent value="workspace" className="mt-0 min-h-0 flex-1 overflow-hidden focus-visible:outline-none">
                <div className="flex h-full min-h-0 flex-col overflow-y-auto border-t border-border/60">
                  <Outlet />
                </div>
              </TabsContent>
            </Tabs>
          ) : workspaceMeta && workspacePanelOpen ? (
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId="openbentt-workspace-thread-split-h"
              className="min-h-0 flex-1"
            >
              <ResizablePanel defaultSize={45} minSize={22} maxSize={72} className="min-h-0 min-w-0">
                <div className="flex h-full min-h-0 flex-col border-r border-border/70">
                  <ChatMessages messages={messages} isLoading={isLoading} activeTaskId={activeTaskId} />
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ChatMessages messages={messages} isLoading={isLoading} activeTaskId={activeTaskId} />
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
            <Outlet />
          )}
        </div>

        {/* ONE composer everywhere: execution runs inside the conversation. */}
        <div className="shrink-0 bg-gradient-to-t from-card/90 to-background/95 backdrop-blur-sm">
          <ChatInput isLoading={isLoading} workspaceMeta={workspaceMeta} />
        </div>
      </main>
      {/* Secondary execution inspector: conversation primary, internals secondary. */}
      <ExecutionInspector />
      {/* Central floating voice commander: open tabs or run any task by voice. */}
      <VoiceCommandFab />
    </div>
  );
};

export default AppLayout;
