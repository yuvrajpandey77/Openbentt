import type { AiProvider } from "@/types/chat";

/** Last HTTP rate-limit headers from a chat stream, or error metadata when a request failed (e.g. 429). */
export interface ProviderQuotaSnapshot {
  provider: AiProvider;
  rateLimitHeaders: Record<string, string>;
  updatedAt: number;
  /** Set when the request failed — e.g. OpenRouter daily free limit (toast uses the same text). */
  limitMessage?: string;
  httpStatus?: number;
}

/** Headers from the first HTTP response of a streaming chat (OpenRouter, OpenAI, many proxies). */
export function collectRateLimitHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (
      lk.includes("ratelimit") ||
      lk.includes("rate-limit") ||
      lk === "retry-after" ||
      lk.includes("anthropic-ratelimit") ||
      lk.includes("openrouter")
    ) {
      out[key] = value;
    }
  });
  return out;
}

export interface ParsedRequestWindow {
  remaining: number;
  limit: number;
}

/** Best-effort parse rate-limit headers (per-window requests, or generic x-ratelimit-* pairs). */
export function parseRequestWindow(headers: Record<string, string>): ParsedRequestWindow | null {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lower[k.toLowerCase()] = v;
  }

  let remaining: number | undefined;
  let limit: number | undefined;

  for (const [k, v] of Object.entries(lower)) {
    const n = Number(String(v).trim());
    if (!Number.isFinite(n)) continue;
    if (k.includes("remaining") && k.includes("request")) {
      remaining = n;
    }
    if (k.includes("limit") && k.includes("request") && !k.includes("remaining")) {
      limit = n;
    }
  }

  if (remaining !== undefined && limit !== undefined && limit > 0) {
    return { remaining, limit };
  }

  // OpenRouter / some proxies: x-ratelimit-limit + x-ratelimit-remaining (no "request" in name)
  const genRem = lower["x-ratelimit-remaining"];
  const genLim = lower["x-ratelimit-limit"];
  if (genRem !== undefined && genLim !== undefined) {
    const r = Number(String(genRem).trim());
    const l = Number(String(genLim).trim());
    if (Number.isFinite(r) && Number.isFinite(l) && l > 0) {
      return { remaining: r, limit: l };
    }
  }

  // Day / window variants (e.g. *-remaining-day)
  for (const [k, v] of Object.entries(lower)) {
    const n = Number(String(v).trim());
    if (!Number.isFinite(n)) continue;
    if (remaining === undefined && k.includes("remaining") && (k.includes("day") || k.includes("daily"))) {
      remaining = n;
    }
    if (limit === undefined && k.includes("limit") && !k.includes("remaining") && (k.includes("day") || k.includes("daily"))) {
      limit = n;
    }
  }
  if (remaining !== undefined && limit !== undefined && limit > 0) {
    return { remaining, limit };
  }

  return null;
}

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  openrouter: "OpenRouter",
  openai_direct: "OpenAI",
  openai_compatible: "Compatible API",
  anthropic: "Anthropic",
  google: "Google AI",
};
