import { ResearchWorkspaceProvider } from "@/context/ResearchWorkspaceContext";
import { UnifiedResearchWorkspace } from "@/components/research/UnifiedResearchWorkspace";
import { NotebookUrlPanelSync } from "@/components/research/NotebookUrlPanelSync";

export function ResearchNotebookShell() {
  return (
    <ResearchWorkspaceProvider>
      <NotebookUrlPanelSync />
      <UnifiedResearchWorkspace />
    </ResearchWorkspaceProvider>
  );
}
