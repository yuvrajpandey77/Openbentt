/**
 * Phase 7 — Slack client (Web API, READ-ONLY). Plain-JS SSOT.
 * Official reference: https://api.slack.com/methods
 * Real endpoints: auth.test (verify), conversations.list,
 * conversations.history, search.messages. No chat.postMessage/update/delete.
 */
import {
  clampPageSize,
  providerGetJson,
  truncateSnippet,
} from "./providerHttp.mjs";
import { sanitizeText } from "../connectorCore.mjs";

export const SLACK_API_BASE = "https://slack.com/api";
const CHANNEL_RE = /^[A-Z0-9]{5,32}$/;

export async function slackCall(fetchImpl, method, params) {
  if (!/^[a-z_]+\.[a-z_]+$/.test(method)) throw new Error("invalid-slack-method");
  const url = new URL(`${SLACK_API_BASE}/${method}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v).slice(0, 2000));
  const json = await providerGetJson(url.toString(), fetchImpl);
  if (json?.ok !== true) {
    const err = sanitizeText(json?.error, 64) || "slack_error";
    if (err === "ratelimited") throw Object.assign(new Error("rate_limited"), { kind: "rate_limited" });
    if (err === "invalid_auth" || err === "token_revoked" || err === "account_inactive") {
      throw Object.assign(new Error("authentication_failed"), { kind: "authentication_failed" });
    }
    if (err === "missing_scope" || err === "not_allowed_token_type") {
      throw Object.assign(new Error("permission_denied"), { kind: "permission_denied" });
    }
    if (err === "channel_not_found") throw Object.assign(new Error("not_found"), { kind: "not_found" });
    throw new Error(`slack-${err}`);
  }
  return json;
}

export async function slackVerifyConnection(fetchImpl) {
  const json = await slackCall(fetchImpl, "auth.test", {});
  const team = sanitizeText(json?.team, 256);
  const user = sanitizeText(json?.user, 256);
  if (!team && !user) throw new Error("slack-verify-failed");
  return { accountLabel: team || user || "Slack workspace", team, user };
}

export async function slackListChannels(fetchImpl, args) {
  const a = args ?? {};
  const json = await slackCall(fetchImpl, "conversations.list", {
    types: "public_channel,private_channel",
    exclude_archived: "true",
    limit: String(clampPageSize(a.limit, 100, 200)),
    ...(a.cursor ? { cursor: a.cursor } : {}),
  });
  const channels = Array.isArray(json.channels) ? json.channels : [];
  return {
    items: channels.map((c) => ({
      kind: "channel",
      id: sanitizeText(c.id, 64),
      title: `#${sanitizeText(c.name, 300) || c.id}`,
      snippet: truncateSnippet(c.purpose?.value),
    })),
    nextCursor: json.response_metadata?.next_cursor || undefined,
    rawCount: channels.length,
  };
}

export function normalizeSlackMessage(raw, channelId) {
  const ts = sanitizeText(raw.ts, 64);
  const text = truncateSnippet(raw.text, 2000);
  if (!ts) throw new Error("invalid-slack-message");
  return {
    kind: "message",
    id: `${channelId}:${ts}`,
    channelId,
    title: text ? text.slice(0, 120) : `(message ${ts})`,
    snippet: text,
    user: sanitizeText(raw.user, 128) || undefined,
    ts,
  };
}

export async function slackReadHistory(fetchImpl, args) {
  if (!CHANNEL_RE.test(args.channelId)) throw new Error("invalid-channel-id");
  const json = await slackCall(fetchImpl, "conversations.history", {
    channel: args.channelId,
    limit: String(clampPageSize(args.limit)),
    ...(args.cursor ? { cursor: args.cursor } : {}),
    ...(args.oldest ? { oldest: args.oldest } : {}),
  });
  const messages = Array.isArray(json.messages) ? json.messages : [];
  const out = [];
  for (const m of messages.slice(0, 100)) {
    if (m.subtype && m.subtype !== "bot_message") continue;
    try {
      out.push(normalizeSlackMessage(m, args.channelId));
    } catch {
      /* skip */
    }
  }
  return { items: out, nextCursor: json.response_metadata?.next_cursor || undefined, rawCount: messages.length };
}

export async function slackSearch(fetchImpl, query, args) {
  const q = truncateSnippet(query, 500) ?? "";
  if (!q) throw new Error("empty-query");
  const a = args ?? {};
  const json = await slackCall(fetchImpl, "search.messages", {
    query: q,
    count: String(clampPageSize(a.count, 20, 100)),
    page: String(Math.min(100, Math.max(1, Number(a.page ?? 1)))),
  });
  const matches = Array.isArray(json.messages?.matches) ? json.messages.matches : [];
  return {
    items: matches.slice(0, 100).map((m) => ({
      kind: "message",
      id: `${sanitizeText(m.channel?.id, 64)}:${sanitizeText(m.ts, 64)}`,
      channelId: sanitizeText(m.channel?.id, 64) || undefined,
      title: truncateSnippet(m.text, 120) || `(match ${m.ts})`,
      snippet: truncateSnippet(m.text),
      user: sanitizeText(m.user, 128) || undefined,
      ts: sanitizeText(m.ts, 64) || undefined,
      permalink: typeof m.permalink === "string" ? m.permalink.slice(0, 2000) : undefined,
    })),
    rawCount: matches.length,
  };
}
