import React, { useState } from "react";
import { FileText, FolderKanban, Search, Sparkles } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useLocalAI } from "@/context/LocalAIContext";
import { friendlyModelLabel } from "@/lib/ollama/selection";
import { Button } from "@/components/ui/button";
import { ChatProviderPicker, needsChatProviderChoice } from "@/components/ChatProviderPicker";
import { clearChatProviderChoice, loadChatProviderChoice } from "@/lib/agent/chatProviderChoice";
import { isDesktopApp } from "@/lib/isDesktopApp";
import {
  EMPTY_COMPOSER_SLOT_TEST_ID,
  useRegisterEmptyComposerSlot,
} from "@/components/composer/ComposerSlots";

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
  // AppLayout owns the only ChatInput instance. The empty state supplies the
  // slot it is rendered into; no second composer is mounted here.
  const registerComposerSlot = useRegisterEmptyComposerSlot();
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

  // Empty state: welcome, the single shared composer's slot, then suggestions.
  // The composer itself is rendered by AppLayout into the slot below.
  return (
    <div className="mx-auto flex w-full max-w-[min(100%,58rem)] flex-1 flex-col items-center justify-center gap-6 px-2 py-6 sm:px-4">
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

      <div
        ref={registerComposerSlot ?? undefined}
        data-testid={EMPTY_COMPOSER_SLOT_TEST_ID}
        className="w-full"
      />

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
