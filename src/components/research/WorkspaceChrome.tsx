import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectBar } from "@/components/research/ProjectBar";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useResearchWorkspace } from "@/context/ResearchWorkspaceContext";
import type { ResearchPanelId } from "@/lib/research/workspaceLayout";
import { PANEL_LABELS, WORKSPACE_PRESETS, type WorkspacePresetId } from "@/lib/research/workspaceLayout";
import { cn } from "@/lib/utils";
import {
  Command,
  Eye,
  EyeOff,
  Focus,
  LayoutGrid,
  PanelLeft,
} from "lucide-react";

const PRESET_IDS = Object.keys(WORKSPACE_PRESETS) as Exclude<WorkspacePresetId, "custom">[];

export function WorkspaceChrome() {
  const {
    layout,
    cycleMode,
    setMode,
    applyWorkspacePreset,
    setActiveSidePanel,
    openCommandPalette,
    canUndo,
    canRedo,
    undoDraft,
    redoDraft,
    sectionHeadings,
    requestFocusSection,
  } = useResearchWorkspace();
  const { draftSaveStatus } = useResearchProject();

  const hidden = layout.mode === "distraction-free";

  if (hidden) {
    return (
      <div className="absolute left-2 top-2 z-20 flex gap-1">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-8 w-8 opacity-80 hover:opacity-100"
          onClick={cycleMode}
          aria-label="Exit distraction-free mode"
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const saveLabel =
    draftSaveStatus === "saving"
      ? "Saving…"
      : draftSaveStatus === "dirty"
        ? "Unsaved"
        : draftSaveStatus === "error"
          ? "Save failed"
          : draftSaveStatus === "saved"
            ? "Saved"
            : null;

  return (
    <header className="flex shrink-0 flex-col border-b border-border/60 bg-card/95">
      <ProjectBar />
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 px-2 py-1.5",
          layout.mode === "focus" && "py-1"
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="secondary" className="h-7 gap-1 text-xs">
                <PanelLeft className="h-3 w-3" />
                {PANEL_LABELS[layout.activeSidePanel]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              {layout.sidePanelOrder.map((id) => (
                <DropdownMenuItem key={id} onClick={() => setActiveSidePanel(id as ResearchPanelId)}>
                  {PANEL_LABELS[id]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled className="text-[10px] text-muted-foreground">
                More tools in the sidebar → Research
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1">
          {saveLabel && (
            <span
              className={cn(
                "hidden text-[10px] tabular-nums sm:inline",
                draftSaveStatus === "dirty" && "text-amber-600 dark:text-amber-400",
                draftSaveStatus === "saving" && "text-muted-foreground",
                draftSaveStatus === "saved" && "text-muted-foreground",
                draftSaveStatus === "error" && "text-destructive"
              )}
              aria-live="polite"
            >
              {saveLabel}
            </span>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canUndo}
            onClick={() => {
              const tex = undoDraft();
              if (tex != null) window.dispatchEvent(new CustomEvent("openbentt-draft-undo", { detail: tex }));
            }}
            aria-label="Undo"
          >
            <span className="text-xs font-medium">↶</span>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canRedo}
            onClick={() => {
              const tex = redoDraft();
              if (tex != null) window.dispatchEvent(new CustomEvent("openbentt-draft-redo", { detail: tex }));
            }}
            aria-label="Redo"
          >
            <span className="text-xs font-medium">↷</span>
          </Button>
          {sectionHeadings.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs">
                  Sections
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                {sectionHeadings.map((h) => (
                  <DropdownMenuItem key={h.line} onClick={() => requestFocusSection(h.line)}>
                    {h.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs">
                <LayoutGrid className="h-3 w-3" />
                Preset
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={layout.preset}
                onValueChange={(v) => applyWorkspacePreset(v as Exclude<WorkspacePresetId, "custom">)}
              >
                {PRESET_IDS.map((id) => (
                  <DropdownMenuRadioItem key={id} value={id}>
                    {WORKSPACE_PRESETS[id].label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={cycleMode}
            aria-label={`Workspace mode: ${layout.mode}`}
            title={layout.mode === "default" ? "Focus mode" : layout.mode === "focus" ? "Distraction-free" : "Default layout"}
          >
            {layout.mode === "focus" ? <Focus className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 gap-1 text-xs"
            onClick={openCommandPalette}
          >
            <Command className="h-3 w-3" />
            <span className="hidden sm:inline">Commands</span>
            <kbd className="hidden rounded border px-1 font-mono text-[9px] opacity-70 md:inline">⌘K</kbd>
          </Button>
          {layout.mode === "focus" && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Show side panel"
              onClick={() => setMode("default")}
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
