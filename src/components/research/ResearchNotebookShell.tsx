import { ResearchWorkspaceProvider } from "@/context/ResearchWorkspaceContext";
import { UnifiedResearchWorkspace } from "@/components/research/UnifiedResearchWorkspace";

export function ResearchNotebookShell() {
  return (
    <ResearchWorkspaceProvider>
      <UnifiedResearchWorkspace />
    </ResearchWorkspaceProvider>
  );
}
