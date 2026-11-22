import React, { useEffect, useState } from "react";
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
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    document.title = project ? `${project.title} — Openbentt` : "Notebook — Openbentt";
  }, [project?.title]);

  useEffect(() => {
    if (!loading && project) {
      // Short paint gate only — long artificial delay made Notebook feel frozen.
      const t = window.setTimeout(() => setEntering(false), 50);
      return () => window.clearTimeout(t);
    }
    setEntering(true);
  }, [loading, project?.id]);

  // Free BusyTeX WASM + MiniLM when leaving Notebook — major RAM reclaim.
  useEffect(() => {
    return () => {
      void import("@/lib/latexWasmCompile").then((m) => m.terminateLatexWasmRunner()).catch(() => {});
      void import("@/lib/research/embedCore.mjs").then((m) => m.disposeEmbedder()).catch(() => {});
    };
  }, []);

  return (
    <DesktopOnlyGate>
      {loading || entering || !project ? (
        <ProjectLoadingScreen
          title={project ? `Opening ${project.title}` : "Loading project"}
          subtitle="Loading files, draft, and workspace…"
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
