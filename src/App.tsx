import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { ChatProvider } from "./context/ChatContext";
import AppLayout from "./layouts/AppLayout";
import HomeChatArea from "./components/HomeChatArea";
import NotFound from "./pages/NotFound";

const NotebookPage = lazy(() => import("./pages/NotebookPage"));
const ResearchLabsPage = lazy(() => import("./pages/ResearchLabsPage"));
const LatexWorkspacePage = lazy(() => import("./pages/LatexWorkspacePage"));
const BenchmarkPage = lazy(() => import("./pages/BenchmarkPage"));
const ShareViewPage = lazy(() => import("./pages/ShareViewPage"));
const WebGpuPage = lazy(() => import("./pages/WebGpuPage"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground text-sm">Loading module…</div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ChatProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/share" element={<ShareViewPage />} />
                <Route path="/" element={<AppLayout />}>
                  <Route index element={<Navigate to="/chat" replace />} />
                  <Route path="chat" element={<HomeChatArea />} />
                  <Route path="notebook" element={<NotebookPage />} />
                  <Route path="labs" element={<ResearchLabsPage />} />
                  <Route path="write" element={<LatexWorkspacePage />} />
                  <Route path="benchmark" element={<BenchmarkPage />} />
                  <Route path="webgpu" element={<WebGpuPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ChatProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
