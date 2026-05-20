import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { ChatProvider } from "./context/ChatContext";
import { ResearchProjectProvider } from "./context/ResearchProjectContext";
import { LocalModelProvider } from "./context/LocalModelContext";
import { ZoteroProvider } from "./context/ZoteroContext";
import AppLayout from "./layouts/AppLayout";
import HomeChatArea from "./components/HomeChatArea";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WebWorkspaceRouteGuard } from "@/components/WebWorkspaceRouteGuard";
import { isDesktopApp } from "@/lib/isDesktopApp";

const NotebookPage = lazy(() => import("./pages/NotebookPage"));
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

/** Web: marketing landing. Electron: skip straight to chat. */
function RootMarketingOrElectronRedirect() {
  if (isDesktopApp()) {
    return <Navigate to="/chat" replace />;
  }
  return <HomeLandingPage />;
}

/** Installers page is for the website only — desktop users already have the app. */
function DownloadPageOrDesktopRedirect() {
  if (isDesktopApp()) {
    return <Navigate to="/chat" replace />;
  }
  return <DownloadPage />;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
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
                  <Route path="setup" element={<SetupPage />} />

                  {/* Main app shell */}
                  <Route element={<AppLayout />}>
                    <Route element={<WebWorkspaceRouteGuard />}>
                      <Route path="chat" element={<HomeChatArea />} />
                      <Route path="notebook" element={<NotebookPage />} />
                      <Route path="labs" element={<ResearchLabsPage />} />
                      <Route path="write" element={<LatexWorkspacePage />} />
                      <Route path="benchmark" element={<BenchmarkPage />} />
                      <Route path="webgpu" element={<WebGpuPage />} />
                    </Route>
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
