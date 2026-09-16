/**
 * Minimal research proxy for Brave + Wikipedia + Semantic Scholar + arXiv + Jina.
 * Phase 1 hardening: request body cap, content-type + origin policy, in-process
 * rate limiting, upstream timeouts, generic error responses. No Redis by design.
 *
 * Usage (dev, loopback only):
 *   BRAVE_SEARCH_API_KEY=... node server/research-proxy.mjs
 *   # defaults: PORT=8787. Binds 127.0.0.1 unless HOST is set.
 *   # Optional env: RESEARCH_PROXY_ALLOWED_ORIGINS (comma-separated exact origins),
 *   #   RESEARCH_PROXY_RATE_PER_MIN (default 120), RESEARCH_PROXY_MAX_BODY_BYTES
 *   #   (default 262144), RESEARCH_PROXY_UPSTREAM_TIMEOUT_MS (default 15000).
 *
 * Deploy: put behind nginx/Caddy with HTTPS; set VITE_RESEARCH_PROXY_URL=https://your.host
 * in the frontend build, or paste that URL in Settings → Research proxy.
 * Remote static-web callers must be listed in RESEARCH_PROXY_ALLOWED_ORIGINS —
 * same-origin (Host match), loopback, and app://openbentt callers are allowed
 * without configuration (see server/httpPolicy.mjs for the rationale).
 *
 * POST /research  Content-Type: application/json
 *   body: { query: string, urls?: string[], deepResearch?: boolean, approvedDomains?: string[] }
 * Response: { context: string, sources: { title, url?, snippet }[] }
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import {
  parseAllowedOrigins,
  isOriginAllowed,
  corsHeadersFor,
  clientIp,
  createRateLimiter,
  readBodyCapped,
  fetchWithTimeout,
  sendJson,
} from "./httpPolicy.mjs";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const BRAVE_KEY = process.env.BRAVE_SEARCH_API_KEY || "";
const JINA = "https://r.jina.ai/";
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.RESEARCH_PROXY_ALLOWED_ORIGINS);
const RATE_PER_MIN = Number(process.env.RESEARCH_PROXY_RATE_PER_MIN || 120);
const MAX_BODY_BYTES = Number(process.env.RESEARCH_PROXY_MAX_BODY_BYTES || 262_144);
const UPSTREAM_TIMEOUT_MS = Number(process.env.RESEARCH_PROXY_UPSTREAM_TIMEOUT_MS || 15_000);
const MAX_QUERY_CHARS = 2000;
const MAX_APPROVED_DOMAINS = 20;

const limiter = createRateLimiter({ perMin: Number.isFinite(RATE_PER_MIN) && RATE_PER_MIN > 0 ? RATE_PER_MIN : 120 });

function truncate(s, n) {
  return s.length <= n ? s : s.slice(0, n) + "\n…[truncated]";
}

async function wikipediaSummary(query) {
  const q = query.slice(0, 120).trim();
  if (!q) return null;
  const search = new URL("https://en.wikipedia.org/w/api.php");
  search.searchParams.set("action", "opensearch");
  search.searchParams.set("search", q);
  search.searchParams.set("limit", "1");
  search.searchParams.set("namespace", "0");
  search.searchParams.set("format", "json");
  search.searchParams.set("origin", "*");
  const os = await fetchWithTimeout(search, {}, UPSTREAM_TIMEOUT_MS);
  if (!os.ok) return null;
  const data = await os.json();
  const title = data?.[1]?.[0];
  if (!title) return null;
  const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const sr = await fetchWithTimeout(sumUrl, {}, UPSTREAM_TIMEOUT_MS);
  if (!sr.ok) return null;
  const page = await sr.json();
  return {
    kind: "wiki",
    title: page.title ?? title,
    url: page.content_urls?.desktop?.page,
    snippet: truncate(page.extract ?? "", 3500),
  };
}

async function semanticScholarSearch(query) {
  const q = query.slice(0, 200).trim();
  if (!q) return [];
  const u = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  u.searchParams.set("query", q);
  u.searchParams.set("limit", "2");
  u.searchParams.set("fields", "title,abstract,year,url,externalIds");
  const res = await fetchWithTimeout(u, {}, UPSTREAM_TIMEOUT_MS);
  if (!res.ok) return [];
  const json = await res.json();
  const data = json.data ?? [];
  return data
    .filter((p) => p.title)
    .map((p) => ({
      kind: "semantic_scholar",
      id: p.paperId,
      title: p.title,
      url: p.url,
      doi: p.externalIds?.DOI,
      snippet: truncate([String(p.year || ""), p.abstract].filter(Boolean).join(" — "), 800),
    }));
}

async function arxivSearch(query) {
  const q = query.slice(0, 120).trim();
  if (!q) return [];
  const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&max_results=2`;
  const res = await fetchWithTimeout(url, {}, UPSTREAM_TIMEOUT_MS);
  if (!res.ok) return [];
  const xml = await res.text();
  const out = [];
  const entryRe = /<entry>[\s\S]*?<\/entry>/g;
  const entries = xml.match(entryRe) ?? [];
  for (const ent of entries.slice(0, 2)) {
    const titleM = ent.match(/<title>([^<]*)<\/title>/);
    const idM = ent.match(/<id>([^<]*)<\/id>/);
    const summM = ent.match(/<summary>([^<]*)<\/summary>/);
    const title = titleM?.[1]?.replace(/\s+/g, " ").trim();
    const id = idM?.[1]?.trim();
    const summary = summM?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    if (title) {
      out.push({
        kind: "arxiv",
        id,
        title,
        url: id,
        snippet: truncate(summary, 1200),
      });
    }
  }
  return out;
}

async function jinaRead(url) {
  const target = `${JINA}${url}`;
  const res = await fetchWithTimeout(target, {}, UPSTREAM_TIMEOUT_MS);
  if (!res.ok) return null;
  const text = await res.text();
  return truncate(text, 6000);
}

async function braveSearch(query) {
  if (!BRAVE_KEY) return [];
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", query.slice(0, 400));
  u.searchParams.set("count", "5");
  const res = await fetchWithTimeout(
    u,
    {
      headers: { "X-Subscription-Token": BRAVE_KEY, Accept: "application/json" },
    },
    UPSTREAM_TIMEOUT_MS
  );
  if (!res.ok) return [];
  const json = await res.json();
  const results = json.web?.results ?? [];
  return results
    .filter((r) => r.title && r.url)
    .map((r) => ({
      kind: "web",
      title: r.title,
      url: r.url,
      snippet: truncate(r.description ?? "", 500),
    }));
}

function hostAllowed(hostname, approvedDomains) {
  const h = hostname.toLowerCase();
  return approvedDomains.some((d) => h === d || h.endsWith("." + d));
}

function sanitizeApprovedDomains(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((d) => typeof d === "string")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d && /^[a-z0-9.-]{1,253}$/.test(d))
    .slice(0, MAX_APPROVED_DOMAINS);
}

async function handleResearch(body) {
  const rawQuery = typeof body.query === "string" ? body.query : "";
  const query = rawQuery.slice(0, MAX_QUERY_CHARS);
  const urls = Array.isArray(body.urls) ? body.urls.filter((u) => typeof u === "string").slice(0, 2) : [];
  const deepResearch = body.deepResearch === true;
  const approvedDomains = sanitizeApprovedDomains(body.approvedDomains);
  const parts = [];
  const sources = [];

  const wiki = await wikipediaSummary(query);
  if (wiki) {
    sources.push(wiki);
    parts.push(`### Wikipedia\n**${wiki.title}**\n${wiki.snippet}`);
  }

  const s2 = await semanticScholarSearch(query);
  for (const p of s2) sources.push(p);
  if (s2.length) {
    parts.push(
      "### Semantic Scholar\n" +
        s2.map((p, i) => `${i + 1}. **${p.title}** ${p.doi ? `(DOI: ${p.doi})` : ""}\n   ${p.snippet}`).join("\n\n")
    );
  }

  const ax = await arxivSearch(query);
  for (const p of ax) sources.push(p);
  if (ax.length) {
    parts.push(
      "### arXiv\n" + ax.map((p, i) => `${i + 1}. **${p.title}**\n   ${p.snippet}`).join("\n\n")
    );
  }

  for (const url of urls) {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") continue;
      const text = await jinaRead(url);
      if (text) {
        sources.push({ title: `Page: ${url}`, url, snippet: text.slice(0, 400) });
        parts.push(`### Page\n**${url}**\n${text}`);
      }
    } catch {
      /* skip */
    }
  }

  let braveResults = [];
  if (BRAVE_KEY) {
    braveResults = await braveSearch(query);
    for (const b of braveResults) sources.push(b);
    if (braveResults.length) {
      parts.push(
        "### Web (Brave)\n" +
          braveResults.map((b, i) => `${i + 1}. **${b.title}** (${b.url})\n   ${b.snippet}`).join("\n\n")
      );
    }
  }

  if (deepResearch && approvedDomains.length > 0 && braveResults.length > 0) {
    let n = 0;
    for (const b of braveResults) {
      if (n >= 5 || !b.url) continue;
      try {
        const u = new URL(b.url);
        if (u.protocol !== "https:") continue;
        if (!hostAllowed(u.hostname, approvedDomains)) continue;
        const text = await jinaRead(b.url);
        if (text) {
          n++;
          sources.push({
            kind: "web",
            title: `Deep: ${b.title}`,
            url: b.url,
            snippet: text.slice(0, 400),
          });
          parts.push(`### Deep research (full page)\n**${b.title}**\n${u.hostname}\n\n${text}`);
        }
      } catch {
        /* skip */
      }
    }
  }

  return {
    context: truncate(parts.join("\n\n"), 14000),
    sources: sources.slice(0, 16),
  };
}

