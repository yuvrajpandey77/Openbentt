import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useChat } from "@/context/ChatContext";
import { useQueueResearchPrompt } from "@/hooks/useQueueResearchPrompt";
import {
  abstractGenerationPrompt,
  captionPrompt,
  keywordsPrompt,
  outlineExpansionPrompt,
} from "@/lib/research/writingPrompts";
import {
  applyCaption,
  insertAbstract,
  insertKeywords,
  listLatexFloats,
  parseOutline,
  outlineToLatexSkeleton,
} from "@/lib/research/latexTools";
import { buildAssistantPlainText } from "@/lib/assistantPlainText";
import {
  parseAbstractVariants,
  parseCaptionSuggestions,
  parseKeywordSuggestions,
} from "@/lib/research/parseWritingAssist";
import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";

export function NotebookWritingPanel() {
  const { project, updateProject, setDraftTex } = useResearchProject();
  const { chats, currentChatId } = useChat();
  const { queueResearchPrompt, researchPromptBusy } = useQueueResearchPrompt();
  const { toast } = useToast();
  const [outlineRaw, setOutlineRaw] = useState("");

  if (!project) return null;

  const sample = project.draftTex.slice(0, 8000);

  const importFromLastReply = () => {
    const chat = chats.find((c) => c.id === currentChatId);
    const last = [...(chat?.messages ?? [])].reverse().find((m) => m.role === "assistant");
    if (!last) {
      toast({ title: "No assistant reply", variant: "destructive" });
      return;
    }
    const plain = buildAssistantPlainText(last);
    const labels = listLatexFloats(project.draftTex).map((f) => f.label);
    const abstracts = parseAbstractVariants(plain);
    const keywords = parseKeywordSuggestions(plain);
    const captions = parseCaptionSuggestions(plain, labels);
    if (!abstracts.length && !keywords.length && !captions.length) {
      toast({
        title: "Nothing to import",
        description: "Ask for “Abstract 1/2/3”, “Keywords:”, or “Caption for label:” replies first.",
        variant: "destructive",
      });
      return;
    }
    void updateProject({
      ...(abstracts.length ? { abstractVariants: abstracts } : {}),
      ...(keywords.length ? { keywordSuggestions: keywords } : {}),
      ...(captions.length ? { captionSuggestions: captions } : {}),
    });
    toast({ title: "Imported", description: "Variants updated from last reply." });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-b border-border/60 p-3 md:flex-row md:overflow-x-auto">
      <div className="flex min-w-[200px] flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meridian 0.1 prompts</p>
        <p className="text-[10px] text-muted-foreground leading-snug">
          Sends structured prompts to your chat model — not a separate model download.
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={researchPromptBusy}
          onClick={() =>
            void queueResearchPrompt(
              abstractGenerationPrompt(sample, project.targetVenue),
              "drafting",
              sample
            )
          }
        >
          Generate abstracts (chat)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={researchPromptBusy}
          onClick={() => void queueResearchPrompt(keywordsPrompt(sample), "drafting", sample)}
        >
          Suggest keywords (chat)
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-xs" onClick={importFromLastReply}>
          Import from last reply
        </Button>
        {project.abstractVariants.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {project.abstractVariants.length} abstract(s) saved — auto-import when chat replies match.
          </p>
        )}
        {project.abstractVariants.map((a, i) => (
          <Button
            key={i}
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto justify-start text-left text-xs"
            onClick={() => void setDraftTex(insertAbstract(project.draftTex, a))}
          >
            Apply abstract #{i + 1}
          </Button>
        ))}
        {project.keywordSuggestions.length > 0 && (
          <>
            <p className="text-[10px] text-muted-foreground mt-1">Keywords: {project.keywordSuggestions.join(", ")}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => void setDraftTex(insertKeywords(project.draftTex, project.keywordSuggestions))}
            >
              Insert keywords into preamble
            </Button>
          </>
        )}
      </div>

      <div className="flex min-w-[200px] flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outline → draft</p>
        <Textarea
          className="min-h-[80px] text-xs"
          placeholder="# Introduction&#10;- hypothesis&#10;# Methods"
          value={outlineRaw}
          onChange={(e) => setOutlineRaw(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => {
            const sections = parseOutline(outlineRaw);
            const tex = outlineToLatexSkeleton(sections, project.draftTex.split("\\begin{document}")[0]);
            void setDraftTex(tex);
          }}
        >
          Build LaTeX skeleton
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const sections = parseOutline(outlineRaw);
            const sec = sections[0];
            if (!sec) return;
            void queueResearchPrompt(
              outlineExpansionPrompt(sec.title, sec.body || outlineRaw, project.draftTex),
              "drafting",
              sec.body || outlineRaw
            );
          }}
        >
          Expand first section (chat)
        </Button>
      </div>

      <div className="flex min-w-[200px] flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Captions</p>
        {listLatexFloats(project.draftTex).map((f) => (
          <div key={f.label || f.kind} className="flex flex-wrap gap-1">
            <span className="text-xs text-muted-foreground truncate">{f.label || f.kind}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() =>
                void queueResearchPrompt(
                  captionPrompt(f.kind, f.label || f.kind, project.draftTex.slice(0, 3000)),
                  "drafting",
                  project.draftTex
                )
              }
            >
              AI caption
            </Button>
          </div>
        ))}
        {project.captionSuggestions.map((c) => (
          <Button
            key={`${c.label}-${c.caption.slice(0, 24)}`}
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto justify-start text-left text-xs"
            onClick={() =>
              void setDraftTex(applyCaption(project.draftTex, c.label, c.caption))
            }
          >
            Apply caption → {c.label}
          </Button>
        ))}
        {listLatexFloats(project.draftTex).length === 0 && (
          <p className="text-xs text-muted-foreground">Add figure/table environments in Source.</p>
        )}
      </div>
    </div>
  );
}
