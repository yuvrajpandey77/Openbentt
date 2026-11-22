import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { DesktopAppFrame } from "@/components/DesktopTitleBar";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { OnboardingProvider, useOnboarding } from "./context/OnboardingContext";
import { TaskCenterProvider } from "./context/TaskCenterContext";
import { LocalAIProvider } from "./context/LocalAIContext";
import { ChatProvider } from "./context/ChatContext";
import { ResearchProjectProvider } from "./context/ResearchProjectContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import { LocalModelProvider } from "./context/LocalModelContext";
import { ZoteroProvider } from "./context/ZoteroContext";
import AppLayout from "./layouts/AppLayout";
import { AppShell } from "@/components/AppShell";
import HomeChatArea from "./components/HomeChatArea";
import { ThreadContextProvider } from "@/components/conversation/ThreadContextProvider";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FeatureErrorBoundary } from "./components/FeatureErrorBoundary";
import { WebWorkspaceRouteGuard } from "@/components/WebWorkspaceRouteGuard";
import { DesktopLandingRedirect } from "@/components/DesktopRouteGuard";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { isDesktopApp } from "@/lib/isDesktopApp";

const NotebookStudioPage = lazy(() => import("./pages/NotebookStudioPage"));
const ProjectsHubPage = lazy(() => import("./pages/ProjectsHubPage"));
const ResearchLabsPage = lazy(() => import("./pages/ResearchLabsPage"));
const LatexWorkspacePage = lazy(() => import("./pages/LatexWorkspacePage"));
const BenchmarkPage = lazy(() => import("./pages/BenchmarkPage"));
const ShareViewPage = lazy(() => import("./pages/ShareViewPage"));
const DownloadPage = lazy(() => import("./pages/DownloadPage"));
const NewsPage = lazy(() => import("./pages/NewsPage"));
const HomeLandingPage = lazy(() => import("./pages/HomeLandingPage"));
const SetupPage = lazy(() => import("./pages/SetupPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AgentPage = lazy(() => import("./pages/AgentPage"));
const ProjectWorkspacePage = lazy(() => import("./pages/ProjectWorkspacePage"));
const ConversationRoutePage = lazy(() => import("./pages/ConversationRoutePage"));
const FilesPage = lazy(() => import("./pages/FilesPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const DocumentsPage = lazy(() => import("./pages/DocumentsPage"));
const DiagnosticsPage = lazy(() => import("./pages/DiagnosticsPage"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground text-sm">Loading…</div>
);

/** Desktop: marketing home is skipped — go to onboarding or chat. Web keeps the landing page. */
function RootMarketingOrElectronRedirect() {
  const { needsOnboarding } = useOnboarding();
  if (isDesktopApp()) {
    return <Navigate to={needsOnboarding ? "/welcome" : "/chat"} replace />;
  }
  return <HomeLandingPage />;
}

/** Installers page is for the website only — desktop users already have the app. */
function DownloadPageOrDesktopRedirect() {
  const { needsOnboarding } = useOnboarding();
  if (isDesktopApp()) {
    return <Navigate to={needsOnboarding ? "/welcome" : "/chat"} replace />;
  }
  return <DownloadPage />;
}

/** Onboarding renders without main app chrome; completed users go straight to chat. */
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
                <DesktopLandingRedirect />
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    {/* Public / marketing routes */}
                    <Route
                      path="/"
                      element={
                        <FeatureErrorBoundary feature="home">
                          <RootMarketingOrElectronRedirect />
                        </FeatureErrorBoundary>
                      }
                    />
                    <Route
                      path="/download"
                      element={
                        <FeatureErrorBoundary feature="download">
                          <DownloadPageOrDesktopRedirect />
                        </FeatureErrorBoundary>
                      }
                    />
                    <Route
                      path="/news"
                      element={
                        <FeatureErrorBoundary feature="news">
                          <NewsPage />
                        </FeatureErrorBoundary>
                      }
                    />
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
                                  <WorkspaceProvider>
                                    <Outlet />
                                  </WorkspaceProvider>
                                </LocalAIProvider>
                              </TaskCenterProvider>
                            </ZoteroProvider>
                          </ResearchProjectProvider>
                        </LocalModelProvider>
                      </ChatProvider>
                    }
                  >
                    <Route element={<AppShell />}>
                      <Route path="welcome" element={<WelcomeOrChatRedirect />} />
                      <Route path="setup" element={<FeatureErrorBoundary feature="setup"><SetupPage /></FeatureErrorBoundary>} />

                      {/* Main shell: Sidebar always present (incl. Projects hub + Notebook). */}
                      <Route element={<AppLayout />}>
                        <Route element={<WebWorkspaceRouteGuard />}>
                          <Route path="chat" element={<FeatureErrorBoundary feature="chat"><ThreadContextProvider><HomeChatArea /></ThreadContextProvider></FeatureErrorBoundary>} />
                          <Route path="chat/:conversationId" element={<FeatureErrorBoundary feature="chat"><ConversationRoutePage /></FeatureErrorBoundary>} />
                          <Route path="projects" element={<FeatureErrorBoundary feature="projects"><ProjectsHubPage /></FeatureErrorBoundary>} />
                          <Route path="projects/:projectId" element={<FeatureErrorBoundary feature="project workspace"><ProjectWorkspacePage /></FeatureErrorBoundary>} />
                          <Route path="projects/:projectId/chat/:conversationId" element={<FeatureErrorBoundary feature="project workspace"><ProjectWorkspacePage /></FeatureErrorBoundary>} />
                          <Route path="notebook" element={<FeatureErrorBoundary feature="notebook"><NotebookStudioPage /></FeatureErrorBoundary>} />
                          <Route path="agent" element={<FeatureErrorBoundary feature="agent"><AgentPage /></FeatureErrorBoundary>} />
                          <Route path="files" element={<FeatureErrorBoundary feature="files"><FilesPage /></FeatureErrorBoundary>} />
                          <Route path="tasks" element={<FeatureErrorBoundary feature="tasks"><TasksPage /></FeatureErrorBoundary>} />
                          <Route path="documents" element={<FeatureErrorBoundary feature="documents"><DocumentsPage /></FeatureErrorBoundary>} />
                          <Route path="diagnostics" element={<FeatureErrorBoundary feature="diagnostics"><DiagnosticsPage /></FeatureErrorBoundary>} />
                          <Route path="labs" element={<FeatureErrorBoundary feature="research labs"><ResearchLabsPage /></FeatureErrorBoundary>} />
                          <Route path="settings" element={<FeatureErrorBoundary feature="settings"><SettingsPage /></FeatureErrorBoundary>} />
                          <Route path="write" element={<FeatureErrorBoundary feature="latex workspace"><LatexWorkspacePage /></FeatureErrorBoundary>} />
                          <Route path="benchmark" element={<FeatureErrorBoundary feature="benchmark"><BenchmarkPage /></FeatureErrorBoundary>} />
                          <Route path="webgpu" element={<FeatureErrorBoundary feature="on-device models"><NotebookStudioPage /></FeatureErrorBoundary>} />
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
