/** GET https://openrouter.ai/api/v1/key — credits and account flags (not RPM; those come from response headers). */

export const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";

export interface OpenRouterKeyData {
  label?: string;
  limit?: number | null;
  limit_remaining?: number | null;
  limit_reset?: string | null;
  usage?: number;
  usage_daily?: number;
  usage_weekly?: number;
  usage_monthly?: number;
  is_free_tier?: boolean;
  /** Present on some responses; shape varies — keep loose */
  [key: string]: unknown;
}

export async function fetchOpenRouterKeyInfo(apiKey: string): Promise<OpenRouterKeyData | null> {
  const k = apiKey.trim();
  if (!k) return null;
  const res = await fetch(OPENROUTER_KEY_URL, {
    headers: {
      Authorization: `Bearer ${k}`,
      "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "",
      "X-Title": "Openbentt",
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: OpenRouterKeyData };
  return json.data ?? null;
}
