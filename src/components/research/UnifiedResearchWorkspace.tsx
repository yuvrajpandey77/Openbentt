import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { WorkspaceChrome } from "@/components/research/WorkspaceChrome";
import { ResearchCommandPalette } from "@/components/research/ResearchCommandPalette";
import { NotebookContextualStrip } from "@/components/research/NotebookContextualStrip";
import { ResearchSidePanel } from "@/components/research/ResearchSidePanel";
import { ResearchWritingSync } from "@/components/research/ResearchWritingSync";
import { ResearchTaskStatus } from "@/components/research/ResearchTaskStatus";
import NotebookPdfWorkspace from "@/components/NotebookPdfWorkspace";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useResearchWorkspace } from "@/context/ResearchWorkspaceContext";
import { useResearchKeyboard } from "@/hooks/useResearchKeyboard";
import type { ResearchPanelId } from "@/lib/research/workspaceLayout";
import { PANEL_LABELS } from "@/lib/research/workspaceLayout";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

function SidePanelContent({ id }: { id: ResearchPanelId }) {
  return <ResearchSidePanel id={id} />;
}

function SidePanelRail() {
  const { layout, setActiveSidePanel, moveSidePanel } = useResearchWorkspace();
  const active = layout.activeSidePanel;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-2 py-1.5">
        <span className="text-xs font-medium">{PANEL_LABELS[active]}</span>
        <div className="flex gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            aria-label="Move panel up"
            onClick={() => moveSidePanel(active, "up")}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            aria-label="Move panel down"
            onClick={() => moveSidePanel(active, "down")}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <GripVertical className="h-3 w-3 text-muted-foreground/50" aria-hidden />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel" id={`panel-${active}`}>
        <SidePanelContent id={active} />
      </div>
    </div>
  );
}

export function UnifiedResearchWorkspace() {
  const { project, setDraftTex } = useResearchProject();
  const { layout, setSidePanelSize } = useResearchWorkspace();
  useResearchKeyboard();

  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground" role="status">
        Loading research project…
      </div>
    );
  }

  const showSide = layout.mode !== "distraction-free" && layout.mode !== "focus";

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      data-research-workspace
      data-mode={layout.mode}
    >
      <ResearchWritingSync />
      <WorkspaceChrome />
      <ResearchTaskStatus />
      <ResearchCommandPalette />
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="openbentt-unified-research-h"
        className="min-h-0 flex-1"
      >
        {showSide && (
          <>
            <ResizablePanel
              defaultSize={layout.sidePanelSize}
              minSize={18}
              maxSize={48}
              className="min-h-0 min-w-0"
              onResize={(size) => setSidePanelSize(size)}
            >
              <aside className="flex h-full min-h-0 flex-col border-r border-border/60 bg-muted/10">
                <SidePanelRail />
              </aside>
            </ResizablePanel>
            <ResizableHandle withHandle className="w-px bg-border/60" />
          </>
        )}
        <ResizablePanel defaultSize={showSide ? 100 - layout.sidePanelSize : 100} minSize={40} className="min-h-0 min-w-0">
          <main
            className={cn("flex h-full min-h-0 flex-col", layout.mode === "focus" && "ring-1 ring-primary/20")}
            aria-label="Document editor"
          >
            <NotebookContextualStrip />
            <div className="min-h-0 flex-1">
              <NotebookPdfWorkspace
                compactChrome={layout.mode !== "default"}
                projectDraftTex={project.draftTex}
                onProjectDraftChange={(tex) => void setDraftTex(tex)}
              />
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
