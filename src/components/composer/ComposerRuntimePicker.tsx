/**
 * Compact composer control: pick chat backend or a detected system agent CLI.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChat } from "@/context/ChatContext";
import { useLocalAI } from "@/context/LocalAIContext";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { detectExternalAgents, type DetectedExternalAgent } from "@/lib/agent/externalAgentsApi";
import {
  applyChatProviderChoice,
  loadChatProviderChoice,
  PREFERRED_AGENT_KEY,
  storeChatProviderChoice,
  type ChatProviderChoiceId,
} from "@/lib/agent/chatProviderChoice";
import { isLocalGgufDesktopAvailable } from "@/lib/localGguf/desktopApi";
import { cn } from "@/lib/utils";

const AGENT_LABELS: Record<string, string> = {
  ollama: "Ollama",
  opencode: "OpenCode",
  claude: "Claude Code",
  codex: "Codex",
  "cursor-agent": "Cursor Agent",
  aider: "Aider",
  gemini: "Gemini CLI",
  openrouter: "OpenRouter",
  local_gguf: "Local GGUF",
};

function choiceLabel(id: string | null | undefined): string {
  if (!id) return "Runtime";
  return AGENT_LABELS[id] ?? id;
}

export function ComposerRuntimePicker({ compact }: { compact?: boolean }) {
  const { apiConfig, setApiConfig } = useChat();
  const { health, defaultModel, refresh } = useLocalAI();
  const [agents, setAgents] = useState<DetectedExternalAgent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [choiceId, setChoiceId] = useState<ChatProviderChoiceId | null>(() => loadChatProviderChoice()?.id ?? null);
  const [preferred, setPreferred] = useState(() => {
    try {
      return localStorage.getItem(PREFERRED_AGENT_KEY) ?? "opencode";
    } catch {
      return "opencode";
    }
  });

  const scan = useCallback(async () => {
    if (!isDesktopApp()) {
      setAgents([]);
      return;
    }
    setBusy(true);
    try {
      const r = await detectExternalAgents();
      setAgents(r.agents);
    } catch {
      setAgents([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  const availableAgents = useMemo(
    () => (agents ?? []).filter((a) => a.available),
    [agents]
  );

  const activeLabel = useMemo(() => {
    if (choiceId === "ollama" || choiceId === "openrouter" || choiceId === "local_gguf") {
      return choiceLabel(choiceId);
    }
    if (choiceId && AGENT_LABELS[choiceId]) return choiceLabel(choiceId);
    return choiceLabel(preferred);
  }, [choiceId, preferred]);

  const pick = async (id: ChatProviderChoiceId) => {
    setBusy(true);
    try {
      if (id === "ollama") await refresh({ quiet: true }).catch(() => {});
      storeChatProviderChoice(id);
      setChoiceId(id);
      try {
        setPreferred(localStorage.getItem(PREFERRED_AGENT_KEY) ?? preferred);
      } catch { /* ignore */ }
      setApiConfig(applyChatProviderChoice(id, apiConfig, { ollamaModel: defaultModel }));
    } finally {
      setBusy(false);
    }
  };

  if (!isDesktopApp()) return null;

  const ollamaReady = health === "ready" || health === "checking" || health === "no-models";
  const showGguf = isLocalGgufDesktopAvailable();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          className={cn(
            "h-auto shrink-0 border border-border/50 bg-background/90 shadow-sm backdrop-blur hover:bg-muted/90",
            compact
              ? "min-h-8 max-w-[7.5rem] gap-1 px-2 py-1 text-xs"
              : "h-8 max-w-[7rem] gap-1 px-1.5 py-0 text-xs md:min-h-9 md:max-w-[10rem] md:px-2 md:text-sm"
          )}
          aria-label="Choose AI runtime"
        >
          <Bot size={14} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium">{activeLabel}</span>
          <ChevronDown size={12} className="shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(100vw-2rem,18rem)]">
        <DropdownMenuLabel className="flex items-center justify-between gap-2 text-xs font-normal text-muted-foreground">
          <span>On this machine</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
            onClick={(e) => {
              e.preventDefault();
              void scan();
            }}
          >
            <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
            Rescan
          </button>
        </DropdownMenuLabel>
        {availableAgents.map((a) => {
          const id = a.id as ChatProviderChoiceId;
          const selected = preferred === a.id || choiceId === id;
          return (
            <DropdownMenuItem
              key={a.id}
              className="cursor-pointer"
              onClick={() => void pick(id)}
            >
              <span className="flex-1 truncate">{a.name}</span>
              {selected ? <span className="text-primary">✓</span> : null}
            </DropdownMenuItem>
          );
        })}
        {availableAgents.length === 0 && (
          <p className="px-2 py-2 text-[11px] text-muted-foreground">
            No CLI agents detected. Install OpenCode, Claude, Codex, Cursor, Aider, or Gemini.
          </p>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Chat backends</DropdownMenuLabel>
        <DropdownMenuItem
          className="cursor-pointer"
          disabled={!ollamaReady && health !== "ready" && health !== "checking" && health !== "no-models"}
          onClick={() => void pick("ollama")}
        >
          <span className="flex-1">Ollama</span>
          {choiceId === "ollama" ? <span className="text-primary">✓</span> : null}
        </DropdownMenuItem>
        {showGguf && (
          <DropdownMenuItem className="cursor-pointer" onClick={() => void pick("local_gguf")}>
            <span className="flex-1">Local GGUF</span>
            {choiceId === "local_gguf" ? <span className="text-primary">✓</span> : null}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="cursor-pointer" onClick={() => void pick("openrouter")}>
          <span className="flex-1">OpenRouter</span>
          {choiceId === "openrouter" ? <span className="text-primary">✓</span> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
