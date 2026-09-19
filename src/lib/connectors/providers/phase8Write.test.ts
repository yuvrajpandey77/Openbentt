/**
 * Phase 8 — provider write-client tests (deterministic fixtures, no network).
 * URL/body builders + response parsers only; transport is injected.
 */
import { describe, it, expect } from "vitest";
import {
  buildGmailRawMessage,
  GMAIL_DRAFTS_CREATE_URL,
  GMAIL_MESSAGES_SEND_URL,
  parseGmailDraftResponse,
  parseGmailSendResponse,
} from "@/lib/connectors/providers/gmailWrite.mjs";
import {
  buildCalendarEventBody,
  calendarEventInsertUrl,
  parseCalendarEventResponse,
} from "@/lib/connectors/providers/googleCalendarWrite.mjs";
import {
  buildSlackPostBody,
  parseSlackPostResponse,
  SLACK_POST_MESSAGE_URL,
} from "@/lib/connectors/providers/slackWrite.mjs";
import {
  assertRepoSlug,
  buildGithubIssueBody,
  buildGithubPullBody,
  githubCreateIssueUrl,
  githubCreatePullUrl,
  parseGithubIssueResponse,
  parseGithubPullResponse,
} from "@/lib/connectors/providers/githubWrite.mjs";
import {
  buildNotionPageBody,
  NOTION_PAGES_CREATE_URL,
  parseNotionPageResponse,
} from "@/lib/connectors/providers/notionWrite.mjs";

function b64urlDecode(raw: string): string {
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

describe("gmail write client", () => {
  it("builds real endpoint URLs", () => {
    expect(GMAIL_DRAFTS_CREATE_URL).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect(GMAIL_MESSAGES_SEND_URL).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
  });
  it("builds a header-injection-safe RFC2822 raw message", () => {
    const raw = buildGmailRawMessage({
      to: ["a@x.com"], subject: "Hi\r\nBcc: evil@x.com", body: "Hello",
    });
    const text = b64urlDecode(raw);
    expect(text).toContain("To: a@x.com");
    expect(text).not.toContain("\r\nBcc: evil");
    expect(text).toContain("Hello");
  });
  it("parses provider responses, rejects malformed", () => {
    expect(parseGmailDraftResponse({ id: "d1", message: { id: "m1" } })).toEqual({ draftId: "d1", messageId: "m1" });
    expect(() => parseGmailDraftResponse({})).toThrow();
    expect(parseGmailSendResponse({ id: "m9", threadId: "t1", labelIds: ["SENT"] }).messageId).toBe("m9");
    expect(() => parseGmailSendResponse({})).toThrow();
  });
});

describe("calendar write client", () => {
  it("targets events.insert on the chosen calendar", () => {
    expect(calendarEventInsertUrl("primary")).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  });
  it("builds a bounded body and parses responses", () => {
    const body = buildCalendarEventBody({
      title: "Sync", start: "2026-09-18T10:00:00Z", end: "2026-09-18T11:00:00Z",
      attendees: ["a@x.com"],
    });
    expect(body.summary).toBe("Sync");
    expect(body.attendees).toEqual([{ email: "a@x.com" }]);
    expect(parseCalendarEventResponse({ id: "e1", htmlLink: "https://x", status: "confirmed" }).eventId).toBe("e1");
    expect(() => parseCalendarEventResponse({})).toThrow();
  });
});

describe("slack write client", () => {
  it("targets chat.postMessage and refuses error payloads", () => {
    expect(SLACK_POST_MESSAGE_URL).toBe("https://slack.com/api/chat.postMessage");
    expect(buildSlackPostBody({ channel: "C123", text: "hi" })).toEqual({ channel: "C123", text: "hi" });
    expect(parseSlackPostResponse({ ok: true, channel: "C123", ts: "1.2" }).ts).toBe("1.2");
    expect(() => parseSlackPostResponse({ ok: false, error: "channel_not_found" })).toThrow(/channel_not_found/);
  });
});

describe("github write client", () => {
  it("validates repo slugs (owner/name only — no URLs)", () => {
    expect(assertRepoSlug("acme/web")).toBe("acme/web");
    expect(() => assertRepoSlug("https://github.com/acme/web")).toThrow();
    expect(() => assertRepoSlug("../../etc")).toThrow();
  });
  it("targets issues + pulls endpoints", () => {
    expect(githubCreateIssueUrl("acme/web")).toBe("https://api.github.com/repos/acme/web/issues");
    expect(githubCreatePullUrl("acme/web")).toBe("https://api.github.com/repos/acme/web/pulls");
  });
  it("builds bounded bodies and parses responses", () => {
    expect(buildGithubIssueBody({ title: "t", labels: ["bug"] })).toEqual({ title: "t", labels: ["bug"] });
    expect(buildGithubPullBody({ head: "fix", base: "main", draft: true }).draft).toBe(true);
    const issue = parseGithubIssueResponse({ id: 1, number: 421, html_url: "https://github.com/x/421", state: "open" });
    expect(issue.number).toBe(421);
    expect(() => parseGithubIssueResponse({})).toThrow();
    const pr = parseGithubPullResponse({ id: 2, number: 7, html_url: "https://github.com/x/7", state: "open" });
    expect(pr.number).toBe(7);
    expect(() => parseGithubPullResponse({ id: 2 })).toThrow();
  });
});

describe("notion write client", () => {
  it("targets pages.create and requires a parent", () => {
    expect(NOTION_PAGES_CREATE_URL).toBe("https://api.notion.com/v1/pages");
    const body = buildNotionPageBody({ parentPageId: "abc-123", title: "Hello", content: "World" });
    expect(body.parent).toEqual({ page_id: "abc-123" });
    expect(body.children.length).toBe(1);
    expect(() => buildNotionPageBody({ title: "orphan" } as never)).toThrow();
    expect(parseNotionPageResponse({ id: "abc-123", url: "https://notion.so/x" }).pageId).toBe("abc-123");
    expect(() => parseNotionPageResponse({})).toThrow();
  });
});
