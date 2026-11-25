import React, { useEffect, useLayoutEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import RightSidebar from "@/components/RightSidebar";
import ChatInput from "@/components/ChatInput";
import { CommandMenu } from "@/components/CommandMenu";
import { TaskCenterToasts } from "@/components/TaskCenterToasts";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useLocalAI } from "@/context/LocalAIContext";
import { PrivacyAnalytics } from "@/components/PrivacyAnalytics";
import { DesktopUpdateNotifier } from "@/components/DesktopUpdateNotifier";
import { PersistenceStatusBanner } from "@/components/PersistenceStatusBanner";
import { useChat } from "@/context/ChatContext";
import { canSendChat } from "@/types/chat";
import { cn } from "@/lib/utils";
import { AppChromeHeader } from "@/components/AppChromeHeader";
import { getWorkspaceRouteMeta } from "@/config/workspaceRouteMeta";
import { SIDEBAR_COLLAPSED_KEY } from "@/lib/storageMigrate";
import { rightSidebarMainMarginClass, sidebarMainMarginClass } from "@/lib/sidebarLayout";
import { isDesktopApp } from "@/lib/isDesktopApp";
import ChatMessages from "@/components/ChatMessages";
import { ExecutionInspector } from "@/components/conversation/ExecutionInspector";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { NarrationProvider } from "@/context/NarrationContext";
import { VoiceDock } from "@/components/narration/VoiceDock";
import { AppSettingsDialogControlled } from "@/components/AppSettingsDialog";
import {
  ComposerSlotContext,
  DOCKED_COMPOSER_SLOT_TEST_ID,
} from "@/components/composer/ComposerSlots";

