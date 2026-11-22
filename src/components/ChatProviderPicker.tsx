/**
 * First-message provider picker — short cards, auto-detect, one click to configure.
 */
import { useEffect, useState } from "react";
import { Bot, Cloud, Cpu, Sparkles, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useChat } from "@/context/ChatContext";
import { useLocalAI } from "@/context/LocalAIContext";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { detectExternalAgents, type DetectedExternalAgent } from "@/lib/agent/externalAgentsApi";
import {
  applyChatProviderChoice,
  loadChatProviderChoice,
  storeChatProviderChoice,
  type ChatProviderChoiceId,
} from "@/lib/agent/chatProviderChoice";
import { useToast } from "@/components/ui/use-toast";

type Option = {
  id: ChatProviderChoiceId;
  label: string;
  hint: string;
  icon: React.ElementType;
  available: boolean;
  detail?: string | null;
};

export function ChatProviderPicker({ onChosen }: { onChosen?: () => void }) {
  const { apiConfig, setApiConfig } = useChat();
  const { health, defaultModel, refresh } = useLocalAI();
  const { toast } = useToast();
  const [agents, setAgents] = useState<DetectedExternalAgent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) {
      setAgents([]);
      return;
    }
    void detectExternalAgents()
      .then((r) => setAgents(r.agents))
      .catch(() => setAgents([]));
  }, []);

  const byId = (id: string) => agents?.find((a) => a.id === id);

  const options: Option[] = [
    {
      id: "ollama",
      label: "Local Ollama",
      hint: "Private · no cloud key",
      icon: Cpu,
      available: health === "ready" || health === "checking" || health === "no-models",
      detail: defaultModel ? `Model: ${defaultModel}` : health === "ready" ? "Ready" : "Start Ollama if needed",
    },
    {
      id: "opencode",
      label: "OpenCode",
      hint: "Execution agent",
      icon: Terminal,
      available: Boolean(byId("opencode")?.available) || !isDesktopApp(),
      detail: byId("opencode")?.version?.slice(0, 48) ?? null,
    },
    {
      id: "claude",
      label: "Claude Code",
      hint: "Detected CLI agent",
      icon: Bot,
      available: Boolean(byId("claude")?.available),
      detail: byId("claude")?.version?.slice(0, 48) ?? null,
    },
    {
      id: "codex",
      label: "Codex CLI",
      hint: "Detected CLI agent",
      icon: Sparkles,
      available: Boolean(byId("codex")?.available),
      detail: byId("codex")?.version?.slice(0, 48) ?? null,
    },
    {
      id: "cursor-agent",
      label: "Cursor Agent",
      hint: "Detected CLI agent",
      icon: Bot,
      available: Boolean(byId("cursor-agent")?.available),
      detail: byId("cursor-agent")?.version?.slice(0, 48) ?? null,
    },
    {
      id: "openrouter",
      label: "OpenRouter / cloud",
      hint: "Needs API key in Settings",
      icon: Cloud,
      available: true,
      detail: apiConfig.apiKey?.trim() ? "Key saved" : "Add key after picking",
    },
  ].filter((o) => o.available || o.id === "ollama" || o.id === "openrouter" || o.id === "opencode");

  const pick = async (id: ChatProviderChoiceId) => {
    setBusy(id);
    try {
      if (id === "ollama") await refresh({ quiet: true }).catch(() => {});
      storeChatProviderChoice(id);
      const next = applyChatProviderChoice(id, apiConfig, { ollamaModel: defaultModel });
      setApiConfig(next);
      toast({
        title: "Provider ready",
        description:
          id === "ollama"
            ? "Using local Ollama for chat."
            : id === "openrouter"
              ? "OpenRouter selected — add a key in Settings if you have not."
              : `${options.find((o) => o.id === id)?.label ?? id} selected.`,
      });
      onChosen?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-1">
      <div className="text-center">
        <h2 className="text-base font-semibold tracking-tight">Which AI do you want to use?</h2>
        <p className="mt-1 text-xs text-muted-foreground">One click — we configure it. You can change this later in Settings.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const Icon = o.icon;
          const disabled = !o.available && o.id !== "openrouter" && o.id !== "ollama";
          return (
            <Button
              key={o.id}
              type="button"
              variant="outline"
              disabled={disabled || busy != null}
              className="h-auto flex-col items-start gap-1 whitespace-normal px-3.5 py-3 text-left"
              onClick={() => void pick(o.id)}
            >
              <span className="flex w-full items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">{o.label}</span>
                {o.available ? (
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {busy === o.id ? "…" : "Ready"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    Setup
                  </Badge>
                )}
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">{o.hint}</span>
              {o.detail && (
                <span className="truncate font-mono text-[10px] text-muted-foreground/80">{o.detail}</span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function needsChatProviderChoice(): boolean {
  return loadChatProviderChoice() == null;
}
