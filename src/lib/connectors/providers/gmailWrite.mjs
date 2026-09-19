/**
 * Phase 8 — Gmail write client (Gmail API v1, REAL endpoints).
 * Official reference: https://developers.google.com/gmail/api/reference/rest
 * Endpoints: users.drafts.create, users.messages.send.
 * Messages are RFC 2822 MIME encoded with base64url (raw).
 * Plain-JS SSOT. No secrets here: bearer attaches main-side.
 */
import { providerPostJson } from "./providerHttp.mjs";
import { sanitizeText } from "../connectorCore.mjs";

export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";
export const GMAIL_DRAFTS_CREATE_URL = `${GMAIL_API_BASE}/users/me/drafts`;
export const GMAIL_MESSAGES_SEND_URL = `${GMAIL_API_BASE}/users/me/messages/send`;

function base64UrlEncodeText(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function headerLine(name, value) {
  // Strip CR/LF to prevent header injection; validated upstream as well.
  const clean = String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  return `${name}: ${clean}`;
}

/**
 * Build an RFC 2822 plain-text message. Pure (testable, no network).
 * Returns the base64url "raw" payload for drafts.create / messages.send.
 */
export function buildGmailRawMessage({ to, cc, bcc, subject, body }) {
  const lines = [
    headerLine("To", (to ?? []).join(", ")),
    ...(cc?.length ? [headerLine("Cc", cc.join(", "))] : []),
    ...(bcc?.length ? [headerLine("Bcc", bcc.join(", "))] : []),
    headerLine("Subject", subject ?? ""),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    String(body ?? ""),
  ];
  return base64UrlEncodeText(lines.join("\r\n"));
}

export function parseGmailDraftResponse(json) {
  const id = sanitizeText(json?.id, 256);
  const messageId = sanitizeText(json?.message?.id, 256);
  if (!id) throw new Error("invalid-gmail-draft-response");
  return { draftId: id, messageId: messageId || undefined };
}

export function parseGmailSendResponse(json) {
  const id = sanitizeText(json?.id, 256);
  if (!id) throw new Error("invalid-gmail-send-response");
  return {
    messageId: id,
    threadId: sanitizeText(json?.threadId, 256) || undefined,
    labelIds: Array.isArray(json?.labelIds)
      ? json.labelIds.map((l) => sanitizeText(l, 64)).filter(Boolean).slice(0, 32)
      : [],
  };
}

/** Create a Gmail draft. Returns { draftId, messageId }. */
export async function gmailCreateDraft(fetchImpl, args) {
  const raw = buildGmailRawMessage(args ?? {});
  const json = await providerPostJson(GMAIL_DRAFTS_CREATE_URL, fetchImpl, {
    message: { raw },
  });
  return parseGmailDraftResponse(json);
}

/** Send a Gmail message. Returns { messageId, threadId, labelIds }. */
export async function gmailSendMessage(fetchImpl, args) {
  const raw = buildGmailRawMessage(args ?? {});
  const json = await providerPostJson(GMAIL_MESSAGES_SEND_URL, fetchImpl, { raw });
  return parseGmailSendResponse(json);
}
