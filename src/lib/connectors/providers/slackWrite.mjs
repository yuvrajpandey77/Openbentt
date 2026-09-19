/**
 * Phase 8 — Slack write client (Slack Web API, REAL endpoint).
 * Official reference: https://api.slack.com/methods/chat.postMessage
 * Endpoint: chat.postMessage. Plain-JS SSOT. No secrets here.
 * NOTE: Slack offers no draft API; "draft" for Slack is a local-only preview
 * in the Openbentt UI and is never presented as a provider-side draft.
 */
import { providerPostJson } from "./providerHttp.mjs";
import { sanitizeText } from "../connectorCore.mjs";

export const SLACK_API_BASE = "https://slack.com/api";
export const SLACK_POST_MESSAGE_URL = `${SLACK_API_BASE}/chat.postMessage`;

/** Build a chat.postMessage body from validated action input. Pure. */
export function buildSlackPostBody(input) {
  const v = input ?? {};
  return {
    channel: String(v.channel ?? "").trim().slice(0, 80),
    text: String(v.text ?? "").slice(0, 4000),
    ...(typeof v.threadTs === "string" && v.threadTs ? { thread_ts: v.threadTs.slice(0, 64) } : {}),
  };
}

export function parseSlackPostResponse(json) {
  if (json?.ok !== true) {
    const err = sanitizeText(json?.error, 128) || "slack_error";
    throw new Error(`slack-post-failed: ${err}`);
  }
  return {
    channel: sanitizeText(json?.channel, 80) || undefined,
    ts: sanitizeText(json?.ts, 64) || undefined,
    messageText: typeof json?.message?.text === "string"
      ? json.message.text.slice(0, 500)
      : undefined,
  };
}

/** Post a Slack message. Returns { channel, ts, messageText }. */
export async function slackPostMessage(fetchImpl, input) {
  const json = await providerPostJson(SLACK_POST_MESSAGE_URL, fetchImpl, buildSlackPostBody(input));
  return parseSlackPostResponse(json);
}