const server = http.createServer(async (req, res) => {
  const cors = corsHeadersFor(req, ALLOWED_ORIGINS);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...cors,
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && (!req.url || req.url === "/" || req.url.startsWith("/research"))) {
    res.writeHead(200, { "Content-Type": "text/plain", ...cors });
    res.end("research proxy: POST /research { query, urls }\n");
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/research")) {
    res.writeHead(404, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  // Phase 1 gates — cheap checks first, in order.
  const contentType = String(req.headers["content-type"] ?? "");
  if (!contentType.includes("application/json")) {
    res.writeHead(415, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "content-type must be application/json" }));
    return;
  }
  if (!isOriginAllowed(req, ALLOWED_ORIGINS)) {
    res.writeHead(403, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "origin not allowed" }));
    return;
  }
  const ip = clientIp(req);
  const limit = limiter.check(ip);
  if (!limit.ok) {
    res.writeHead(429, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "rate limited", retryAfterMs: limit.retryAfterMs }));
    return;
  }

  let raw;
  try {
    raw = await readBodyCapped(req, MAX_BODY_BYTES);
  } catch {
    // Over-cap uploads get their socket destroyed inside readBodyCapped, so no
    // response can reach the client; any other read failure is a 400.
    // (413 path kept explicit for logging clarity.)
    if (!req.destroyed) {
      res.writeHead(400, { "Content-Type": "application/json", ...cors });
      res.end(JSON.stringify({ error: "unreadable request body" }));
    }
    return;
  }

  let body = {};
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    res.writeHead(400, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "invalid JSON" }));
    return;
  }

  try {
    const out = await handleResearch(body);
    res.writeHead(200, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify(out));
  } catch (e) {
    // Never leak upstream details/keys — log server-side, return generic error.
    console.error("[research-proxy] request failed:", e instanceof Error ? e.message : e);
    res.writeHead(500, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "research failed" }));
  }
});

const certPath = process.env.CERT_PATH;
const keyPath = process.env.KEY_PATH;

// Importable without side effects for node --test (Phase 1).
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMainModule = invokedPath !== "" && fileURLToPath(import.meta.url) === path.resolve(invokedPath);

if (isMainModule) {
  if (certPath && keyPath) {
    const opts = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
    https.createServer(opts, server).listen(PORT, () => {
      console.error(`research proxy (HTTPS) https://localhost:${PORT}/research`);
    });
  } else {
    server.listen(PORT, HOST, () => {
      console.error(`research proxy (HTTP) http://${HOST}:${PORT}/research`);
      console.error("For production use HTTPS (set CERT_PATH + KEY_PATH) or a reverse proxy.");
    });
  }
}

export { server, handleResearch, isOriginAllowed, sanitizeApprovedDomains };
