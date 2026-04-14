/**
 * Minimal HTTPS research proxy for Brave + Wikipedia + Jina (server-side, no CORS).
 *
 * Usage (dev, self-signed ok for local only):
 *   BRAVE_SEARCH_API_KEY=... node server/research-proxy.mjs
 *   # defaults: PORT=8787, uses TLS if CERT_PATH and KEY_PATH are set
 *
 * Deploy: put behind nginx/Caddy with HTTPS; set VITE_RESEARCH_PROXY_URL=https://your.host
 * in the frontend build, or paste that URL in Settings → Research proxy.
 *
 * POST /research  JSON body: { query: string, urls?: string[] }
 * Response: { context: string, sources: { title, url?, snippet }[] }
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const BRAVE_KEY = process.env.BRAVE_SEARCH_API_KEY || "";
const JINA = "https://r.jina.ai/";

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
  const os = await fetch(search);
  if (!os.ok) return null;
  const data = await os.json();
  const title = data?.[1]?.[0];
  if (!title) return null;
  const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const sr = await fetch(sumUrl);
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
  const res = await fetch(u);
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
  const res = await fetch(url);
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
  const res = await fetch(target);
  if (!res.ok) return null;
  const text = await res.text();
  return truncate(text, 6000);
}

async function braveSearch(query) {
  if (!BRAVE_KEY) return [];
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", query.slice(0, 400));
  u.searchParams.set("count", "5");
  const res = await fetch(u, {
    headers: { "X-Subscription-Token": BRAVE_KEY, Accept: "application/json" },
  });
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

async function handleResearch(body) {
  const query = typeof body.query === "string" ? body.query : "";
  const urls = Array.isArray(body.urls) ? body.urls.filter((u) => typeof u === "string").slice(0, 2) : [];
  const deepResearch = body.deepResearch === true;
  const approvedDomains = Array.isArray(body.approvedDomains)
    ? body.approvedDomains.filter((d) => typeof d === "string" && d.trim()).map((d) => d.trim().toLowerCase())
    : [];
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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/research")) {
    res.writeHead(req.method === "GET" ? 200 : 404, { "Content-Type": "text/plain" });
    res.end(req.method === "GET" ? "research proxy: POST /research { query, urls }\n" : "Not found");
    return;
  }

  let raw = "";
  for await (const ch of req) raw += ch;
  let body = {};
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid JSON" }));
    return;
  }

  try {
    const out = await handleResearch(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : "error" }));
  }
});

const certPath = process.env.CERT_PATH;
const keyPath = process.env.KEY_PATH;

if (certPath && keyPath) {
  const opts = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  https.createServer(opts, server).listen(PORT, () => {
    console.error(`research proxy (HTTPS) https://localhost:${PORT}/research`);
  });
} else {
  server.listen(PORT, () => {
    console.error(`research proxy (HTTP) http://127.0.0.1:${PORT}/research`);
    console.error("For production use HTTPS (set CERT_PATH + KEY_PATH) or a reverse proxy.");
  });
}
