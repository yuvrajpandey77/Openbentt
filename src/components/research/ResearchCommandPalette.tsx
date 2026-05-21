import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useResearchWorkspace } from "@/context/ResearchWorkspaceContext";
import { useQueueResearchPrompt } from "@/hooks/useQueueResearchPrompt";
import { abstractGenerationPrompt } from "@/lib/research/writingPrompts";
import { buildCrossPaperSynthesis } from "@/lib/research/synthesis";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { useCallback } from "react";

export function ResearchCommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    notebookActions,
    openResearchToolPanel,
    applyWorkspacePreset,
    requestZoteroPanel,
  } = useResearchWorkspace();
  const { project, selectProject, projects, rebuildSemanticIndex } = useResearchProject();
  const { queueResearchPrompt } = useQueueResearchPrompt();
  const { toast } = useToast();
  const navigate = useNavigate();

  const run = useCallback(
    (fn: () => void) => {
      setCommandPaletteOpen(false);
      fn();
    },
    [setCommandPaletteOpen]
  );

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="Search commands…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>
        <CommandGroup heading="Research">
          <CommandItem
            onSelect={() =>
              run(() => {
                openResearchToolPanel("papers");
                notebookActions.openPaperPicker?.();
              })
            }
          >
            Search papers
            <CommandShortcut>{isMac ? "⌘" : "Ctrl+"}P</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => {
                openResearchToolPanel("citations");
                const key = project?.bibEntries[0]?.key;
                notebookActions.insertCitation?.(key);
              })
            }
          >
            Insert citation
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => {
                if (!project) return;
                void queueResearchPrompt(
                  abstractGenerationPrompt(project.draftTex.slice(0, 8000), project.targetVenue),
                  "drafting",
                  project.draftTex
                ).then(() =>
                  toast({ title: "Abstract prompt queued", description: "Check the chat composer." })
                );
              })
            }
          >
            Generate abstract
          </CommandItem>
          <CommandItem onSelect={() => run(() => notebookActions.openPdf?.())}>Open paper (PDF)</CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => {
                rebuildSemanticIndex();
                toast({ title: "Building embedding index (MiniLM)…" });
              })
            }
          >
            Build index
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => {
                openResearchToolPanel("revisions");
                notebookActions.compareDrafts?.();
              })
            }
          >
            Compare drafts
          </CommandItem>
          <CommandItem onSelect={() => run(() => void notebookActions.compilePdf?.())}>
            Compile PDF
            <CommandShortcut>{isMac ? "⌘" : "Ctrl+"}↵</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => requestZoteroPanel())}>Open Zotero collection</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Projects">
          {projects.map((p) => (
            <CommandItem key={p.id} onSelect={() => run(() => void selectProject(p.id))}>
              Switch project: {p.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Theme report & layout">
          <CommandItem
            onSelect={() =>
              run(() => {
                if (!project?.papers.length) {
                  toast({ title: "No papers", description: "Upload PDFs in Papers panel first.", variant: "destructive" });
                  return;
                }
                const report = buildCrossPaperSynthesis(project.papers);
                openResearchToolPanel("search");
                toast({ title: "Theme report ready", description: `${report.themes.length} themes (local heuristics).` });
              })
            }
          >
            Run theme report
          </CommandItem>
          <CommandItem onSelect={() => run(() => applyWorkspacePreset("thesis-writing"))}>Preset: Thesis writing</CommandItem>
          <CommandItem onSelect={() => run(() => applyWorkspacePreset("literature-review"))}>Preset: Literature review</CommandItem>
          <CommandItem onSelect={() => run(() => applyWorkspacePreset("revision-pass"))}>Preset: Revision pass</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="View">
          <CommandItem onSelect={() => run(() => openResearchToolPanel("search"))}>Library search panel</CommandItem>
          <CommandItem onSelect={() => run(() => openResearchToolPanel("revisions"))}>Revisions panel</CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/labs"))}>Open library workspace</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
