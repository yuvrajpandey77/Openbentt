import React, { useState } from "react";
import { Brain, FileText, FolderKanban, Search } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { Button } from "@/components/ui/button";
import { ChatProviderPicker, needsChatProviderChoice } from "@/components/ChatProviderPicker";
import { loadChatProviderChoice } from "@/lib/agent/chatProviderChoice";
import { isDesktopApp } from "@/lib/isDesktopApp";
import {
  EMPTY_COMPOSER_SLOT_TEST_ID,
  useRegisterEmptyComposerSlot,
} from "@/components/composer/ComposerSlots";

/** Empty chat — short prompts only; no instructional clutter. */
const SUGGESTIONS = [
  { icon: FileText, label: "Summarize", prompt: "Help me summarize a document." },
  { icon: Brain, label: "Analyze", prompt: "Help me analyze an idea." },
  { icon: FolderKanban, label: "New project", prompt: "Help me start a research project." },
  { icon: Search, label: "Search library", prompt: "Search my connected knowledge and papers." },
];

export const ChatHome: React.FC = () => {
  const { queuePromptInComposer } = useChat();
  const registerComposerSlot = useRegisterEmptyComposerSlot();
  const [version, setVersion] = useState(0);
  const choice = loadChatProviderChoice();
  const showPicker = isDesktopApp() && (!choice || version < 0);

  if (showPicker || (isDesktopApp() && needsChatProviderChoice())) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-4 py-10">
        <img src="/openbentt-logo.svg" alt="" className="h-9 w-9 object-contain opacity-90" />
        <ChatProviderPicker
          onChosen={() => {
            setVersion((n) => Math.abs(n) + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[min(100%,58rem)] flex-1 flex-col items-center justify-center gap-5 px-2 py-6 sm:px-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <img src="/openbentt-logo.svg" alt="" className="h-9 w-9 object-contain opacity-90" />
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Ready when you are.</h1>
      </div>

      <div
        ref={registerComposerSlot ?? undefined}
        data-testid={EMPTY_COMPOSER_SLOT_TEST_ID}
        className="w-full"
      />

      <div className="flex w-full flex-wrap items-center justify-center gap-1.5" role="list">
        {SUGGESTIONS.map((s) => (
          <Button
            key={s.label}
            variant="ghost"
            role="listitem"
            size="sm"
            className="h-8 gap-1.5 rounded-full border border-border/60 px-3 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              queuePromptInComposer(s.prompt);
            }}
          >
            <s.icon size={13} className="shrink-0 opacity-70" />
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  );
};
