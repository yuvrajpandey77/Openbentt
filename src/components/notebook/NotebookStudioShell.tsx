import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useResearchWorkspace } from "@/context/ResearchWorkspaceContext";
import { editorFileLabel, useNotebookStudio } from "@/context/NotebookStudioContext";
import { ResearchCommandPalette } from "@/components/research/ResearchCommandPalette";
import { ResearchTaskStatus } from "@/components/research/ResearchTaskStatus";
import { ResearchWritingSync } from "@/components/research/ResearchWritingSync";
import { NotebookLeftRail } from "@/components/notebook/NotebookLeftRail";
import { NotebookFloatingChat } from "@/components/notebook/NotebookFloatingChat";
import { NotebookConnectionCables } from "@/components/notebook/NotebookConnectionCables";
import { NotebookEditorTabs } from "@/components/notebook/NotebookEditorTabs";
import NotebookPdfWorkspace from "@/components/NotebookPdfWorkspace";
import { NotebookContextualStrip } from "@/components/research/NotebookContextualStrip";
import { NotebookViewerProvider } from "@/context/NotebookViewerContext";
import { cn } from "@/lib/utils";
import { ChevronDown, Command, FolderOpen, LayoutGrid } from "lucide-react";

export function NotebookStudioShell() {
  const { project, draftSaveStatus, setDraftTex, setBibliography, updateProjectFileContent } =
    useResearchProject();
  const { openCommandPalette } = useResearchWorkspace();
  const { fileNav, activeEditorFile } = useNotebookStudio();
  const studioMainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        fileNav?.next();
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        fileNav?.prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fileNav]);

  const editorContent = useMemo(() => {
    if (!project) return "";
    if (activeEditorFile.type === "bib") return project.bibliography;
    if (activeEditorFile.type === "projectFile") {
      return project.projectFiles?.find((f) => f.id === activeEditorFile.fileId)?.content ?? "";
    }
    return project.draftTex;
  }, [activeEditorFile, project]);

  const onProjectDraftChange = useCallback(
    (tex: string) => {
      if (activeEditorFile.type === "bib") setBibliography(tex);
      else if (activeEditorFile.type === "projectFile") updateProjectFileContent(activeEditorFile.fileId, tex);
      else setDraftTex(tex);
    },
    [activeEditorFile, setBibliography, setDraftTex, updateProjectFileContent]
  );

  if (!project) return null;

  const saveLabel =
    draftSaveStatus === "saving"
      ? "Saving…"
      : draftSaveStatus === "dirty"
        ? "Unsaved"
        : draftSaveStatus === "saved"
          ? "Saved"
          : null;

  const editorLabel = editorFileLabel(activeEditorFile, project);

  return (
    <NotebookViewerProvider>
      <div className="flex h-full min-h-0 flex-col bg-background" data-notebook-studio>
        <ResearchWritingSync />
        <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/95 px-3 py-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" asChild>
            <Link to="/projects">
              <FolderOpen className="h-3.5 w-3.5" />
              Projects
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 max-w-[200px] gap-1 truncate font-medium">
                {project.title}
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem asChild>
                <Link to="/projects">All projects…</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/chat">Open full chat</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {saveLabel && (
            <span
              className={cn(
                "hidden text-[10px] tabular-nums sm:inline",
                draftSaveStatus === "dirty" && "text-amber-600 dark:text-amber-400",
                draftSaveStatus === "error" && "text-destructive",
                draftSaveStatus === "saved" && "text-muted-foreground"
              )}
            >
              {saveLabel}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <ResearchTaskStatus />
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={openCommandPalette}>
              <Command className="h-3 w-3" />
              <span className="hidden sm:inline">Commands</span>
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Workspace presets">
              <LayoutGrid className="h-3.5 w-3.5" onClick={openCommandPalette} />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <NotebookLeftRail />
          <div ref={studioMainRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <NotebookContextualStrip />
            <NotebookEditorTabs />
            <div className="min-h-0 flex-1 overflow-hidden">
              <NotebookPdfWorkspace
                layoutMode="studio"
                chromeMode="studio"
                editorFileLabel={editorLabel}
                projectDraftTex={editorContent}
                onProjectDraftChange={onProjectDraftChange}
              />
            </div>
            <NotebookConnectionCables containerRef={studioMainRef} />
            <NotebookFloatingChat containerRef={studioMainRef} />
          </div>
        </div>
        <ResearchCommandPalette />
      </div>
    </NotebookViewerProvider>
  );
}
