/**
 * Phase 7 — enterprise connector UNIT TESTS (deterministic fixtures only).
 * These tests cover URL builders, normalizers, error mapping, OAuth state,
 * and policy wiring. They are NOT live provider tests: no test here contacts
 * a real provider (stubbed fetch only). Live verification requires operator
 * OAuth credentials — see docs/OPENBENTT_PHASE_7_INTEGRATIONS.md.
 */
import { describe, expect, it, vi } from "vitest";
import {
  canTransitionConnection,
  CONNECTION_STATES,
  externalResourceId,
  initialConnectionState,
  isKnownSyncStage,
  SYNC_STAGES,
  transitionConnection,
  validateExternalResource,
} from "@/lib/connectors/connectorCore.mjs";
import { getEnterpriseMeta, listEnterpriseMeta } from "@/lib/connectors/enterpriseConnectors";
import {
  buildAuthorizeUrl,
  isTokenExpired,
  newCodeVerifier,
  newOAuthState,
  parseOAuthCallback,
  pkceChallenge,
  providerErrorKind,
  validateOAuthState,
} from "@/lib/connectors/oauthCore";
import { driveFileUrl, driveKindFor, driveListUrl, normalizeDriveFile } from "@/lib/connectors/providers/googleDrive.mjs";
import { gmailMessageUrl, normalizeGmailMessage } from "@/lib/connectors/providers/gmail.mjs";
import { normalizeCalendarEvent } from "@/lib/connectors/providers/googleCalendar.mjs";
import { normalizeSlackMessage } from "@/lib/connectors/providers/slack.mjs";
import { githubUrl } from "@/lib/connectors/providers/github.mjs";
import { notionTitleOf } from "@/lib/connectors/providers/notion.mjs";
import { assertProviderUrl, clampPageSize, providerGetJson } from "@/lib/connectors/providers/providerHttp.mjs";
import { hitFromResource, mapExternalResourceToKnowledge, unifiedSearch } from "@/lib/connectors/unifiedSearch";

function jsonResponse(body: unknown, status = 200, contentType = "application/json") {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, { status, headers: { "content-type": contentType } });
}