export const OPEN_SETTINGS_EVENT = "openbentt-open-settings";

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
  /** Projects hub + Notebook keep the central sidebar but own their chrome/composer. */
  const isFullBleedStudio =
    location.pathname === "/notebook" ||
    location.pathname === "/webgpu" ||
    location.pathname === "/projects";
  /** Settings and tools are their own page — never a pane beside the chat transcript. */
  const isStandalonePage =
    location.pathname === "/settings" ||
    location.pathname === "/diagnostics" ||
    location.pathname === "/agent" ||
    location.pathname === "/tasks" ||
    location.pathname === "/documents" ||
    location.pathname === "/files" ||
    location.pathname === "/labs" ||
    location.pathname === "/write" ||
    location.pathname === "/benchmark";

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggleRightSidebar = useCallback(() => {
    setRightSidebarOpen((prev) => !prev);
  }, []);

  const openSearch = () => setCommandMenuOpen(true);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  useGlobalShortcuts({ onOpenSearch: openSearch, onOpenSettings: openSettings, onToggleRightSidebar: toggleRightSidebar });

  useEffect(() => {
    const onOpen = () => setSettingsOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
  }, []);

  // Deep-link /settings → floating card over the previous workspace route.
  useEffect(() => {
    if (location.pathname !== "/settings") return;
    setSettingsOpen(true);
    navigate("/chat", { replace: true });
  }, [location.pathname, navigate]);
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
    if (!workspaceMeta || isFullBleedStudio) {
      setWorkspaceRouteAssist(undefined);
      return;
    }
    setWorkspaceRouteAssist(workspaceMeta.systemAssist);
  }, [workspaceMeta, location.pathname, setWorkspaceRouteAssist, isFullBleedStudio]);

  useEffect(() => {
    if (location.pathname === "/notebook" && new URLSearchParams(location.search).has("panel")) {
      setWorkspacePanelOpen(true);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleNavigate = (e: CustomEvent<string>) => {
      // Phase 3/C: authoritative navigation-start mark for Notebook readiness.
      if (e.detail?.startsWith("/notebook")) {
        window.__openbenttNotebookMarks?.navigationInitiated?.({ source: "AppLayout sidebar" });
      }
      navigate(e.detail);
    };
    window.addEventListener("navigate", handleNavigate as EventListener);
    return () => window.removeEventListener("navigate", handleNavigate as EventListener);
  }, [navigate]);

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

  // One composer for the whole shell. The route/chat state decides which
  // layout slot hosts it; the composer itself is never mounted twice.
  const hasComposerSurface = !isFullBleedStudio && !isStandalonePage;
  const isChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const isEmptyChat = isChatRoute && messages.length === 0 && !isLoading;
  const [emptyComposerSlot, setEmptyComposerSlot] = useState<HTMLDivElement | null>(null);
  const [dockedComposerSlot, setDockedComposerSlot] = useState<HTMLDivElement | null>(null);
  // Stable portal host: moving this DOM node keeps ChatInput mounted (and its
  // draft/focus/state intact) when the composer changes position.
  const [composerHost] = useState<HTMLDivElement | null>(() => {
    if (typeof document === "undefined") return null;
    const host = document.createElement("div");
    host.className = "w-full";
    return host;
  });
  const composerSlot = hasComposerSurface
    ? isEmptyChat
      ? emptyComposerSlot
      : dockedComposerSlot
    : null;

  useLayoutEffect(() => {
    if (!composerHost || !composerSlot || composerHost.parentElement === composerSlot) return;
    const focused = document.activeElement as HTMLElement | null;
    const restoreFocus = Boolean(focused && composerHost.contains(focused));
    composerSlot.appendChild(composerHost);
    if (restoreFocus) focused?.focus({ preventScroll: true });
  }, [composerHost, composerSlot]);

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
  const layerUsable =
    openCodeLayer.available ||
    openCodeLayer.askReady ||
    openCodeLayer.opencodeInstalled ||
    openCodeLayer.checking;
  if (!canSendChat(apiConfig) && !localAIUsable && !layerUsable) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <NarrationProvider>
    <div className={cn("flex overflow-hidden", isDesktopApp() ? "h-full" : "h-screen")}>
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        onOpenSearch={openSearch}
        onOpenSettings={openSettings}
      />
      <AppSettingsDialogControlled open={settingsOpen} onOpenChange={setSettingsOpen} />
      <PrivacyAnalytics />
      <DesktopUpdateNotifier />
      <PersistenceStatusBanner />
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
          sidebarMainMarginClass(sidebarCollapsed),
          rightSidebarMainMarginClass(rightSidebarOpen)
        )}
      >
        {!isFullBleedStudio && (
          <AppChromeHeader
            onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
            onExpandSidebar={() => setSidebarCollapsed(false)}
            workspaceMeta={workspaceMeta}
            rightSidebarOpen={rightSidebarOpen}
            onToggleRightSidebar={toggleRightSidebar}
          />
        )}

        {/* Mobile menu affordance when studio owns the chrome */}
        {isFullBleedStudio && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-2 py-1.5 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsMobileSidebarOpen(true)}
              aria-label="Open menu"
            >
              <PanelRightOpen size={18} className="rotate-180" />
            </Button>
            <span className="text-xs font-medium text-muted-foreground">Menu</span>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {isFullBleedStudio || isStandalonePage ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Outlet />
            </div>
          ) : workspaceMeta && isMobile ? (
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
            <ComposerSlotContext.Provider value={setEmptyComposerSlot}>
              <Outlet />
            </ComposerSlotContext.Provider>
          )}
        </div>

        {/* Composer stays on chat. Settings and tools are full pages. */}
        {hasComposerSurface && !isEmptyChat && (
          <div
            ref={setDockedComposerSlot}
            data-testid={DOCKED_COMPOSER_SLOT_TEST_ID}
            className="shrink-0 bg-gradient-to-t from-card/90 to-background/95 backdrop-blur-sm"
          />
        )}
        {hasComposerSurface &&
          composerHost &&
          createPortal(
            <ChatInput
              isLoading={isLoading}
              workspaceMeta={workspaceMeta}
              placeholderOverride={isEmptyChat ? "Ask anything..." : undefined}
            />,
            composerHost
          )}
      </main>
      {/* Right sidebar: Files, Activity, Tools, Settings */}
      <RightSidebar isOpen={rightSidebarOpen} onClose={() => setRightSidebarOpen(false)} />
      {/* Secondary execution inspector: conversation primary, internals secondary. */}
      <ExecutionInspector />
      <VoiceDock />
    </div>
    </NarrationProvider>
  );
};

export default AppLayout;
