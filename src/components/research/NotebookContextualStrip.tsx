import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useChat } from "@/context/ChatContext";
import { useResearchWorkspace } from "@/context/ResearchWorkspaceContext";
import { abstractGenerationPrompt, keywordsPrompt } from "@/lib/research/writingPrompts";
import { insertAbstract } from "@/lib/research/latexTools";
import { ChevronDown, MoreHorizontal, Sparkles } from "lucide-react";
import { useState } from "react";

/** Compact writing assist — primary actions visible, rest in overflow menu. */
export function NotebookContextualStrip() {
  const { project, setDraftTex } = useResearchProject();
  const { queuePromptInComposer } = useChat();
  const { layout } = useResearchWorkspace();
  const [expanded, setExpanded] = useState(false);

  if (!project || layout.mode === "distraction-free") return null;

  const sample = project.draftTex.slice(0, 8000);
  const hasAbstracts = project.abstractVariants.length > 0;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/50 bg-muted/15 px-2 py-1.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 gap-1 text-xs"
        onClick={() => queuePromptInComposer(abstractGenerationPrompt(sample, project.targetVenue))}
      >
        <Sparkles className="h-3 w-3" />
        Abstract
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 text-xs"
        onClick={() => queuePromptInComposer(keywordsPrompt(sample))}
      >
        Keywords
      </Button>
      {hasAbstracts && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-0.5 text-xs">
              Apply variant
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {project.abstractVariants.map((a, i) => (
              <DropdownMenuItem key={i} onClick={() => void setDraftTex(insertAbstract(project.draftTex, a))}>
                Abstract #{i + 1}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 text-xs text-muted-foreground"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
        {expanded ? "Less" : "More"}
      </Button>
      {expanded && (
        <span className="w-full text-[10px] text-muted-foreground">
          Outline → skeleton and captions live in chat — ask with fenced LaTeX, then review in the diff panel.
        </span>
      )}
    </div>
  );
}