describe("enterprise metadata", () => {
  it("registers six Tier-1 connectors with read-only scopes", () => {
    const ids = listEnterpriseMeta().map((m) => m.id).sort();
    expect(ids).toEqual(["github", "gmail", "google-calendar", "google-drive", "notion", "slack"]);
    for (const m of listEnterpriseMeta()) {
      expect(m.apiBase).toMatch(/^https:\/\//);
      expect(m.docsUrl).toMatch(/^https:\/\//);
      // Requested scopes must never include write/send/modify powers.
      for (const s of m.scopes) {
        expect(s).not.toMatch(/send|modify|delete|write/i);
      }
      expect(m.supportedResources.length).toBeGreaterThan(0);
    }
    expect(() => getEnterpriseMeta("dropbox")).toThrow();
  });
});

describe("connection state machine", () => {
  it("starts disconnected and transitions explicitly", () => {
    const s0 = initialConnectionState("gmail");
    expect(s0.status).toBe("DISCONNECTED");
    expect(CONNECTION_STATES).toContain("AUTH_REQUIRED");
    const s1 = transitionConnection(s0, "CONNECTING");
    expect(s1.status).toBe("CONNECTING");
    const s2 = transitionConnection(s1, "CONNECTED", { accountLabel: "a@b.c" });
    expect(s2.accountLabel).toBe("a@b.c");
    expect(() => transitionConnection(s0, "CONNECTED")).toThrow();
    expect(canTransitionConnection("SYNCED", "SYNCING")).toBe(true);
    expect(canTransitionConnection("CONNECTED", "CONNECTED")).toBe(false);
  });
  it("declares the nine sync stages", () => {
    expect(SYNC_STAGES).toEqual([
      "DISCOVER", "FETCH", "NORMALIZE", "IDENTITY", "DEDUPLICATE", "IMPORT", "INDEX", "ONTOLOGY", "AUDIT",
    ]);
    expect(isKnownSyncStage("ONTOLOGY")).toBe(true);
    expect(isKnownSyncStage("TELEPORT")).toBe(false);
  });
});

describe("unified external resource", () => {
  it("validates and rejects unknown connectors", () => {
    const r = validateExternalResource({
      id: "x", connectorId: "github", provider: "github", externalId: "1",
      type: "issue", title: "Bug", url: "https://api.github.com/repos/o/r/issues/1",
    });
    expect(r.provenance.connectorId).toBe("github");
    expect(r.provenance.resourceType).toBe("issue");
    expect(() => validateExternalResource({ id: "x", connectorId: "dropbox", provider: "d", externalId: "1", type: "file" })).toThrow();
    expect(() => validateExternalResource(null)).toThrow();
  });
  it("builds stable resource ids", () => {
    expect(externalResourceId("github", "1")).toBe(externalResourceId("github", "1"));
    expect(externalResourceId("github", "1")).not.toBe(externalResourceId("github", "2"));
  });
});

describe("OAuth core", () => {
  it("issues single-purpose CSRF state", () => {
    const s = newOAuthState("slack");
    expect(s.raw).toMatch(/^[0-9a-f]{64}$/);
    expect(validateOAuthState(s, s.raw)).toBe(true);
    expect(validateOAuthState(s, `${s.raw.slice(0, 63)}0`)).toBe(false);
    expect(validateOAuthState(s, s.raw, Date.now() + 11 * 60 * 1000)).toBe(false);
  });
  it("builds least-privilege authorize URLs (scopes from registry)", () => {
    const s = newOAuthState("google-drive", "proj_1");
    const url = buildAuthorizeUrl({ connectorId: "google-drive", clientId: "cid", redirectUri: "http://127.0.0.1:9876/oauth/callback", state: s });
    expect(url).toContain("accounts.google.com");
    expect(url).toContain(encodeURIComponent("drive.readonly"));
    expect(url).not.toContain("gmail.send");
    expect(() => buildAuthorizeUrl({ connectorId: "dropbox", clientId: "c", redirectUri: "r", state: s })).toThrow();
  });
  it("parses callbacks fail-closed", () => {
    const s = newOAuthState("github");
    expect(parseOAuthCallback({ expected: s, query: { state: s.raw, code: "abc" } })).toBe("abc");
    expect(() => parseOAuthCallback({ expected: s, query: { state: "wrong", code: "abc" } })).toThrow(/state/);
    expect(() => parseOAuthCallback({ expected: s, query: { state: s.raw, error: "access_denied" } })).toThrow(/provider-error/);
  });
  it("pkce + expiry helpers", async () => {
    const v = newCodeVerifier();
    expect(v.length).toBeGreaterThan(40);
    const c = await pkceChallenge(v);
    expect(c).not.toContain("+");
    expect(isTokenExpired(Date.now() + 3600_000)).toBe(false);
    expect(isTokenExpired(Date.now() - 1000)).toBe(true);
    expect(isTokenExpired(undefined)).toBe(true);
    expect(providerErrorKind(401)).toBe("reauth_required");
    expect(providerErrorKind(429)).toBe("rate_limited");
  });
});

describe("provider HTTP guards (stubbed fetch UNIT TESTS)", () => {
  it("rejects non-allowlisted hosts (SSRF)", () => {
    expect(() => assertProviderUrl("https://evil.example/x")).toThrow();
    expect(() => assertProviderUrl("http://api.github.com/x")).toThrow();
    expect(assertProviderUrl("https://api.github.com/user")).toContain("api.github.com");
    expect(assertProviderUrl("https://drive.google.com/x")).toContain("drive.google.com");
  });
  it("maps 401/429/oversized/non-JSON fail-closed", async () => {
    const fetch401 = vi.fn(async () => jsonResponse({}, 401));
    await expect(providerGetJson("https://api.github.com/user", fetch401)).rejects.toMatchObject({ kind: "authentication_failed" });
    const fetch429 = vi.fn(async () => jsonResponse({}, 429));
    await expect(providerGetJson("https://api.github.com/user", fetch429)).rejects.toMatchObject({ kind: "rate_limited" });
    const fetchHtml = vi.fn(async () => jsonResponse("<html>", 200, "text/html"));
    await expect(providerGetJson("https://api.github.com/user", fetchHtml)).rejects.toMatchObject({ kind: "invalid_response" });
    const fetchBig = vi.fn(async () => new Response("x".repeat(3 * 1024 * 1024), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(providerGetJson("https://api.github.com/user", fetchBig)).rejects.toMatchObject({ kind: "response_too_large" });
  });
  it("clamps page sizes", () => {
    expect(clampPageSize(500)).toBe(100);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize("nope", 25)).toBe(25);
  });
});

describe("provider URL builders + normalizers (fixture UNIT TESTS)", () => {
  it("drive list/file URLs + kinds", () => {
    expect(driveListUrl({ query: "x" })).toContain("www.googleapis.com/drive/v3/files");
    expect(driveListUrl({})).toContain("trashed+%3D+false");
    expect(driveFileUrl("1a2b3c4d5e6f7g8h9i0")).toContain("/files/");
    expect(() => driveFileUrl("../../etc")).toThrow();
    expect(driveKindFor("application/vnd.google-apps.folder")).toBe("folder");
    expect(driveKindFor("application/pdf")).toBe("pdf");
    const n = normalizeDriveFile({ id: "abc123XYZ_0", name: "Spec", mimeType: "application/pdf", owners: [{ displayName: "Ada" }] });
    expect(n.kind).toBe("pdf");
    expect(n.owner).toBe("Ada");
  });
  it("gmail urls + normalization", () => {
    expect(gmailMessageUrl("18fabc")).toContain("/users/me/messages/18fabc");
    expect(() => gmailMessageUrl("../x")).toThrow();
    const m = normalizeGmailMessage({
      id: "m1", threadId: "t1", snippet: "hello world",
      payload: { headers: [{ name: "Subject", value: "Hi" }, { name: "From", value: "a@b.c" }] },
      labelIds: ["INBOX"],
    });
    expect(m.title).toBe("Hi");
    expect(m.from).toBe("a@b.c");
  });
  it("calendar/slack/github/notion normalizers", () => {
    const e = normalizeCalendarEvent({ id: "e1", summary: "Standup", start: { dateTime: "2026-09-18T09:00:00Z" }, attendees: [{}, {}] }, "primary");
    expect(e.attendeeCount).toBe(2);
    const sm = normalizeSlackMessage({ ts: "123.456", text: "hello", user: "U1" }, "C1");
    expect(sm.id).toBe("C1:123.456");
    expect(githubUrl("/user/repos", { per_page: "5" })).toContain("api.github.com/user/repos");
    expect(() => githubUrl("https://evil/x")).toThrow();
    expect(notionTitleOf({ properties: { title: { type: "title", title: [{ plain_text: "Plan" }] } } })).toBe("Plan");
  });
});

describe("unified search", () => {
  it("merges per-source hits and isolates failures", async () => {
    const sources = {
      a: async () => [hitFromResource({ connectorId: "github", source: "GitHub", externalId: "1", type: "issue", title: "Atlas bug" })],
      b: async () => { throw new Error("provider_unavailable"); },
    };
    const res = await unifiedSearch("atlas", sources, { limit: 10 });
    expect(res.hits).toHaveLength(1);
    expect(res.hits[0].provenance.connectorId).toBe("github");
    expect(res.searchedSources).toEqual(["a"]);
    expect(res.failedSources).toEqual([{ source: "b", error: "provider_unavailable" }]);
    await expect(unifiedSearch("  ", sources)).rejects.toThrow(/empty-query/);
  });
  it("maps resources onto the existing ontology (no second graph)", () => {
    const seed = mapExternalResourceToKnowledge({ connectorId: "slack", resourceType: "message", title: "Discuss Atlas", owner: "Ada" });
    expect(seed.entityType).toBe("event");
    expect(seed.relationships[0]).toMatchObject({ type: "RELATED_TO", targetType: "person" });
    const repo = mapExternalResourceToKnowledge({ connectorId: "github", resourceType: "pull_request", title: "PR 1" });
    expect(repo.entityType).toBe("technology");
  });
});
