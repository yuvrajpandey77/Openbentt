import type { ResearchSourceRef } from "@/types/chat";

export interface ProxyResearchResponse {
  context: string;
  sources: ResearchSourceRef[];
}

function isAllowedProxyBase(u: string): boolean {
  if (u.startsWith("https://")) return true;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:") return false;
    const h = parsed.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

export interface ResearchProxyExtra {
  /** Server may fetch extra HTTPS pages from Brave results when hostnames match `approvedDomains`. */
  deepResearch?: boolean;
  approvedDomains?: string[];
}

/** POST to user-configured proxy (HTTPS in prod; http://127.0.0.1 or localhost allowed for local dev proxy). */
export async function fetchResearchViaProxy(
  proxyBaseUrl: string,
  query: string,
  urls: string[],
  signal?: AbortSignal,
  extra?: ResearchProxyExtra
): Promise<ProxyResearchResponse | null> {
  const u = proxyBaseUrl.replace(/\/$/, "");
  if (!isAllowedProxyBase(u)) {
    throw new Error("Research proxy must use HTTPS (or http://127.0.0.1 / http://localhost for local dev)");
  }
  const endpoint = u.endsWith("/research") ? u : `${u}/research`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      urls,
      deepResearch: extra?.deepResearch === true,
      approvedDomains: Array.isArray(extra?.approvedDomains) ? extra.approvedDomains : [],
    }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Proxy research failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as ProxyResearchResponse;
  if (!json.context || typeof json.context !== "string") return null;
  return {
    context: json.context.slice(0, 24_000),
    sources: Array.isArray(json.sources) ? json.sources : [],
  };
}
