import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Sparkles, Save } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useChat } from "@/context/ChatContext";
import { streamRoutedTask } from "@/lib/modelRouting";
import { useToast } from "@/components/ui/use-toast";

const PLACEHOLDER = `Key insights, open questions, running hypotheses…

This is your project's persistent knowledge context. It travels with every AI request in this project, giving the model continuity across sessions.

Tips:
• Summarize what you've learned from each paper
• Track unresolved questions and conflicting findings
• Note your evolving thesis and supporting evidence`;

/**
 * Persistent knowledge context panel — stored in SQLite (desktop) / localStorage (web).
 * Injected into every notebook chat as background context for the active project.
 */
export function KnowledgePanel() {
  const { project, updateKnowledge } = useResearchProject();
  const { apiConfig } = useChat();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!project) return;
    setDraft(project.knowledge ?? "");
    setDirty(false);
  }, [project?.id, project?.knowledge]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const save = useCallback(
    async (content: string) => {
      if (!project) return;
      setSaving(true);
      try {
        await updateKnowledge(content);
        setDirty(false);
      } finally {
        setSaving(false);
      }
    },
    [project, updateKnowledge]
  );

  const handleChange = (value: string) => {
    setDraft(value);
    setDirty(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(value), 1200);
  };

  const handleAutoSummarize = async () => {
    if (!project || summarizing) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setSummarizing(true);
    try {
      const paperTitles = project.papers
        .map((p) => p.metadata.title ?? p.fileName)
        .slice(0, 12)
        .join("\n• ");
      const draftExcerpt = project.draftTex.slice(0, 2000);
      const prompt = `You are a research assistant. Write a concise but comprehensive knowledge context (max 500 words) for the following research project. Cover: key findings from the literature, open questions, evolving thesis, and any contradictions or gaps.

Project: "${project.title}"
Papers in library:
• ${paperTitles || "(none yet)"}

Draft excerpt:
${draftExcerpt || "(no draft yet)"}

Current context to extend (don't discard existing insights):
${draft.slice(0, 1500) || "(empty — write fresh)"}

Write the updated knowledge context now:`;

      let result = "";
      await streamRoutedTask(
        "chat_synthesis",
        apiConfig,
        [{ role: "user", content: prompt }],
        abortRef.current.signal,
        {
          onToken: (t) => {
            result += t;
            setDraft(result);
          },
        }
      );
      const trimmed = result.trim();
      if (trimmed) {
        setDraft(trimmed);
        setDirty(false);
        await save(trimmed);
        toast({ title: "Knowledge updated", description: "AI summarized your project context." });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast({
        title: "AI summary failed",
        description: err instanceof Error ? err.message : "Check your API key and try again.",
        variant: "destructive",
      });
    } finally {
      setSummarizing(false);
    }
  };

  if (!project) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Brain className="h-3.5 w-3.5" />
          Knowledge context
        </div>
        <div className="flex items-center gap-1">
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => save(draft)}
              disabled={saving}
            >
              <Save className="h-3 w-3" />
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-xs"
            onClick={handleAutoSummarize}
            disabled={summarizing}
          >
            <Sparkles className="h-3 w-3" />
            {summarizing ? "Updating…" : "AI update"}
          </Button>
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Injected as background context in every chat for this project. Auto-saves as you type.
      </p>
      <Textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => dirty && save(draft)}
        className="min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed"
        placeholder={PLACEHOLDER}
        spellCheck
      />
    </div>
  );
}
