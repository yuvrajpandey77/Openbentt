import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Routes, Route } from "react-router-dom";
import { DesktopAppFrame } from "@/components/DesktopTitleBar";
import { ThemeProvider } from "./context/ThemeContext";
import { ChatProvider } from "./context/ChatContext";
import { ResearchProjectProvider } from "./context/ResearchProjectContext";
import { LocalModelProvider } from "./context/LocalModelContext";
import { ZoteroProvider } from "./context/ZoteroContext";
import AppLayout from "./layouts/AppLayout";
import { AppShell } from "@/components/AppShell";
import HomeChatArea from "./components/HomeChatArea";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WebWorkspaceRouteGuard } from "@/components/WebWorkspaceRouteGuard";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { isChatPwaStandalone } from "@/lib/chatPwa";
import { ChatPwaStandaloneGuard } from "@/components/web/ChatPwaStandaloneGuard";

const NotebookStudioPage = lazy(() => import("./pages/NotebookStudioPage"));
const ProjectsHubPage = lazy(() => import("./pages/ProjectsHubPage"));
const ResearchLabsPage = lazy(() => import("./pages/ResearchLabsPage"));
const LatexWorkspacePage = lazy(() => import("./pages/LatexWorkspacePage"));
const BenchmarkPage = lazy(() => import("./pages/BenchmarkPage"));
const ShareViewPage = lazy(() => import("./pages/ShareViewPage"));
const WebGpuPage = lazy(() => import("./pages/WebGpuPage"));
const DownloadPage = lazy(() => import("./pages/DownloadPage"));
const HomeLandingPage = lazy(() => import("./pages/HomeLandingPage"));
const SetupPage = lazy(() => import("./pages/SetupPage"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground text-sm">Loading…</div>
);

/** Web: marketing landing. Electron: projects hub. Installed chat PWA: always /chat. */
function RootMarketingOrElectronRedirect() {
  if (isChatPwaStandalone()) {
    return <Navigate to="/chat" replace />;
  }
  if (isDesktopApp()) {
    return <Navigate to="/projects" replace />;
  }
  return <HomeLandingPage />;
}

/** Installers page is for the website only — desktop users already have the app. */
function DownloadPageOrDesktopRedirect() {
  if (isChatPwaStandalone()) {
    return <Navigate to="/chat" replace />;
  }
  if (isDesktopApp()) {
    return <Navigate to="/projects" replace />;
  }
  return <DownloadPage />;
}

/** Standalone LaTeX page merged into notebook studio on desktop. */
function DesktopWriteRedirect() {
  if (isDesktopApp()) {
    return <Navigate to="/projects" replace />;
  }
  return <LatexWorkspacePage />;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <DesktopAppFrame>
            <ChatPwaStandaloneGuard>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Public / marketing routes */}
                <Route path="/" element={<RootMarketingOrElectronRedirect />} />
                <Route path="/download" element={<DownloadPageOrDesktopRedirect />} />
                <Route path="/share" element={<ShareViewPage />} />

                {/* All app routes share one ChatProvider instance */}
                <Route
                  element={
                    <ChatProvider>
                      <LocalModelProvider>
                        <ResearchProjectProvider>
                          <ZoteroProvider>
                            <Outlet />
                          </ZoteroProvider>
                        </ResearchProjectProvider>
                      </LocalModelProvider>
                    </ChatProvider>
                  }
                >
                  {/* Onboarding — no app chrome */}
                  <Route element={<AppShell />}>
                    <Route path="setup" element={<SetupPage />} />

                    {/* Full-screen research studio (no chat split) */}
                    <Route path="projects" element={<ProjectsHubPage />} />
                    <Route path="notebook" element={<NotebookStudioPage />} />

                    {/* Main app shell */}
                    <Route element={<AppLayout />}>
                      <Route element={<WebWorkspaceRouteGuard />}>
                        <Route path="chat" element={<HomeChatArea />} />
                        <Route path="labs" element={<ResearchLabsPage />} />
                        <Route path="write" element={<DesktopWriteRedirect />} />
                        <Route path="benchmark" element={<BenchmarkPage />} />
                        <Route path="webgpu" element={<WebGpuPage />} />
                      </Route>
                    </Route>
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            </ChatPwaStandaloneGuard>
            </DesktopAppFrame>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
