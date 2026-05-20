import type { ApiKeyConfig, ResearchDepth } from "@/types/chat";
import { isNetworkResearchAllowed, loadPrivacyPreferences } from "@/lib/privacy/privacyPreferences";
import type { ResearchSourceRef } from "@/types/chat";
import type { AgentTraceStep } from "@/types/chat";
import { fetchResearchViaProxy } from "@/lib/researchProxyClient";

const JINA_PREFIX = "https://r.jina.ai/";

const URL_RE = /\bhttps:\/\/[^\s<>"')]+/gi;

export interface ResearchGatherLimits {
  maxTotalContext: number;
  maxUrlFetch: number;
  maxBrave: number;
  s2Limit: number;
  s2Excerpt: number;
  jinaMax: number;
  wikiExtract: number;
  braveDesc: number;
  urlSnippet: number;
}

export function getResearchLimits(depth: ResearchDepth): ResearchGatherLimits {
  switch (depth) {
    case "quick":
      return {
        maxTotalContext: 6_000,
        maxUrlFetch: 1,
        maxBrave: 3,
        s2Limit: 1,
        s2Excerpt: 500,
        jinaMax: 4_000,
        wikiExtract: 2_000,
        braveDesc: 400,
        urlSnippet: 320,
      };
    case "deep":
      return {
        maxTotalContext: 16_000,
        maxUrlFetch: 4,
        maxBrave: 8,
        s2Limit: 5,
        s2Excerpt: 1_200,
        jinaMax: 8_000,
        wikiExtract: 4_500,
        braveDesc: 700,
        urlSnippet: 500,
      };
    default:
      return {
        maxTotalContext: 10_000,
        maxUrlFetch: 2,
        maxBrave: 5,
        s2Limit: 2,
        s2Excerpt: 800,
        jinaMax: 6_000,
        wikiExtract: 3_500,
        braveDesc: 500,
        urlSnippet: 400,
      };
  }
}

export function extractHttpsUrls(text: string, limit: number): string[] {
  const m = text.match(URL_RE) ?? [];
  const out: string[] = [];
  for (const u of m) {
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "https:") continue;
      if (!out.includes(u)) out.push(u);
      if (out.length >= limit) break;
    } catch {
      continue;
    }
  }
  return out;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "\n…[truncated]";
}

async function fetchJinaMarkdown(
  url: string,
  maxLen: number,
  signal?: AbortSignal
): Promise<{ url: string; text: string } | null> {
  const target = `${JINA_PREFIX}${url}`;
  const res = await fetch(target, { signal, mode: "cors" });
  if (!res.ok) return null;
  const text = await res.text();
  return { url, text: truncate(text, maxLen) };
}

async function wikipediaSummaryForQuery(
  query: string,
  maxExtract: number,
  signal?: AbortSignal
): Promise<ResearchSourceRef | null> {
  const q = query.slice(0, 120).trim();
  if (!q) return null;
  try {
    const search = new URL("https://en.wikipedia.org/w/api.php");
    search.searchParams.set("action", "opensearch");
    search.searchParams.set("search", q);
    search.searchParams.set("limit", "1");
    search.searchParams.set("namespace", "0");
    search.searchParams.set("format", "json");
    search.searchParams.set("origin", "*");

    const os = await fetch(search.toString(), { signal, mode: "cors" });
    if (!os.ok) return null;
    const data = (await os.json()) as [unknown, string[]];
    const title = data?.[1]?.[0];
    if (!title || typeof title !== "string") return null;

    const sumUrl = new URL(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`
    );
    const sr = await fetch(sumUrl.toString(), { signal, mode: "cors" });
    if (!sr.ok) return null;
    const page = (await sr.json()) as {
      extract?: string;
      title?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    const snippet = page.extract?.slice(0, maxExtract) ?? "";
    const desktop = page.content_urls?.desktop?.page;
    return {
      kind: "wiki",
      title: page.title ?? title,
      url: desktop,
      snippet: truncate(snippet, maxExtract),
    };
  } catch {
    return null;
  }
}

async function semanticScholarSnippets(
  query: string,
  limit: number,
  excerptMax: number,
  signal?: AbortSignal
): Promise<ResearchSourceRef[]> {
  const q = query.slice(0, 200).trim();
  if (!q) return [];
  try {
    const u = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
    u.searchParams.set("query", q);
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("fields", "title,abstract,year,url,externalIds");
    const res = await fetch(u.toString(), { signal, mode: "cors" });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: Array<{
        paperId?: string;
        title?: string;
        abstract?: string;
        year?: number;
        url?: string;
        externalIds?: { DOI?: string };
      }>;
    };
    const data = json.data ?? [];
    return data
      .filter((p) => p.title)
      .map((p) => ({
        kind: "semantic_scholar" as const,
        id: p.paperId,
        title: p.title!,
        url: p.url,
        doi: p.externalIds?.DOI,
        snippet: truncate([p.year?.toString(), p.abstract].filter(Boolean).join(" — ") || "", excerptMax),
      }));
  } catch {
    return [];
  }
}

/** Brave blocks browser CORS; only works from extension/server. */
export const BRAVE_BROWSER_CORS_HINT =
  "Brave Search cannot be called from the browser (CORS). Use your HTTPS research proxy to run Brave server-side, or rely on Wikipedia + URL reader.";

async function braveWebSearch(
  query: string,
  apiKey: string,
  count: number,
  descMax: number,
  signal?: AbortSignal
): Promise<ResearchSourceRef[]> {
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", query.slice(0, 400));
  u.searchParams.set("count", String(count));
  let res: Response;
  try {
    res = await fetch(u.toString(), {
      headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
      signal,
      mode: "cors",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/failed to fetch|networkerror|load failed/i.test(msg) || e instanceof TypeError) {
      throw new Error(BRAVE_BROWSER_CORS_HINT);
    }
    throw e;
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Brave search failed: ${res.status} ${t.slice(0, 120)}`);
  }
  const json = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  const results = json.web?.results ?? [];
  return results
    .filter((r) => r.title && r.url)
    .map((r) => ({
      kind: "web" as const,
      title: r.title!,
      url: r.url,
      snippet: truncate(r.description ?? "", descMax),
    }));
}

