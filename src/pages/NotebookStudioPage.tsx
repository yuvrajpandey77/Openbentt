import React, { useEffect } from "react";
import { ResearchWorkspaceProvider } from "@/context/ResearchWorkspaceContext";
import { NotebookStudioProvider } from "@/context/NotebookStudioContext";
import { NotebookUrlPanelSync } from "@/components/research/NotebookUrlPanelSync";
import { NotebookStudioShell } from "@/components/notebook/NotebookStudioShell";
import { ProjectLoadingScreen } from "@/components/notebook/ProjectLoadingScreen";
import { DesktopOnlyGate } from "@/components/notebook/DesktopOnlyGate";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { PrivacyAnalytics } from "@/components/PrivacyAnalytics";
import { DesktopUpdateNotifier } from "@/components/DesktopUpdateNotifier";

const NotebookStudioPage: React.FC = () => {
  const { loading, project } = useResearchProject();
  // Project lives in app-scoped ResearchProjectProvider — returning from Chat/Projects
  // must not flash a loading screen when the project is already in memory.
  const showLoading = loading && !project;

  useEffect(() => {
    document.title = project ? `${project.title} — Openbentt` : "Notebook — Openbentt";
  }, [project?.title]);

  // Free BusyTeX WASM + MiniLM when leaving Notebook — but never while compile/index is live.
  useEffect(() => {
    return () => {
      void import("@/lib/backgroundWork").then(({ hasActiveBackgroundWork }) => {
        if (hasActiveBackgroundWork(["compile", "index", "paper"])) return;
        void import("@/lib/latexWasmCompile").then((m) => m.terminateLatexWasmRunner()).catch(() => {});
        void import("@/lib/research/embedCore.mjs").then((m) => m.disposeEmbedder()).catch(() => {});
      });
    };
  }, []);

  return (
    <DesktopOnlyGate>
      {showLoading ? (
        <ProjectLoadingScreen
          title={project ? `Opening ${project.title}` : "Loading project"}
          subtitle="Loading files, draft, and workspace…"
        />
      ) : !project ? (
        <ProjectLoadingScreen
          title="No project open"
          subtitle="Open or create a project from Projects, then return to Notebook."
        />
      ) : (
        <NotebookStudioProvider>
          <ResearchWorkspaceProvider>
            <PrivacyAnalytics />
            <DesktopUpdateNotifier />
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <NotebookUrlPanelSync />
              <NotebookStudioShell />
            </div>
          </ResearchWorkspaceProvider>
        </NotebookStudioProvider>
      )}
    </DesktopOnlyGate>
  );
};

export default NotebookStudioPage;
