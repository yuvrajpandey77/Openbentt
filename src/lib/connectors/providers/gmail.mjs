/**
 * Phase 7 — Gmail client (Gmail API v1, READ-ONLY). Plain-JS SSOT.
 * Official reference: https://developers.google.com/gmail/api/reference/rest
 * Real endpoints: users.getProfile (verify), users.messages.list,
 * users.threads.get, users.messages.get (metadata/bounded full).
 * No send/modify/delete paths exist here by design.
 */
import {
  clampPageSize,
  providerGetJson,
  truncateSnippet,
} from "./providerHttp.mjs";
import { sanitizeText } from "../connectorCore.mjs";

export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";
export const GMAIL_PROFILE_URL = `${GMAIL_API_BASE}/users/me/profile`;

const GMAIL_ID_RE = /^[a-zA-Z0-9_-]{1,256}$/;

export function gmailMessagesListUrl(args) {
  const a = args ?? {};
  const url = new URL(`${GMAIL_API_BASE}/users/me/messages`);
  if (a.query?.trim()) url.searchParams.set("q", a.query.trim().slice(0, 500));
  url.searchParams.set("maxResults", String(clampPageSize(a.pageSize)));
  if (a.pageToken) url.searchParams.set("pageToken", a.pageToken);
  return url.toString();
}

export function gmailMessageUrl(messageId, format = "metadata") {
  if (!GMAIL_ID_RE.test(String(messageId))) throw new Error("invalid-gmail-id");
  const url = new URL(`${GMAIL_API_BASE}/users/me/messages/${messageId}`);
  url.searchParams.set("format", format === "full" ? "full" : "metadata");
  if (format !== "full") url.searchParams.set("metadataHeaders", "From,To,Subject,Date");
  return url.toString();
}

export function gmailThreadUrl(threadId) {
  if (!GMAIL_ID_RE.test(String(threadId))) throw new Error("invalid-gmail-id");
  const url = new URL(`${GMAIL_API_BASE}/users/me/threads/${threadId}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.set("metadataHeaders", "From,To,Subject,Date");
  return url.toString();
}

function headerValue(headers, name) {
  const h = (headers ?? []).find((x) => String(x?.name ?? "").toLowerCase() === name);
  return h?.value ? sanitizeText(h.value, 500) : undefined;
}

export function normalizeGmailMessage(raw) {
  const id = sanitizeText(raw.id, 256);
  if (!id) throw new Error("invalid-gmail-message");
  const payload = raw.payload ?? {};
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const subject = headerValue(headers, "subject");
  return {
    kind: "message",
    id,
    threadId: sanitizeText(raw.threadId, 256) || undefined,
    title: subject || truncateSnippet(raw.snippet, 200) || "(no subject)",
    snippet: truncateSnippet(raw.snippet),
    from: headerValue(headers, "from"),
    to: headerValue(headers, "to"),
    subject,
    date: headerValue(headers, "date"),
    labelIds: Array.isArray(raw.labelIds) ? raw.labelIds.map((l) => sanitizeText(l, 64)).slice(0, 32) : [],
  };
}

export async function gmailVerifyConnection(fetchImpl) {
  const json = await providerGetJson(GMAIL_PROFILE_URL, fetchImpl);
  const label = sanitizeText(json?.emailAddress, 256);
  if (!label) throw new Error("gmail-verify-failed");
  return { accountLabel: label };
}

export async function gmailSearch(fetchImpl, query, args) {
  const a = args ?? {};
  const json = await providerGetJson(gmailMessagesListUrl({ query, pageSize: a.pageSize, pageToken: a.pageToken }), fetchImpl);
  const messages = Array.isArray(json.messages) ? json.messages : [];
  return {
    items: messages.slice(0, 100).map((m) => ({
      id: sanitizeText(m.id, 256),
      threadId: m.threadId ? sanitizeText(m.threadId, 256) : undefined,
    })),
    nextCursor: json.nextPageToken,
    rawCount: messages.length,
  };
}

export async function gmailGetMessage(fetchImpl, messageId, full = false) {
  return normalizeGmailMessage(await providerGetJson(gmailMessageUrl(messageId, full ? "full" : "metadata"), fetchImpl));
}
