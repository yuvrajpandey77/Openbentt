/** OpenRouter client helpers (browser; user supplies API key). */

import type { Message } from "@/types/chat";
import { collectRateLimitHeaders } from "@/lib/providerRateLimits";

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/** Empty `baseUrl` → OpenRouter default. Else expects OpenAI-compatible root like `http://127.0.0.1:11434/v1`. */
export function resolveChatCompletionsUrl(openAiCompatibleBaseUrl: string | undefined | null): string {
  const b = (openAiCompatibleBaseUrl ?? "").trim();
  if (!b) return OPENROUTER_CHAT_URL;
  const clean = b.replace(/\/$/, "");
  if (clean.endsWith("/chat/completions")) return clean;
  return `${clean}/chat/completions`;
}

export function resolveModelsUrl(openAiCompatibleBaseUrl: string | undefined | null): string {
  const b = (openAiCompatibleBaseUrl ?? "").trim();
  if (!b) return OPENROUTER_MODELS_URL;
  const clean = b.replace(/\/$/, "");
  if (clean.endsWith("/models")) return clean;
  return `${clean}/models`;
}

export function isOpenRouterChatUrl(url: string): boolean {
  return url.includes("openrouter.ai");
}

/** List models from an OpenAI-compatible `/v1/models` endpoint (Ollama, LM Studio, vLLM, …). */
/** Curated list when the Anthropic models API is not used client-side. */
export const ANTHROPIC_DEFAULT_MODELS: OpenRouterModel[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
];

export async function fetchOpenAiDirectModels(apiKey: string): Promise<OpenRouterModel[]> {
  if (!apiKey.trim()) return [];
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message || `OpenAI models failed (${res.status})`);
  }
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  const rows = json.data ?? [];
  return rows
    .filter((m) => /^(gpt-|o\d|chatgpt-)/i.test(m.id))
    .map((m) => ({ id: m.id, name: shortModelLabel(m.id) }));
}

export async function fetchGeminiModelsList(apiKey: string): Promise<OpenRouterModel[]> {
  if (!apiKey.trim()) return [];
  const u = new URL("https://generativelanguage.googleapis.com/v1beta/models");
  u.searchParams.set("key", apiKey.trim());
  const res = await fetch(u.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message || `Gemini models failed (${res.status})`);
  }
  const json = (await res.json()) as {
    models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
  };
  const rows = json.models ?? [];
  return rows
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({
      id: m.name.replace(/^models\//, ""),
      name: m.name.replace(/^models\//, ""),
    }));
}

export async function fetchOpenAiCompatibleModels(
  openAiCompatibleBaseUrl: string,
  apiKey: string
): Promise<OpenRouterModel[]> {
  const url = resolveModelsUrl(openAiCompatibleBaseUrl);
  const headers: Record<string, string> = {};
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message || `Models request failed (${res.status})`
    );
  }
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  const rows = json.data ?? [];
  return rows.map((m) => ({ id: m.id, name: shortModelLabel(m.id) }));
}

export interface OpenRouterModelPricing {
  prompt?: string | number;
  completion?: string | number;
  request?: string | number;
  image?: string | number;
}

export interface OpenRouterModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: { modality?: string; input_modalities?: string[]; output_modalities?: string[] };
  top_provider?: { max_completion_tokens?: number };
  pricing?: OpenRouterModelPricing;
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export function isFreeModelId(id: string): boolean {
  return id.includes(":free");
}

/** Heuristic: OpenRouter marks many free tiers with :free; some promos use $0 pricing. */
export function isLikelyFreeModel(m: OpenRouterModel): boolean {
  if (isFreeModelId(m.id)) return true;
  const p = m.pricing?.prompt;
  const c = m.pricing?.completion;
  const pNum = p === undefined ? NaN : Number(p);
  const cNum = c === undefined ? NaN : Number(c);
  if (pNum === 0 && cNum === 0) return true;
  return false;
}

export async function fetchOpenRouterModels(apiKey: string): Promise<OpenRouterModel[]> {
  const res = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "",
      "X-Title": "Openbentt",
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message || `Models request failed (${res.status})`);
  }
  const json = (await res.json()) as OpenRouterModelsResponse;
  return json.data ?? [];
}

export function shortModelLabel(id: string): string {
  const parts = id.split("/");
  const last = parts[parts.length - 1] || id;
  return last.replace(/:free$/, "").slice(0, 48);
}

