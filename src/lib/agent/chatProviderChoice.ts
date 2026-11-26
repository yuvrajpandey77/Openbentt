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
  | "cursor-agent"
  | "aider"
  | "gemini";

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

export function storeChatProviderChoice(
  id: ChatProviderChoiceId,
  opts?: { asWorkspaceDefault?: boolean }
): ChatProviderChoice {
  const choice: ChatProviderChoice = { id, chosenAt: new Date().toISOString() };
  try {
    localStorage.setItem(CHAT_PROVIDER_CHOICE_KEY, JSON.stringify(choice));
    // Workspace default agent is Settings-owned; composer picks are per-chat only
    // unless explicitly opted in (keeps simultaneous chats from clobbering default).
    if (opts?.asWorkspaceDefault) {
      const chatOnly = id === "ollama" || id === "openrouter" || id === "local_gguf";
      localStorage.setItem(PREFERRED_AGENT_KEY, chatOnly ? "opencode" : id);
    }
  } catch {
    /* ignore */
  }
  return choice;
}

/** Workspace default agent for new chats (Settings → Agents). */
export function loadPreferredAgent(): string {
  try {
    return localStorage.getItem(PREFERRED_AGENT_KEY) || "opencode";
  } catch {
    return "opencode";
  }
}

export function storePreferredAgent(id: string): void {
  try {
    localStorage.setItem(PREFERRED_AGENT_KEY, id || "opencode");
  } catch {
    /* ignore */
  }
}

const AGENT_CLI_IDS = new Set([
  "opencode",
  "claude",
  "codex",
  "cursor-agent",
  "aider",
  "gemini",
]);

export function isAgentCliId(id: string | null | undefined): boolean {
  return Boolean(id && AGENT_CLI_IDS.has(id));
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
    case "aider":
    case "gemini":
      // Chat ask path uses the OpenCode layer / preferred CLI — never force OpenRouter keys.
      return normalizeApiConfig({
        ...current,
        comparisonEnabled: false,
      });
    default:
      return current;
  }
}

/** Chat backends that require keys/local URLs — not the OpenCode ask layer. */
export function choiceIsChatBackend(id: ChatProviderChoiceId | null | undefined): boolean {
  return id === "ollama" || id === "openrouter" || id === "local_gguf";
}

/** Whether OpenCode ask-layer should own conversational turns for this choice. */
export function choiceUsesOpenCodeAsk(id: ChatProviderChoiceId | null | undefined): boolean {
  if (!id) return false;
  return (
    id === "opencode" ||
    id === "claude" ||
    id === "codex" ||
    id === "cursor-agent" ||
    id === "aider" ||
    id === "gemini"
  );
}
