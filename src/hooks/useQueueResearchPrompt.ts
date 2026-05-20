import { useCallback, useState } from "react";
import { useChat } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import {
  buildAugmentedResearchPrompt,
  type ResearchAiTask,
} from "@/lib/ai/researchOrchestrator";
import { useToast } from "@/components/ui/use-toast";

/** Queue a notebook writing prompt with hybrid corpus retrieval (no full vectors in React state). */
export function useQueueResearchPrompt() {
  const { project } = useResearchProject();
  const { queuePromptInComposer } = useChat();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const queueResearchPrompt = useCallback(
    async (basePrompt: string, task: ResearchAiTask, queryText?: string) => {
      if (!project) {
        toast({ title: "No research project", variant: "destructive" });
        return;
      }
      setBusy(true);
      try {
        const text = await buildAugmentedResearchPrompt(project, task, basePrompt, queryText);
        queuePromptInComposer(text);
      } catch (e) {
        console.error(e);
        toast({
          title: "Library context unavailable",
          description: e instanceof Error ? e.message : "Using prompt without retrieval.",
        });
        queuePromptInComposer(basePrompt);
      } finally {
        setBusy(false);
      }
    },
    [project, queuePromptInComposer, toast]
  );

  return { queueResearchPrompt, researchPromptBusy: busy };
}
