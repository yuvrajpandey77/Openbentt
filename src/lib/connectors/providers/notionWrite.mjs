/**
 * Phase 8 — Notion write client (Notion API v1, REAL endpoint).
 * Official reference: https://developers.notion.com/reference/post-page
 * Endpoint: POST /v1/pages. Plain-JS SSOT. No secrets here.
 * Notion-Version header attaches main-side (see connectorAuthStore).
 */
import { providerPostJson } from "./providerHttp.mjs";
import { sanitizeText } from "../connectorCore.mjs";

export const NOTION_API_BASE = "https://api.notion.com/v1";
export const NOTION_PAGES_CREATE_URL = `${NOTION_API_BASE}/pages`;

const NOTION_ID_RE = /^[a-zA-Z0-9-]{1,64}$/;

function assertNotionId(value, field) {
  const v = String(value ?? "").trim();
  if (!NOTION_ID_RE.test(v)) throw new Error(`invalid-notion-${field}`);
  return v;
}

/** Build a pages.create body from validated action input. Pure. */
export function buildNotionPageBody(input) {
  const v = input ?? {};
  const title = String(v.title ?? "").slice(0, 500);
  const content = typeof v.content === "string" ? v.content.slice(0, 4000) : "";
  const titleProp = typeof v.titleProperty === "string" && v.titleProperty
    ? v.titleProperty.slice(0, 100)
    : "title";
  const properties = {
    [titleProp]: { title: [{ text: { content: title } }] },
  };
  const children = content
    ? content.split(/\n{2,}/).slice(0, 20).map((para) => ({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ type: "text", text: { content: para.slice(0, 2000) } }] },
    }))
    : [];
  if (v.parentPageId) {
    return {
      parent: { page_id: assertNotionId(v.parentPageId, "parent") },
      properties,
      children,
    };
  }
  return {
    parent: { database_id: assertNotionId(v.parentDatabaseId, "database") },
    properties,
    children,
  };
}

export function parseNotionPageResponse(json) {
  const id = sanitizeText(json?.id, 64);
  if (!id || !NOTION_ID_RE.test(id)) throw new Error("invalid-notion-page-response");
  return {
    pageId: id,
    url: typeof json?.url === "string" ? json.url.slice(0, 2000) : undefined,
    createdTime: sanitizeText(json?.created_time, 64) || undefined,
  };
}

/** Create a Notion page. Returns { pageId, url, createdTime }. */
export async function notionCreatePage(fetchImpl, input) {
  const json = await providerPostJson(NOTION_PAGES_CREATE_URL, fetchImpl, buildNotionPageBody(input));
  return parseNotionPageResponse(json);
}
