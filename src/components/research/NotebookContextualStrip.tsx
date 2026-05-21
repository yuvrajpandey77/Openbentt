import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useQueueResearchPrompt } from "@/hooks/useQueueResearchPrompt";
import { abstractGenerationPrompt, keywordsPrompt } from "@/lib/research/writingPrompts";
import { insertAbstract, insertKeywords } from "@/lib/research/latexTools";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type NotebookWritingAssistMenuProps = {
  /** Toolbar button sizing — studio/compact use sm, full uses icon+label. */
  size?: "sm" | "icon";
  className?: string;
};

/** Writing assist actions — dropdown for editor toolbars (not header strip). */
export function NotebookWritingAssistMenu({ size = "sm", className }: NotebookWritingAssistMenuProps) {
  const { project, setDraftTex } = useResearchProject();
  const { queueResearchPrompt, researchPromptBusy } = useQueueResearchPrompt();

  if (!project) return null;

  const sample = project.draftTex.slice(0, 8000);
  const hasAbstracts = project.abstractVariants.length > 0;
  const hasKeywords = project.keywordSuggestions.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size={size === "icon" ? "icon" : "sm"}
          variant="ghost"
          className={cn(
            size === "icon" ? "h-9 w-9 shrink-0" : "h-8 gap-1 text-xs",
            className
          )}
          disabled={researchPromptBusy}
          aria-label="Writing assist"
        >
          <Sparkles className={size === "icon" ? "h-4 w-4" : "h-3 w-3"} />
          {size !== "icon" && (
            <>
              Writing
              <ChevronDown className="h-3 w-3 opacity-60" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Queue prompts in chat
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={researchPromptBusy}
          onClick={() =>
            void queueResearchPrompt(
              abstractGenerationPrompt(sample, project.targetVenue),
              "drafting",
              sample
            )
          }
        >
          Generate abstract
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={researchPromptBusy}
          onClick={() => void queueResearchPrompt(keywordsPrompt(sample), "drafting", sample)}
        >
          Suggest keywords
        </DropdownMenuItem>
        {hasAbstracts && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Apply abstract variant</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {project.abstractVariants.map((a, i) => (
                <DropdownMenuItem key={i} onClick={() => void setDraftTex(insertAbstract(project.draftTex, a))}>
                  Abstract #{i + 1}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {hasKeywords && (
          <DropdownMenuItem
            onClick={() => void setDraftTex(insertKeywords(project.draftTex, project.keywordSuggestions))}
          >
            Insert keywords into preamble
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="max-w-[12rem] text-[10px] font-normal leading-snug text-muted-foreground">
          Outline → skeleton and captions live in chat — ask with fenced LaTeX, then review in the diff panel.
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
