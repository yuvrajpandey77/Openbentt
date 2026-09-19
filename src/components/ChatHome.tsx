import React from "react";
import { FileText, FlaskConical, FolderKanban, Search, Sparkles, Hammer } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useLocalAI } from "@/context/LocalAIContext";
import { friendlyModelLabel } from "@/lib/ollama/selection";
import { Button } from "@/components/ui/button";

/**
 * Phase 9 — polished empty chat home. One concise value statement + real
 * suggestion actions that queue prompts into the live composer.
 * Uses effectiveModel (the actual active model) for display.
 */
const SUGGESTIONS = [
  { icon: FileText, label: "Summarize a document", prompt: "Help me summarize a document. What should I share with you to get started?" },
  { icon: Sparkles, label: "Analyze this idea", prompt: "I want to analyze an idea. Ask me what the idea is about." },
  { icon: FolderKanban, label: "Start a research project", prompt: "Help me start a new research project. Ask me about the topic and goals." },
  { icon: Search, label: "Search connected knowledge", prompt: "What connected knowledge sources are available, and how do I search them?" },
  { icon: Hammer, label: "Help me build something", prompt: "I want to build something. Ask me what I'm trying to create." },
  { icon: FlaskConical, label: "Compare local models", prompt: "What local models do I have available, and which one should I use?" },
];

export const ChatHome: React.FC = () => {
  const { queuePromptInComposer, createNewChat } = useChat();
  const { effectiveModel } = useLocalAI();

  const modelLabel = effectiveModel?.modelId
    ? `${friendlyModelLabel(effectiveModel.modelId)} · ${effectiveModel.location === "local" ? "Local" : "Cloud"}`
    : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/openbentt-logo.svg" alt="Openbentt" className="h-12 w-12 object-contain" />
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Work with your knowledge, models, and projects in one place.
        </h1>
        {modelLabel && (
          <p className="text-xs text-muted-foreground">
            {modelLabel}
          </p>
        )}
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2" role="list">
        {SUGGESTIONS.map((s) => (
          <Button
            key={s.label}
            variant="outline"
            role="listitem"
            className="h-auto items-start justify-start gap-2.5 whitespace-normal px-3.5 py-3 text-left"
            onClick={() => {
              createNewChat();
              queuePromptInComposer(s.prompt);
            }}
          >
            <s.icon size={16} className="mt-0.5 shrink-0 text-primary" />
            <span className="text-sm font-normal">{s.label}</span>
          </Button>
        ))}
      </div>
      <p className="text-center text-[11px] text-muted-foreground/70">
        Press <kbd className="rounded border border-border bg-muted px-1">Enter</kbd> to send ·{" "}
        <kbd className="rounded border border-border bg-muted px-1">Shift+Enter</kbd> for a new line
      </p>
    </div>
  );
};