export interface GatherResearchResult {
  contextBlock: string;
  sources: ResearchSourceRef[];
  /** Recoverable issues (CORS, blocked source, etc.); chat still proceeds. */
  warnings: string[];
  agentTrace: AgentTraceStep[];
}

/**
 * Build a text block for system prompt + source list for UI.
 * Uses optional proxy first, then Wikipedia + URLs + optional Brave.
 */
export async function gatherResearchContext(
  userText: string,
  cfg: ApiKeyConfig,
  signal?: AbortSignal
): Promise<GatherResearchResult> {
  if (!isNetworkResearchAllowed(loadPrivacyPreferences(), cfg.offlineFirst)) {
    return {
      contextBlock: "",
      sources: [],
      warnings: ["Network research is disabled (Privacy → Local-only mode)."],
      agentTrace: [{ step: "privacy", detail: "local-only: research fetch skipped" }],
    };
  }
  const lim = getResearchLimits(cfg.researchDepth);
  const sources: ResearchSourceRef[] = [];
  const parts: string[] = [];
  const warnings: string[] = [];
  const agentTrace: AgentTraceStep[] = [];

  const proxyUrl = cfg.researchProxyUrl.trim() || (import.meta.env.VITE_RESEARCH_PROXY_URL as string | undefined) || "";
  const urls = extractHttpsUrls(userText, lim.maxUrlFetch);

  if (proxyUrl) {
    try {
      const approved = cfg.researchApprovedDomains
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const proxied = await fetchResearchViaProxy(proxyUrl, userText, urls, signal, {
        deepResearch: cfg.researchDepth === "deep",
        approvedDomains: approved,
      });
      if (proxied?.context) {
        agentTrace.push({ step: "research_proxy", detail: `POST ${proxyUrl.replace(/\/$/, "")}/research` });
        if (cfg.researchDepth === "deep" && approved.length > 0) {
          agentTrace.push({
            step: "deep_research_domains",
            detail: `Proxy may fetch full pages for: ${approved.slice(0, 6).join(", ")}${approved.length > 6 ? "…" : ""}`,
          });
        }
        return {
          contextBlock: truncate(proxied.context, lim.maxTotalContext),
          sources: proxied.sources.slice(0, 12),
          warnings: [],
          agentTrace,
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed";
      warnings.push(`Proxy: ${msg}`);
      parts.push(`[Proxy error: ${msg}]`);
      agentTrace.push({ step: "research_proxy", detail: `failed: ${msg}` });
    }
  }

  const wiki = await wikipediaSummaryForQuery(userText, lim.wikiExtract, signal);
  if (wiki) {
    sources.push(wiki);
    parts.push(`### Wikipedia (may be partial)\n**${wiki.title}**\n${wiki.snippet}`);
    agentTrace.push({ step: "wikipedia", detail: wiki.title });
  }

  const s2 = await semanticScholarSnippets(userText, lim.s2Limit, lim.s2Excerpt, signal);
  if (s2.length) {
    for (const p of s2) sources.push(p);
    parts.push(
      "### Academic papers (Semantic Scholar)\n" +
        s2.map((p, i) => `${i + 1}. **${p.title}** ${p.doi ? `(DOI: ${p.doi})` : ""}\n   ${p.snippet}`).join("\n\n")
    );
    agentTrace.push({ step: "semantic_scholar", detail: `${s2.length} papers` });
  }

  for (const url of urls.slice(0, lim.maxUrlFetch)) {
    try {
      const j = await fetchJinaMarkdown(url, lim.jinaMax, signal);
      if (j) {
        sources.push({
          kind: "web",
          title: `Page: ${url}`,
          url,
          snippet: truncate(j.text, lim.urlSnippet),
        });
        parts.push(`### Fetched page (reader)\n**${url}**\n${j.text}`);
        agentTrace.push({ step: "jina_reader", detail: url });
      } else {
        warnings.push(`Reader returned empty for ${url}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      warnings.push(`URL ${url}: ${msg}`);
      parts.push(`[Could not fetch ${url}: ${msg}]`);
    }
  }

  if (cfg.braveSearchApiKey.trim()) {
    try {
      const br = await braveWebSearch(userText, cfg.braveSearchApiKey.trim(), lim.maxBrave, lim.braveDesc, signal);
      for (const b of br) {
        sources.push(b);
      }
      if (br.length) {
        parts.push(
          "### Web search (Brave)\n" +
            br.map((b, i) => `${i + 1}. **${b.title}** ${b.url ? `(${b.url})` : ""}\n   ${b.snippet}`).join("\n\n")
        );
        agentTrace.push({ step: "brave_search", detail: `${br.length} results` });
      }
    } catch (e) {
      const line = e instanceof Error ? e.message : "error";
      warnings.push(line);
      parts.push(`[Brave: ${line}]`);
    }
  }

  const contextBlock = truncate(parts.filter(Boolean).join("\n\n"), lim.maxTotalContext);
  return { contextBlock, sources, warnings, agentTrace };
}
