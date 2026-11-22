import React, { useState } from "react";
import { FileText, FolderKanban, Search, Sparkles } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useLocalAI } from "@/context/LocalAIContext";
import { friendlyModelLabel } from "@/lib/ollama/selection";
import { Button } from "@/components/ui/button";
import { ChatProviderPicker, needsChatProviderChoice } from "@/components/ChatProviderPicker";
import { clearChatProviderChoice, loadChatProviderChoice } from "@/lib/agent/chatProviderChoice";
import { isDesktopApp } from "@/lib/isDesktopApp";

/** Empty chat — short prompts only; no instructional clutter. */
const SUGGESTIONS = [
  { icon: FileText, label: "Summarize a document", prompt: "Help me summarize a document." },
  { icon: Sparkles, label: "Analyze an idea", prompt: "Help me analyze an idea." },
  { icon: FolderKanban, label: "Start a project", prompt: "Help me start a research project." },
  { icon: Search, label: "Search my library", prompt: "Search my connected knowledge and papers." },
];

/** Welcome section content for the empty chat state. */
const WELCOME_HEADING = "Ready when you are.";
const WELCOME_SUBTEXT = "General AI questions outside a project.";

export const ChatHome: React.FC = () => {
  const { queuePromptInComposer, createNewChat } = useChat();
  const { effectiveModel } = useLocalAI();
  const [version, setVersion] = useState(0);
  const choice = loadChatProviderChoice();
  const showPicker = isDesktopApp() && (!choice || version < 0);

  const modelLabel = effectiveModel?.modelId
    ? friendlyModelLabel(effectiveModel.modelId)
    : null;

  if (showPicker || (isDesktopApp() && needsChatProviderChoice())) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
        <img src="/openbentt-logo.svg" alt="" className="h-10 w-10 object-contain opacity-90" />
        <ChatProviderPicker
          onChosen={() => {
            setVersion((n) => Math.abs(n) + 1);
          }}
        />
      </div>
    );
  }

  // When there are no messages, show the welcome state with composer and suggestions
  // When there are messages, render nothing (ChatMessages handles the conversation)
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-4 py-10">
      {/* Welcome section — shown only when conversation is empty */}      
      <div className="flex flex-col items-center gap-2 text-center">
        <img src="/openbentt-logo.svg" alt="" className="h-10 w-10 object-contain opacity-90" />
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{WELCOME_HEADING}</h1>
        {modelLabel && <p className="text-xs text-muted-foreground">{modelLabel}</p>}
        {isDesktopApp() && choice && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => {
              clearChatProviderChoice();
              setVersion(-1);
            }}
          >
            Change AI provider
          </button>
        )}
      </div>

      {/* Composer — always visible in empty state */}      
      <ChatInput 
        isLoading={false} 
        placeholderOverride="Ask anything..."
        variant="default"
      />

      {/* Suggested actions — only shown when conversation is empty */}      
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2" role="list" style={{ marginTop: '12px' }}>
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
