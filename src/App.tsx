import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Routes, Route } from "react-router-dom";
import { DesktopAppFrame } from "@/components/DesktopTitleBar";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { OnboardingProvider, useOnboarding } from "./context/OnboardingContext";
import { TaskCenterProvider } from "./context/TaskCenterContext";
import { LocalAIProvider } from "./context/LocalAIContext";
import { ChatProvider } from "./context/ChatContext";
import { ResearchProjectProvider } from "./context/ResearchProjectContext";
import { LocalModelProvider } from "./context/LocalModelContext";
import { ZoteroProvider } from "./context/ZoteroContext";
import AppLayout from "./layouts/AppLayout";
import { AppShell } from "@/components/AppShell";
import HomeChatArea from "./components/HomeChatArea";
import { OnboardingFlow } from "./components/OnboardingFlow";
import { AuthPage } from "./components/AuthPage";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FeatureErrorBoundary } from "./components/FeatureErrorBoundary";
import { WebWorkspaceRouteGuard } from "@/components/WebWorkspaceRouteGuard";
import { isDesktopApp } from "@/lib/isDesktopApp";

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
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AgentPage = lazy(() => import("./pages/AgentPage"));
const ProjectWorkspacePage = lazy(() => import("./pages/ProjectWorkspacePage"));
const ConversationRoutePage = lazy(() => import("./pages/ConversationRoutePage"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground text-sm">Loading…</div>
);

/**
 * Phase 9 — chat-first entry. Desktop: first run → /welcome onboarding,
 * otherwise → /chat. Web keeps the marketing landing.
 */
function RootDesktopGate() {
  const { needsOnboarding } = useOnboarding();
  if (needsOnboarding) {
    return <Navigate to="/welcome" replace />;
  }
  return <Navigate to="/chat" replace />;
}

function RootMarketingOrElectronRedirect() {
  if (isDesktopApp()) {
    return <RootDesktopGate />;
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

/** Standalone LaTeX page merged into notebook studio on desktop. */
function DesktopWriteRedirect() {
  if (isDesktopApp()) {
    return <Navigate to="/notebook" replace />;
  }
  return <LatexWorkspacePage />;
}

/** Onboarding/auth screens render without app chrome. */
function WelcomeOrChatRedirect() {
  const { needsOnboarding } = useOnboarding();
  if (!needsOnboarding) {
    return <Navigate to="/chat" replace />;
  }
  return (
    <FeatureErrorBoundary feature="onboarding">
      <OnboardingFlow />
    </FeatureErrorBoundary>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <OnboardingProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <DesktopAppFrame>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    {/* Public / marketing routes */}
                    <Route path="/" element={<FeatureErrorBoundary feature="home"><RootMarketingOrElectronRedirect /></FeatureErrorBoundary>} />
                    <Route path="/download" element={<FeatureErrorBoundary feature="download"><DownloadPageOrDesktopRedirect /></FeatureErrorBoundary>} />
                    <Route path="/share" element={<FeatureErrorBoundary feature="shared run"><ShareViewPage /></FeatureErrorBoundary>} />

                    {/* All app routes share one ChatProvider instance */}
                    <Route
                      element={
                        <ChatProvider>
                          <LocalModelProvider>
                            <ResearchProjectProvider>
                              <ZoteroProvider>
                                <TaskCenterProvider>
                                  <LocalAIProvider>
                                    <Outlet />
                                  </LocalAIProvider>
                                </TaskCenterProvider>
                              </ZoteroProvider>
                            </ResearchProjectProvider>
                          </LocalModelProvider>
                        </ChatProvider>
                      }
                    >
                      {/* Onboarding + auth — no app chrome */}
                      <Route element={<AppShell />}>
                        <Route path="welcome" element={<WelcomeOrChatRedirect />} />
                        <Route path="auth" element={<FeatureErrorBoundary feature="auth"><AuthPage /></FeatureErrorBoundary>} />
                        <Route path="setup" element={<FeatureErrorBoundary feature="setup"><SetupPage /></FeatureErrorBoundary>} />

                        {/* Full-screen research studio (same shell frame, own layout) */}
                        <Route path="projects" element={<FeatureErrorBoundary feature="projects"><ProjectsHubPage /></FeatureErrorBoundary>} />
                        <Route path="notebook" element={<FeatureErrorBoundary feature="notebook"><NotebookStudioPage /></FeatureErrorBoundary>} />

                        {/* Main app shell */}
                        <Route element={<AppLayout />}>
                          <Route element={<WebWorkspaceRouteGuard />}>
                            {isDesktopApp() && <Route path="chat" element={<FeatureErrorBoundary feature="chat"><HomeChatArea /></FeatureErrorBoundary>} />}
                            {isDesktopApp() && <Route path="chat/:conversationId" element={<FeatureErrorBoundary feature="chat"><ConversationRoutePage /></FeatureErrorBoundary>} />}
                            {/* Project workspace: ONE conversation model, projectId as context boundary */}
                            <Route path="projects/:projectId" element={<FeatureErrorBoundary feature="project workspace"><ProjectWorkspacePage /></FeatureErrorBoundary>} />
                            <Route path="projects/:projectId/chat/:conversationId" element={<FeatureErrorBoundary feature="project workspace"><ProjectWorkspacePage /></FeatureErrorBoundary>} />
                            {/* Hidden advanced/diagnostic execution view (not a product destination) */}
                            {isDesktopApp() && <Route path="agent" element={<FeatureErrorBoundary feature="agent"><AgentPage /></FeatureErrorBoundary>} />}
                            <Route path="labs" element={<FeatureErrorBoundary feature="research labs"><ResearchLabsPage /></FeatureErrorBoundary>} />
                            <Route path="settings" element={<FeatureErrorBoundary feature="settings"><SettingsPage /></FeatureErrorBoundary>} />
                            <Route path="write" element={<FeatureErrorBoundary feature="latex workspace"><DesktopWriteRedirect /></FeatureErrorBoundary>} />
                            <Route path="benchmark" element={<FeatureErrorBoundary feature="benchmark"><BenchmarkPage /></FeatureErrorBoundary>} />
                            <Route path="webgpu" element={<FeatureErrorBoundary feature="on-device models"><WebGpuPage /></FeatureErrorBoundary>} />
                          </Route>
                        </Route>
                      </Route>
                    </Route>

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
                </DesktopAppFrame>
              </BrowserRouter>
            </TooltipProvider>
          </OnboardingProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
