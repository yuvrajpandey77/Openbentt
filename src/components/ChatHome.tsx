import React from "react";
import { FileText, FolderKanban, Search, Sparkles } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useLocalAI } from "@/context/LocalAIContext";
import { friendlyModelLabel } from "@/lib/ollama/selection";
import { Button } from "@/components/ui/button";

/** Empty chat — short prompts only; no instructional clutter. */
const SUGGESTIONS = [
  { icon: FileText, label: "Summarize a document", prompt: "Help me summarize a document." },
  { icon: Sparkles, label: "Analyze an idea", prompt: "Help me analyze an idea." },
  { icon: FolderKanban, label: "Start a project", prompt: "Help me start a research project." },
  { icon: Search, label: "Search my library", prompt: "Search my connected knowledge and papers." },
];

export const ChatHome: React.FC = () => {
  const { queuePromptInComposer, createNewChat } = useChat();
  const { effectiveModel } = useLocalAI();

  const modelLabel = effectiveModel?.modelId
    ? friendlyModelLabel(effectiveModel.modelId)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <img src="/openbentt-logo.svg" alt="" className="h-10 w-10 object-contain opacity-90" />
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Openbentt</h1>
        {modelLabel && <p className="text-xs text-muted-foreground">{modelLabel}</p>}
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2" role="list">
        {SUGGESTIONS.map((s) => (
          <Button
            key={s.label}
            variant="outline"
            role="listitem"
            className="h-auto items-center justify-start gap-2.5 whitespace-normal px-3.5 py-3 text-left"
            onClick={() => {
              createNewChat();
              queuePromptInComposer(s.prompt);
            }}
          >
            <s.icon size={15} className="shrink-0 text-muted-foreground" />
            <span className="text-sm font-normal">{s.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
};
