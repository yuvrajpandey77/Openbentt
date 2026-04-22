import type { Message } from "@/types/chat";
import type { OpenRouterModel } from "@/lib/openrouter";

/** Rough token estimate (~4 chars per token for English; conservative for UI). */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function messageTextLen(m: Message): number {
  let n = m.content?.length ?? 0;
  if (m.attachments?.length) {
    for (const a of m.attachments) {
      if (a.kind === "pdf") n += (a.extractedText?.length ?? 0) + 64;
      else if (a.kind === "image" || a.kind === "video_frame" || a.kind === "audio") n += 512;
    }
  }
  return n;
}

/** Estimate total “prompt-side” tokens for the conversation (no system). */
export function estimateConversationTokens(messages: Message[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += messageTextLen(m);
  }
  return Math.max(0, Math.ceil(chars / 4));
}

/** Sum raw character heuristic for all message bodies (faster than per-msg). */
export function estimateTokensFromMessagesRough(messages: Message[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += messageTextLen(m);
  }
  return Math.max(1, Math.ceil(chars / 4));
}

const KNOWN_CONTEXT_FALLBACK: Record<string, number> = {
  "claude-3-5-sonnet-20241022": 200000,
  "claude-3-5-haiku-20241022": 200000,
  "claude-3-opus-20240229": 200000,
  "claude-sonnet-4-20250514": 200000,
};

const DEFAULT_FALLBACK_CONTEXT = 128000;

export function resolveContextLimit(
  modelId: string,
  models: OpenRouterModel[] | undefined
): number {
  const found = models?.find((m) => m.id === modelId);
  if (found?.context_length && found.context_length > 0) {
    return found.context_length;
  }
  for (const [k, v] of Object.entries(KNOWN_CONTEXT_FALLBACK)) {
    if (modelId.includes(k)) return v;
  }
  if (/^gpt-4o|^o[134]|^gpt-5|^chatgpt-4o/i.test(modelId)) return 128000;
  if (/gemini-2|gemini-1\.5|gemini-2\.0/i.test(modelId)) return 1000000;
  if (/gemini/i.test(modelId)) return 32000;
  if (/openbentt\/local-gemma/i.test(modelId)) return 128000;
  return DEFAULT_FALLBACK_CONTEXT;
}

export function contextFillRatio(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(1, used / limit);
}
