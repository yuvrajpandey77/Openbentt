/**
 * Unified streaming chat across OpenRouter, OpenAI, OpenAI-compatible (Grok, Kimi, Ollama…),
 * Anthropic, and Google Gemini.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ApiKeyConfig } from "@/types/chat";
import {
  OPENROUTER_CHAT_URL,
  resolveChatCompletionsUrl,
  streamOpenRouterChat,
  StreamHttpError,
  type OpenRouterStreamCallbacks,
  type StreamMetrics,
} from "@/lib/openrouter";
import { collectRateLimitHeaders } from "@/lib/providerRateLimits";

export type { StreamMetrics };

function openAiStyleMessagesToText(m: { role: string; content: unknown }): string {
  if (typeof m.content === "string") return m.content;
  return JSON.stringify(m.content);
}

function splitSystemAndRest(
  messages: Array<{ role: string; content: unknown }>
): { system: string; rest: Array<{ role: string; content: unknown }> } {
  const sysParts: string[] = [];
  const rest: Array<{ role: string; content: unknown }> = [];
  for (const m of messages) {
    if (m.role === "system") {
      sysParts.push(openAiStyleMessagesToText(m));
    } else {
      rest.push(m);
    }
  }
  return { system: sysParts.join("\n\n").trim(), rest };
}

/** Anthropic Messages API — streaming SSE. */
export async function streamAnthropicChat(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  signal: AbortSignal,
  callbacks: OpenRouterStreamCallbacks
): Promise<{ text: string; metrics: StreamMetrics; rateLimitHeaders: Record<string, string> }> {
  const t0 = performance.now();
  let ttftMs: number | null = null;
  let accumulated = "";

  const { system, rest } = splitSystemAndRest(messages);
  const anthMessages = rest
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: openAiStyleMessagesToText(m),
    }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      stream: true,
      ...(system ? { system } : {}),
      messages: anthMessages,
    }),
  });

  const rateLimitHeaders = collectRateLimitHeaders(res);

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = err.error?.message || `Anthropic failed (${res.status})`;
    throw new StreamHttpError(msg, res.status, rateLimitHeaders);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        for (const line of block.split("\n")) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const jsonStr = t.slice(5).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const data = JSON.parse(jsonStr) as {
              type?: string;
              delta?: { type?: string; text?: string };
            };
            const d = data.delta;
            const piece =
              data.type === "content_block_delta" && d && typeof d.text === "string"
                ? d.text
                : "";
            if (piece) {
              if (ttftMs === null) ttftMs = Math.round(performance.now() - t0);
              accumulated += piece;
              callbacks.onDelta(piece);
            }
          } catch {
            /* ignore partial JSON */
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const totalMs = Math.round(performance.now() - t0);
  return {
    text: accumulated,
    metrics: { ttftMs, totalMs },
    rateLimitHeaders,
  };
}

/** Google Gemini — official SDK stream. */
export async function streamGeminiChat(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  signal: AbortSignal,
  callbacks: OpenRouterStreamCallbacks
): Promise<{ text: string; metrics: StreamMetrics; rateLimitHeaders: Record<string, string> }> {
  const t0 = performance.now();
  let ttftMs: number | null = null;
  let accumulated = "";

  const { system, rest } = splitSystemAndRest(messages);
  const genAI = new GoogleGenerativeAI(apiKey.trim());
  const modelId = model.replace(/^models\//, "");
  const gm = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: system || undefined,
  });

  const history: Array<{ role: "user" | "model"; parts: { text: string }[] }> = [];
  const conv = rest.filter((m) => m.role === "user" || m.role === "assistant");
  if (conv.length === 0) {
    throw new Error("No user/assistant messages for Gemini");
  }
  const last = conv[conv.length - 1];
  const prior = conv.slice(0, -1);
  for (let i = 0; i < prior.length; i += 2) {
    const u = prior[i];
    const a = prior[i + 1];
    if (u?.role === "user") {
      history.push({ role: "user", parts: [{ text: openAiStyleMessagesToText(u) }] });
    }
    if (a?.role === "assistant") {
      history.push({ role: "model", parts: [{ text: openAiStyleMessagesToText(a) }] });
    }
  }

  if (last.role !== "user") {
    throw new Error("Last message must be user for Gemini");
  }

  const chat = gm.startChat({ history });
  const result = await chat.sendMessageStream(openAiStyleMessagesToText(last), { signal });

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      if (ttftMs === null) ttftMs = Math.round(performance.now() - t0);
      accumulated += text;
      callbacks.onDelta(text);
    }
  }

  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  try {
    const response = await result.response;
    const u = response.usageMetadata;
    if (u) {
      promptTokens = u.promptTokenCount;
      completionTokens = u.candidatesTokenCount;
      const total = (promptTokens ?? 0) + (completionTokens ?? 0);
      callbacks.onUsage?.({
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: total,
      });
    }
  } catch {
    /* usage optional */
  }

  const totalMs = Math.round(performance.now() - t0);
  return {
    text: accumulated,
    metrics: {
      ttftMs,
      totalMs,
      promptTokens,
      completionTokens,
      totalTokens:
        promptTokens != null && completionTokens != null ? promptTokens + completionTokens : undefined,
    },
    rateLimitHeaders: {},
  };
}

export async function streamChatForConfig(
  cfg: ApiKeyConfig,
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  signal: AbortSignal,
  callbacks: OpenRouterStreamCallbacks
): Promise<{ text: string; metrics: StreamMetrics; rateLimitHeaders: Record<string, string> }> {
  switch (cfg.aiProvider) {
    case "openrouter":
      return streamOpenRouterChat(cfg.apiKey, model, messages, signal, callbacks, {
        chatCompletionsUrl: OPENROUTER_CHAT_URL,
        reasoningPreference: cfg.reasoningPreference,
      });
    case "openai_direct":
      return streamOpenRouterChat(cfg.apiKey, model, messages, signal, callbacks, {
        chatCompletionsUrl: "https://api.openai.com/v1/chat/completions",
        reasoningPreference: cfg.reasoningPreference,
      });
    case "openai_compatible":
      return streamOpenRouterChat(cfg.apiKey, model, messages, signal, callbacks, {
        chatCompletionsUrl: resolveChatCompletionsUrl(cfg.openAiCompatibleBaseUrl),
        reasoningPreference: cfg.reasoningPreference,
      });
    case "anthropic":
      return streamAnthropicChat(cfg.apiKey, model, messages, signal, callbacks);
    case "google":
      return streamGeminiChat(cfg.apiKey, model, messages, signal, callbacks);
    case "webgpu_gemma":
      throw new Error("streamChatForConfig: webgpu_gemma is handled by streamLocalGemmaChat in ChatContext.");
    default:
      return streamOpenRouterChat(cfg.apiKey, model, messages, signal, callbacks, {
        chatCompletionsUrl: OPENROUTER_CHAT_URL,
        reasoningPreference: cfg.reasoningPreference,
      });
  }
}
