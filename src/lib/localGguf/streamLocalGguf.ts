/**
 * Local GGUF inference via llama-server (OpenAI-compatible), desktop only.
 */

import type { ApiKeyConfig } from "@/types/chat";
import {
  streamOpenRouterChat,
  type OpenRouterStreamCallbacks,
  type StreamMetrics,
} from "@/lib/openrouter";
import { parseGgufRegistryId } from "@/lib/localGguf/ids";
import { getLocalGgufApi } from "@/lib/localGguf/desktopApi";

export async function streamLocalGgufChat(
  cfg: ApiKeyConfig,
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  signal: AbortSignal,
  callbacks: OpenRouterStreamCallbacks
): Promise<{ text: string; metrics: StreamMetrics; rateLimitHeaders: Record<string, string> }> {
  const api = getLocalGgufApi();
  if (!api) {
    throw new Error("Local GGUF is only available in the Openbentt desktop app.");
  }
  const regId = parseGgufRegistryId(model);
  if (!regId) {
    throw new Error("No GGUF model selected. Choose a downloaded model in Settings or Labs.");
  }
  const ensured = await api.ensureServer({
    registryId: regId,
    binaryOverride: cfg.localGgufBinaryPath?.trim() || undefined,
  });
  const chatCompletionsUrl = `${ensured.baseUrl.replace(/\/$/, "")}/chat/completions`;
  return streamOpenRouterChat("", ensured.chatModelId, messages, signal, callbacks, {
    chatCompletionsUrl,
    reasoningPreference: cfg.reasoningPreference,
  });
}
