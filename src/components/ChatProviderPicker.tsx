/**
 * First-message provider picker — detected system agents + chat backends.
 */
import { useEffect, useState } from "react";
import { Bot, Cloud, Cpu, HardDrive, Sparkles, Terminal } from "lucide-react";
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
import { isLocalGgufDesktopAvailable } from "@/lib/localGguf/desktopApi";
import { useToast } from "@/components/ui/use-toast";

type Option = {
  id: ChatProviderChoiceId;
  label: string;
  hint: string;
  icon: React.ElementType;
  available: boolean;
  detail?: string | null;
};

const AGENT_META: Record<
  string,
  { label: string; hint: string; icon: React.ElementType }
> = {
  opencode: { label: "OpenCode", hint: "Local execution", icon: Terminal },
  claude: { label: "Claude Code", hint: "Detected CLI", icon: Bot },
  codex: { label: "Codex CLI", hint: "Detected CLI", icon: Sparkles },
  "cursor-agent": { label: "Cursor Agent", hint: "Detected CLI", icon: Bot },
  aider: { label: "Aider", hint: "Detected CLI", icon: Terminal },
  gemini: { label: "Gemini CLI", hint: "Detected CLI", icon: Sparkles },
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

  const agentOptions: Option[] = (["opencode", "claude", "codex", "cursor-agent", "aider", "gemini"] as const)
    .map((id) => {
      const meta = AGENT_META[id];
      const hit = byId(id);
      return {
        id,
        label: meta.label,
        hint: meta.hint,
        icon: meta.icon,
        available: Boolean(hit?.available) || (id === "opencode" && !isDesktopApp()),
        detail: hit?.version?.slice(0, 40) ?? (hit?.path ? hit.path.split("/").pop() : null),
      };
    })
    .filter((o) => o.available || o.id === "opencode");

  const options: Option[] = [
    {
      id: "ollama",
      label: "Ollama",
      hint: "Local models",
      icon: Cpu,
      available: health === "ready" || health === "checking" || health === "no-models",
      detail: defaultModel ?? null,
    },
    ...agentOptions,
    ...(isLocalGgufDesktopAvailable()
      ? [
          {
            id: "local_gguf" as const,
            label: "Local GGUF",
            hint: "llama-server",
            icon: HardDrive,
            available: true,
            detail: null,
          },
        ]
      : []),
    {
      id: "openrouter",
      label: "OpenRouter",
      hint: "Cloud API key",
      icon: Cloud,
      available: true,
      detail: apiConfig.apiKey?.trim() ? "Key saved" : null,
    },
  ];

  const pick = async (id: ChatProviderChoiceId) => {
    setBusy(id);
    try {
      if (id === "ollama") await refresh({ quiet: true }).catch(() => {});
      storeChatProviderChoice(id);
      setApiConfig(applyChatProviderChoice(id, apiConfig, { ollamaModel: defaultModel }));
      toast({
        title: options.find((o) => o.id === id)?.label ?? id,
        description: "Selected for chat.",
      });
      onChosen?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-3 px-1">
      <div className="text-center">
        <h2 className="text-base font-semibold tracking-tight">Choose AI</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Detected agents on your system + chat backends</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const Icon = o.icon;
          const disabled = !o.available && o.id !== "openrouter" && o.id !== "ollama" && o.id !== "local_gguf";
          return (
            <Button
              key={o.id}
              type="button"
              variant="outline"
              disabled={disabled || busy != null}
              className="h-auto flex-col items-start gap-0.5 whitespace-normal px-3 py-2.5 text-left"
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
              {o.detail ? (
                <span className="truncate font-mono text-[10px] text-muted-foreground/80">{o.detail}</span>
              ) : null}
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
