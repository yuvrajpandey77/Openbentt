/**
 * Phase 8 — actionCore tests: fingerprint binding, approval lifecycle,
 * target validation, previews, idempotency keys.
 */
import { describe, it, expect } from "vitest";
import {
  ACTION_APPROVAL_TTL_MS,
  actionFingerprint,
  approvalExpired,
  buildActionPreview,
  canonicalizeInput,
  isActionTool,
  isHighRiskAction,
  isValidIdempotencyKey,
  newIdempotencyKey,
  validateActionTarget,
  verifyApprovalForExecution,
} from "@/lib/actions/actionCore.mjs";

describe("action fingerprint", () => {
  it("is stable for identical input and key order", () => {
    const a = actionFingerprint("gmail.send", "proj", { to: ["a@x.com"], subject: "Hi", body: "Hello" });
    const b = actionFingerprint("gmail.send", "proj", { body: "Hello", subject: "Hi", to: ["a@x.com"] });
    expect(a).toEqual(b);
  });
  it("changes on any material parameter change", () => {
    const base = { to: ["a@x.com"], subject: "Hi", body: "Hello" };
    const fp = actionFingerprint("gmail.send", "proj", base);
    expect(actionFingerprint("gmail.send", "proj", { ...base, body: "Hello!" })).not.toEqual(fp);
    expect(actionFingerprint("gmail.send", "proj", { ...base, to: ["b@x.com"] })).not.toEqual(fp);
    expect(actionFingerprint("gmail.create_draft", "proj", base)).not.toEqual(fp);
    expect(actionFingerprint("gmail.send", "other", base)).not.toEqual(fp);
  });
  it("ignores idempotencyKey (transport, not material)", () => {
    const base = { to: ["a@x.com"], subject: "Hi", body: "Hello" };
    expect(actionFingerprint("gmail.send", "proj", { ...base, idempotencyKey: "idem_aaa" }))
      .toEqual(actionFingerprint("gmail.send", "proj", { ...base, idempotencyKey: "idem_bbb" }));
  });
  it("canonicalizes nested structures deterministically", () => {
    expect(canonicalizeInput({ b: 1, a: [3, 2] })).toEqual(canonicalizeInput({ a: [3, 2], b: 1 }));
  });
});

describe("approval lifecycle", () => {
  const approval = (over: Record<string, unknown> = {}) => ({
    id: "act_1",
    toolId: "gmail.send",
    fingerprint: actionFingerprint("gmail.send", "p1", { to: ["a@x.com"], subject: "Hi", body: "Yo" }),
    projectId: "p1",
    runId: "arun_1",
    status: "approved",
    createdAt: new Date().toISOString(),
    ...over,
  });
  const attempt = {
    toolId: "gmail.send",
    projectId: "p1",
    runId: "arun_1",
    input: { to: ["a@x.com"], subject: "Hi", body: "Yo" },
    now: Date.now(),
  };
  it("accepts exact matches", () => {
    expect(verifyApprovalForExecution(approval(), attempt).ok).toBe(true);
  });
  it("rejects changed input, tool, project, run, status", () => {
    expect(verifyApprovalForExecution(approval(), { ...attempt, toolId: "gmail.create_draft" }).ok).toBe(false);
    expect(verifyApprovalForExecution(approval(), { ...attempt, projectId: "p2" }).ok).toBe(false);
    expect(verifyApprovalForExecution(approval(), { ...attempt, runId: "arun_2" }).ok).toBe(false);
    expect(verifyApprovalForExecution(approval(), {
      ...attempt, input: { to: ["evil@x.com"], subject: "Hi", body: "Yo" },
    }).ok).toBe(false);
    expect(verifyApprovalForExecution(approval({ status: "proposed" }), attempt).ok).toBe(false);
    expect(verifyApprovalForExecution(approval({ status: "consumed" }), attempt).ok).toBe(false);
  });
  it("expires after TTL", () => {
    const old = approval({ createdAt: new Date(Date.now() - ACTION_APPROVAL_TTL_MS - 1000).toISOString() });
    expect(approvalExpired(old)).toBe(true);
    expect(verifyApprovalForExecution(old, attempt).ok).toBe(false);
  });
});

describe("target validation", () => {
  it("accepts valid targets", () => {
    expect(validateActionTarget("gmail.send", { to: ["a@x.com"], subject: "s", body: "b" })).toBe(null);
    expect(validateActionTarget("calendar.create_event", {
      title: "t", start: "2026-09-18T10:00:00Z", end: "2026-09-18T11:00:00Z",
    })).toBe(null);
    expect(validateActionTarget("slack.send_message", { channel: "C12345678", text: "hi" })).toBe(null);
    expect(validateActionTarget("github.create_issue", { repository: "acme/web", title: "bug" })).toBe(null);
    expect(validateActionTarget("github.create_pull_request", {
      repository: "acme/web", head: "fix", base: "main",
    })).toBe(null);
    expect(validateActionTarget("notion.create_page", { parentPageId: "abc-123", title: "t" })).toBe(null);
  });
  it("rejects dangerous/invalid targets", () => {
    expect(validateActionTarget("gmail.send", { to: ["not-an-email"], subject: "s", body: "b" })).not.toBe(null);
    expect(validateActionTarget("gmail.send", { to: [], subject: "s", body: "b" })).not.toBe(null);
    expect(validateActionTarget("calendar.create_event", {
      title: "t", start: "2026-09-18T11:00:00Z", end: "2026-09-18T10:00:00Z",
    })).not.toBe(null);
    expect(validateActionTarget("slack.send_message", { channel: "", text: "hi" })).not.toBe(null);
    expect(validateActionTarget("github.create_issue", { repository: "https://evil.com/x", title: "t" })).not.toBe(null);
    expect(validateActionTarget("github.create_pull_request", {
      repository: "acme/web", head: "main", base: "main",
    })).not.toBe(null);
    expect(validateActionTarget("notion.create_page", { title: "t" })).not.toBe(null);
    expect(validateActionTarget("shell.exec" as never, {})).not.toBe(null);
  });
});

describe("preview + inventory", () => {
  it("builds previews strictly from arguments", () => {
    const lines = buildActionPreview("github.create_issue", {
      repository: "acme/web", title: "Bug", body: "Details",
    });
    expect(lines.map((l) => l.label)).toContain("Repository");
    expect(lines.find((l) => l.label === "Title")?.value).toBe("Bug");
  });
  it("classifies tools", () => {
    expect(isActionTool("gmail.send")).toBe(true);
    expect(isActionTool("knowledge.search")).toBe(false);
    expect(isHighRiskAction("gmail.send")).toBe(true);
    expect(isHighRiskAction("github.create_pull_request")).toBe(true);
    expect(isHighRiskAction("gmail.create_draft")).toBe(false);
  });
  it("validates idempotency keys", () => {
    expect(isValidIdempotencyKey(newIdempotencyKey())).toBe(true);
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("has spaces!!")).toBe(false);
  });
});
