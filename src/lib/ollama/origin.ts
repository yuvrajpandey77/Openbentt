/**
 * Ollama URL helpers: chat uses OpenAI-compatible `/v1`, IPC uses API origin without `/v1`.
 */
import { isLoopbackCompatibleBase } from "@/lib/privacy/privacyPreferences";
import type { ApiKeyConfig } from "@/types/chat";

export const DEFAULT_OLLAMA_API_ORIGIN = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_CHAT_BASE = "http://127.0.0.1:11434/v1";

/** Chat / OpenAI-compatible base (`…/v1`). */
export function defaultOllamaChatBaseUrl(): string {
  return DEFAULT_OLLAMA_CHAT_BASE;
}

/** Native Ollama HTTP origin for `/api/*` IPC. */
export function defaultOllamaApiOrigin(): string {
  return DEFAULT_OLLAMA_API_ORIGIN;
}

/**
 * Convert Settings `openAiCompatibleBaseUrl` (often `http://127.0.0.1:11434/v1`)
 * into the IPC origin (`http://127.0.0.1:11434`). Returns null if empty/invalid/non-loopback.
 */
export function openAiCompatibleBaseUrlToOllamaOrigin(baseUrl?: string | null): string | null {
  const raw = (baseUrl ?? "").trim();
  if (!raw) return DEFAULT_OLLAMA_API_ORIGIN;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    const u = new URL(withScheme);
    if (!isLoopbackCompatibleBase(u.origin)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** True when chat should use the user's local Ollama/compatible loopback stack (not OpenCode ask-layer). */
export function prefersLocalOllamaInference(cfg: Pick<ApiKeyConfig, "aiProvider" | "openAiCompatibleBaseUrl">): boolean {
  if (cfg.aiProvider === "local_gguf") return true;
  if (cfg.aiProvider !== "openai_compatible") return false;
  const base = (cfg.openAiCompatibleBaseUrl ?? "").trim() || DEFAULT_OLLAMA_CHAT_BASE;
  return isLoopbackCompatibleBase(base);
}

/**
 * Match requested model against installed tags.
 * Exact tag wins; bare `qwen3` matches `qwen3:0.6b`; different tags do not cross-match.
 */
export function ollamaModelMatches(requested: string, installed: string[]): boolean {
  const req = requested.trim();
  if (!req) return false;
  if (installed.includes(req)) return true;
  const reqHasTag = req.includes(":");
  return installed.some((name) => {
    if (name === req) return true;
    if (!reqHasTag && name.startsWith(`${req}:`)) return true;
    if (!name.includes(":") && req.startsWith(`${name}:`)) return true;
    return false;
  });
}
