/**
 * First-message chat provider choice — persisted so we don't dump users into
 * OpenCode (or any CLI) without an explicit pick.
 */
import { normalizeApiConfig, type ApiKeyConfig } from "@/types/chat";
import { defaultOllamaBaseUrl } from "@/lib/modelManager/ollamaProbe";

export const CHAT_PROVIDER_CHOICE_KEY = "openbentt-chat-provider-choice";
export const PREFERRED_AGENT_KEY = "openbentt-preferred-external-agent";

export type ChatProviderChoiceId =
  | "ollama"
  | "opencode"
  | "openrouter"
  | "local_gguf"
  | "claude"
  | "codex"
  | "cursor-agent";

export type ChatProviderChoice = {
  id: ChatProviderChoiceId;
  chosenAt: string;
};

export function loadChatProviderChoice(): ChatProviderChoice | null {
  try {
    const raw = localStorage.getItem(CHAT_PROVIDER_CHOICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatProviderChoice;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeChatProviderChoice(id: ChatProviderChoiceId): ChatProviderChoice {
  const choice: ChatProviderChoice = { id, chosenAt: new Date().toISOString() };
  try {
    localStorage.setItem(CHAT_PROVIDER_CHOICE_KEY, JSON.stringify(choice));
    localStorage.setItem(PREFERRED_AGENT_KEY, id === "ollama" || id === "openrouter" || id === "local_gguf" ? "opencode" : id);
    if (id === "opencode") localStorage.setItem(PREFERRED_AGENT_KEY, "opencode");
  } catch {
    /* ignore */
  }
  return choice;
}

export function clearChatProviderChoice(): void {
  try {
    localStorage.removeItem(CHAT_PROVIDER_CHOICE_KEY);
  } catch {
    /* ignore */
  }
}

/** Apply a one-click choice onto the live ApiKeyConfig. */
export function applyChatProviderChoice(
  id: ChatProviderChoiceId,
  current: ApiKeyConfig,
  opts?: { ollamaModel?: string | null }
): ApiKeyConfig {
  switch (id) {
    case "ollama":
      return normalizeApiConfig({
        ...current,
        aiProvider: "openai_compatible",
        model: opts?.ollamaModel?.trim() || current.model || "llama3.2",
        openAiCompatibleBaseUrl: current.openAiCompatibleBaseUrl?.trim() || defaultOllamaBaseUrl(),
        comparisonEnabled: false,
      });
    case "local_gguf":
      return normalizeApiConfig({
        ...current,
        aiProvider: "local_gguf",
        comparisonEnabled: false,
      });
    case "openrouter":
      return normalizeApiConfig({
        ...current,
        aiProvider: "openrouter",
        comparisonEnabled: false,
      });
    case "opencode":
    case "claude":
    case "codex":
    case "cursor-agent":
      // Chat ask path uses OpenCode layer when available; execution agents are preferred separately.
      return normalizeApiConfig({
        ...current,
        // Leave cloud empty so OpenCode ask layer (or next local auto-switch) owns the turn.
        aiProvider: current.aiProvider === "openai_compatible" ? current.aiProvider : "openrouter",
        comparisonEnabled: false,
      });
    default:
      return current;
  }
}

/** Whether OpenCode ask-layer should own conversational turns for this choice. */
export function choiceUsesOpenCodeAsk(id: ChatProviderChoiceId | null | undefined): boolean {
  if (!id) return false;
  return id === "opencode" || id === "claude" || id === "codex" || id === "cursor-agent";
}
