/**
 * Phase 7 — Notion client (API v1, READ-ONLY). Plain-JS SSOT.
 * Official reference: https://developers.notion.com/reference/intro
 * Real endpoints: POST /search, GET /pages/{id}, GET /blocks/{id}/children.
 * Notion-Version pinned "2022-06-28" by the main-process executor.
 * No page-create/update paths exist here by design.
 */
import {
  clampPageSize,
  providerGetJson,
  providerPostJson,
  truncateSnippet,
} from "./providerHttp.mjs";
import { sanitizeText } from "../connectorCore.mjs";

export const NOTION_API_BASE = "https://api.notion.com/v1";
export const NOTION_VERSION = "2022-06-28";
const NOTION_ID_RE = /^[a-f0-9-]{16,64}$/i;

export function notionTitleOf(raw) {
  const props = raw.properties ?? {};
  for (const p of Object.values(props)) {
    if (p?.type === "title" && Array.isArray(p.title)) {
      const text = p.title.map((t) => t.plain_text ?? "").join("").trim();
      if (text) return sanitizeText(text, 1000);
    }
  }
  return "(untitled)";
}

export function normalizeNotionPage(raw) {
  const id = sanitizeText(raw.id, 64);
  if (!id) throw new Error("invalid-notion-page");
  return {
    kind: raw.object === "database" ? "database" : "page",
    id,
    title: notionTitleOf(raw),
    url: typeof raw.url === "string" ? raw.url.slice(0, 2000) : undefined,
    parentId: sanitizeText(raw.parent?.page_id, 64) || undefined,
  };
}

export async function notionVerifyConnection(fetchImpl) {
  const json = await providerGetJson(`${NOTION_API_BASE}/users?page_size=1`, fetchImpl);
  const first = Array.isArray(json.results) ? json.results[0] : undefined;
  return { accountLabel: sanitizeText(first?.name, 256) || "Notion workspace" };
}

export async function notionSearch(fetchImpl, query, args) {
  const q = truncateSnippet(query, 500) ?? "";
  if (!q) throw new Error("empty-query");
  const a = args ?? {};
  const json = await providerPostJson(`${NOTION_API_BASE}/search`, fetchImpl, {
    query: q,
    page_size: clampPageSize(a.pageSize, 20, 100),
    ...(a.cursor ? { start_cursor: a.cursor } : {}),
  });
  const results = Array.isArray(json.results) ? json.results : [];
  const out = [];
  for (const r of results.slice(0, 100)) {
    try {
      out.push(normalizeNotionPage(r));
    } catch {
      /* skip */
    }
  }
  return {
    items: out,
    nextCursor: json.has_more && json.next_cursor ? String(json.next_cursor) : undefined,
    rawCount: results.length,
  };
}

/**
 * Phase 8 — list recently-accessible pages/databases (POST /search with NO
 * query; the query field is optional per the Notion API and omitting it
 * returns everything the token can access, paginated). Used by background
 * sync; search remains the interactive path.
 */
export async function notionListPages(fetchImpl, args) {
  const a = args ?? {};
  const json = await providerPostJson(`${NOTION_API_BASE}/search`, fetchImpl, {
    page_size: clampPageSize(a.pageSize, 20, 100),
    ...(a.cursor ? { start_cursor: a.cursor } : {}),
    ...(a.filter ? { filter: a.filter } : {}),
  });
  const results = Array.isArray(json.results) ? json.results : [];
  const out = [];
  for (const r of results.slice(0, 100)) {
    try {
      out.push(normalizeNotionPage(r));
    } catch {
      /* skip */
    }
  }
  return {
    items: out,
    nextCursor: json.has_more && json.next_cursor ? String(json.next_cursor) : undefined,
    rawCount: results.length,
  };
}

export async function notionGetPage(fetchImpl, pageId) {
  if (!NOTION_ID_RE.test(String(pageId))) throw new Error("invalid-notion-id");
  return normalizeNotionPage(await providerGetJson(`${NOTION_API_BASE}/pages/${pageId}`, fetchImpl));
}

export async function notionReadBlocks(fetchImpl, blockId, args) {
  if (!NOTION_ID_RE.test(String(blockId))) throw new Error("invalid-notion-id");
  const a = args ?? {};
  const params = new URLSearchParams({ page_size: String(clampPageSize(a.pageSize, 50, 100)) });
  if (a.cursor) params.set("start_cursor", a.cursor);
  const json = await providerGetJson(`${NOTION_API_BASE}/blocks/${blockId}/children?${params}`, fetchImpl);
  const texts = [];
  for (const b of (Array.isArray(json.results) ? json.results : []).slice(0, 100)) {
    const payload = b?.[String(b?.type ?? "")];
    const text = Array.isArray(payload?.rich_text)
      ? payload.rich_text.map((t) => t.plain_text ?? "").join("")
      : "";
    if (text.trim()) texts.push(truncateSnippet(text, 2000) ?? "");
    if (texts.join("").length > 8000) break;
  }
  return {
    texts,
    nextCursor: json.has_more && json.next_cursor ? String(json.next_cursor) : undefined,
  };
}