/** Maps a stored `Message` to OpenRouter `chat/completions` message shape. */
export function messageToApiPayload(msg: Message): { role: string; content: unknown } {
  if (msg.role !== "user" || !msg.attachments?.length) {
    return { role: msg.role, content: msg.content };
  }
  const parts: unknown[] = [];
  const t = msg.content.trim();
  if (t) {
    parts.push({ type: "text", text: msg.content });
  }
  for (const a of msg.attachments) {
    if (a.kind === "pdf") {
      continue;
    }
    if (a.kind === "image" || a.kind === "video_frame") {
      parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
    } else if (a.kind === "audio") {
      const comma = a.dataUrl.indexOf(",");
      const base64 = comma >= 0 ? a.dataUrl.slice(comma + 1) : a.dataUrl;
      const format =
        a.mediaType.includes("wav") ? "wav" : a.mediaType.includes("mpeg") || a.mediaType.includes("mp3") ? "mp3" : "wav";
      parts.push({ type: "input_audio", input_audio: { data: base64, format } });
    }
  }
  if (parts.length === 0) {
    parts.push({ type: "text", text: "." });
  }
  return { role: "user", content: parts };
}

export function messagesToApiPayload(messages: Message[]): Array<{ role: string; content: unknown }> {
  return messages.map(messageToApiPayload);
}

/** Prepends one or more system prompts (deduped empty). */
export function buildChatCompletionMessages(
  systemContents: string[],
  chatMessages: Message[]
): Array<{ role: string; content: unknown }> {
  const systems = systemContents
    .map((c) => c.trim())
    .filter(Boolean)
    .map((content) => ({ role: "system" as const, content }));
  return [...systems, ...messagesToApiPayload(chatMessages)];
}

export interface StreamMetrics {
  ttftMs: number | null;
  totalMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface OpenRouterStreamCallbacks {
  onDelta: (text: string) => void;
  onUsage?: (usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) => void;
}

export interface StreamChatOptions {
  /** Full chat/completions URL; default OpenRouter. */
  chatCompletionsUrl?: string;
  /** Extra system-side reasoning emphasis (temperature tweaks for o-series, etc.). */
  reasoningPreference?: "default" | "more";
}

/** Thrown when chat/completions returns a non-OK status; carries rate-limit headers for the quota meter (e.g. 429 daily limit). */
export class StreamHttpError extends Error {
  readonly status: number;
  readonly rateLimitHeaders: Record<string, string>;

  constructor(message: string, status: number, rateLimitHeaders: Record<string, string>) {
    super(message);
    this.name = "StreamHttpError";
    this.status = status;
    this.rateLimitHeaders = rateLimitHeaders;
  }
}

export function isStreamHttpError(e: unknown): e is StreamHttpError {
  return e instanceof StreamHttpError;
}

function chatRequestHeaders(apiKey: string, chatUrl: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey.trim()) {
    h.Authorization = `Bearer ${apiKey.trim()}`;
  }
  if (isOpenRouterChatUrl(chatUrl)) {
    h["HTTP-Referer"] = typeof window !== "undefined" ? window.location.origin : "";
    h["X-Title"] = "Openbentt";
  }
  return h;
}

function chatRequestBody(
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  chatUrl: string,
  _opts?: StreamChatOptions
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.7,
    stream: true,
  };
  if (isOpenRouterChatUrl(chatUrl) || chatUrl.includes("api.openai.com")) {
    body.stream_options = { include_usage: true };
  }
  const m = model.toLowerCase();
  if (/^o[0-9]|^gpt-5|^o1-|deepseek-r1|reasoning/i.test(m)) {
    body.temperature = 1;
  }
  return body;
}

/**
 * POST chat/completions with stream:true; parses SSE with line buffering.
 * Works with OpenRouter and OpenAI-compatible servers (Ollama, LM Studio, etc.).
 */
export async function streamOpenRouterChat(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  signal: AbortSignal,
  callbacks: OpenRouterStreamCallbacks,
  options?: StreamChatOptions
): Promise<{ text: string; metrics: StreamMetrics; rateLimitHeaders: Record<string, string> }> {
  const t0 = performance.now();
  let ttftMs: number | null = null;
  let accumulated = "";
  let lastUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

  const chatUrl = options?.chatCompletionsUrl ?? OPENROUTER_CHAT_URL;

  const response = await fetch(chatUrl, {
    method: "POST",
    headers: chatRequestHeaders(apiKey, chatUrl),
    body: JSON.stringify(chatRequestBody(model, messages, chatUrl, options)),
    signal,
  });

  const rateLimitHeaders = collectRateLimitHeaders(response);

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string; metadata?: Record<string, unknown> };
    };
    const msg = err.error?.message || `Chat request failed (${response.status})`;
    throw new StreamHttpError(msg, response.status, rateLimitHeaders);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            if (ttftMs === null) {
              ttftMs = Math.round(performance.now() - t0);
            }
            accumulated += delta;
            callbacks.onDelta(delta);
          }
          if (parsed.usage) {
            lastUsage = parsed.usage;
            callbacks.onUsage?.(parsed.usage);
          }
        } catch {
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const totalMs = Math.round(performance.now() - t0);
  return {
    text: accumulated,
    metrics: {
      ttftMs,
      totalMs,
      promptTokens: lastUsage?.prompt_tokens,
      completionTokens: lastUsage?.completion_tokens,
      totalTokens: lastUsage?.total_tokens,
    },
    rateLimitHeaders,
  };
}
