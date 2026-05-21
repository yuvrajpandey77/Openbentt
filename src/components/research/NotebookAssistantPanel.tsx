import { Button } from "@/components/ui/button";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useQueueResearchPrompt } from "@/hooks/useQueueResearchPrompt";
import {
  abstractGenerationPrompt,
  captionPrompt,
  keywordsPrompt,
  missingCitationPrompt,
} from "@/lib/research/writingPrompts";
import { applyCaption, insertAbstract, insertKeywords, listLatexFloats } from "@/lib/research/latexTools";
import { Sparkles } from "lucide-react";

const SLASH_ACTIONS = [
  { slash: "/abstract", label: "Generate abstract" },
  { slash: "/keywords", label: "Suggest keywords" },
  { slash: "/cite", label: "Fix missing citations" },
] as const;

export function NotebookAssistantPanel() {
  const { project, setDraftTex } = useResearchProject();
  const { queueResearchPrompt, researchPromptBusy } = useQueueResearchPrompt();

  if (!project) return null;

  const sample = project.draftTex.slice(0, 8000);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-sm font-medium">Contextual AI</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Actions queue prompts in chat — use the workspace split to keep editor visible. Type slash commands in the
        composer: <code className="font-mono text-[10px]">/abstract</code>,{" "}
        <code className="font-mono text-[10px]">/keywords</code>.
      </p>
      <ul className="space-y-1.5">
        {SLASH_ACTIONS.map((a) => (
          <li key={a.slash}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-auto w-full justify-start py-2 text-left text-xs"
              disabled={researchPromptBusy}
              onClick={() => {
                if (a.slash === "/cite") {
                  void queueResearchPrompt(
                    missingCitationPrompt(project.draftTex, project.bibliography),
                    "citations",
                    project.draftTex
                  );
                } else if (a.slash === "/abstract") {
                  void queueResearchPrompt(
                    abstractGenerationPrompt(sample, project.targetVenue),
                    "drafting",
                    sample
                  );
                } else {
                  void queueResearchPrompt(keywordsPrompt(sample), "drafting", sample);
                }
              }}
            >
              <span className="font-mono text-[10px] text-primary">{a.slash}</span>
              <span className="ml-2">{a.label}</span>
            </Button>
          </li>
        ))}
      </ul>

      {project.abstractVariants.length > 0 && (
        <div className="space-y-1.5 border-t border-border/50 pt-3">
          <p className="text-xs font-medium text-foreground">Saved abstract variants</p>
          {project.abstractVariants.map((a, i) => (
            <Button
              key={i}
              type="button"
              size="sm"
              variant="ghost"
              className="h-auto w-full justify-start text-xs"
              onClick={() => void setDraftTex(insertAbstract(project.draftTex, a))}
            >
              Apply abstract #{i + 1}
            </Button>
          ))}
        </div>
      )}

      {project.keywordSuggestions.length > 0 && (
        <div className="space-y-1.5 border-t border-border/50 pt-3">
          <p className="text-xs font-medium text-foreground">Keyword suggestions</p>
          <p className="text-[10px] text-muted-foreground">{project.keywordSuggestions.join(", ")}</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto w-full justify-start text-xs"
            onClick={() => void setDraftTex(insertKeywords(project.draftTex, project.keywordSuggestions))}
          >
            Insert keywords into preamble
          </Button>
        </div>
      )}

      {listLatexFloats(project.draftTex).length > 0 && (
        <div className="space-y-1.5 border-t border-border/50 pt-3">
          <p className="text-xs font-medium text-foreground">Figure / table captions</p>
          {listLatexFloats(project.draftTex).map((f) => (
            <Button
              key={f.label}
              type="button"
              size="sm"
              variant="outline"
              className="h-auto w-full justify-start text-xs"
              onClick={() =>
                void queueResearchPrompt(
                  captionPrompt(f.kind, f.label, project.draftTex.slice(0, 3000)),
                  "drafting",
                  project.draftTex
                )
              }
            >
              AI caption — {f.label}
            </Button>
          ))}
          {project.captionSuggestions.map((c) => (
            <Button
              key={`${c.label}-${c.caption.slice(0, 20)}`}
              type="button"
              size="sm"
              variant="ghost"
              className="h-auto w-full justify-start text-xs"
              onClick={() => void setDraftTex(applyCaption(project.draftTex, c.label, c.caption))}
            >
              Apply caption → {c.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
