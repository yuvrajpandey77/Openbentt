/**
 * Phase 4 — Connector unit tests (registry, capabilities, normalization,
 * identity, hashing, security, errors, sync, credential redaction).
 */
import { describe, expect, it, vi } from "vitest";
import {
  CONNECTOR_LIMITS,
  itemHashFor,
  validateExternalUrl,
} from "@/lib/connectors/connectorCore.mjs";
import {
  capabilitiesFor,
  knownConnectorIds,
  requireCapability,
  supportsCapability,
} from "@/lib/connectors/connectorCapabilities";
import {
  ConnectorError,
  httpStatusToError,
  toConnectorError,
} from "@/lib/connectors/connectorErrors";
import {
  assertKnownConnector,
  getConnectorDefinition,
  listConnectorDefinitions,
} from "@/lib/connectors/connectorRegistry";
import {
  normalizeCrossrefWork,
  normalizeZoteroItem,
  validateExternalItem,
} from "@/lib/connectors/connectorNormalize";
import { resolveIdentityForItem } from "@/lib/connectors/connectorIdentity";
import { sourceRefForConnectorItem } from "@/lib/connectors/connectorEvidence";
import {
  canTransition,
  initialSyncState,
  markStaleItems,
  terminalStatusForCounts,
  transitionSync,
} from "@/lib/connectors/connectorSync";
import {
  fetchConnectorJson,
  redactConnectorSecrets,
} from "@/lib/connectors/connectorSecurity";
import { crossrefNormalizeMessage } from "@/lib/connectors/crossrefConnector";
import { zoteroNormalizeApiItem } from "@/lib/connectors/zoteroConnector";
import {
  CROSSREF_MESSAGE_FIXTURE,
  CROSSREF_MESSAGE_MALFORMED,
  ZOTERO_API_ITEM_FIXTURE,
  externalItemFixture,
} from "@/lib/connectors/connectorFixtures";

describe("connector registry", () => {
  it("lists Phase 4 research + Phase 7 Tier-1 enterprise connectors", () => {
    const defs = listConnectorDefinitions();
    expect(defs.map((d) => d.id).sort()).toEqual([
      "crossref", "github", "gmail", "google-calendar", "google-drive", "notion", "slack", "zotero",
    ]);
    for (const d of defs) {
      expect(d.name).toBeTruthy();
      expect(d.version).toBeTruthy();
      expect(d.capabilities.length).toBeGreaterThan(0);
    }
    // Tier-1 enterprise connectors are OAuth + read-only operations only.
    for (const id of ["google-drive", "gmail", "google-calendar", "slack", "github", "notion"]) {
      const d = defs.find((x) => x.id === id)!;
      expect(d.authMode).toBe("oauth");
      expect(d.supportedOperations).not.toContain("write");
    }
  });
  it("rejects unknown connector ids", () => {
    expect(() => getConnectorDefinition("arxiv")).toThrow(ConnectorError);
    expect(() => assertKnownConnector("nope")).toThrow(ConnectorError);
    expect(() => assertKnownConnector(undefined)).toThrow(ConnectorError);
    expect(knownConnectorIds()).toContain("crossref");
  });
});

describe("capability checking", () => {
  it("declares honest per-provider capabilities", () => {
    expect(capabilitiesFor("crossref")).toContain("SEARCH");
    expect(capabilitiesFor("crossref")).not.toContain("CITATIONS");
    expect(capabilitiesFor("zotero")).toContain("FETCH_COLLECTION");
    expect(capabilitiesFor("zotero")).not.toContain("SEARCH");
  });
  it("fails safe on unknown capabilities", () => {
    expect(supportsCapability("crossref", "TIME_TRAVEL")).toBe(false);
    expect(() => requireCapability("crossref", "TIME_TRAVEL")).toThrow(ConnectorError);
    expect(() => requireCapability("crossref", "SYNC")).toThrow(ConnectorError);
    expect(() => requireCapability("arxiv", "SEARCH")).toThrow(ConnectorError);
  });
});

describe("crossref normalization", () => {
  it("normalizes the fixture deterministically", () => {
    const fixed = { retrievedAt: "2026-01-01T00:00:00.000Z" };
    const a = crossrefNormalizeMessage(CROSSREF_MESSAGE_FIXTURE, fixed);
    const b = crossrefNormalizeMessage(CROSSREF_MESSAGE_FIXTURE, fixed);
    expect(a).toEqual(b);
    expect(a.connectorId).toBe("crossref");
    expect(a.externalId).toBe("10.1038/nature12373");
    expect(a.title).toContain("thermometry");
    expect(a.authors.length).toBe(3);
    expect(a.venue).toBe("Nature");
    expect(a.publicationDate).toBe("2013");
    expect(a.identifiers).toContainEqual({ namespace: "doi", value: "10.1038/nature12373" });
    expect(a.externalUrl).toBe("https://doi.org/10.1038/nature12373");
  });
  it("rejects records with no identity", () => {
    expect(() => normalizeCrossrefWork({})).toThrow(ConnectorError);
    expect(() => normalizeCrossrefWork(CROSSREF_MESSAGE_MALFORMED)).toThrow(ConnectorError);
  });
  it("caps unbounded arrays and strips credentials from raw metadata", () => {
    const item = normalizeCrossrefWork({
      doi: "10.1000/xyz123",
      title: "T",
      authors: Array.from({ length: 500 }, (_, i) => `Author ${i}`),
    });
    expect(item.authors.length).toBeLessThanOrEqual(CONNECTOR_LIMITS.maxAuthors as number);
    const withSecret = normalizeCrossrefWork({ doi: "10.1000/xyz123", title: "T" });
    expect(JSON.stringify(withSecret.rawMetadata)).not.toMatch(/api_key|token/i);
  });
});

describe("zotero normalization", () => {
  it("keeps keys namespaced and maps collections/tags", () => {
    const item = zoteroNormalizeApiItem(ZOTERO_API_ITEM_FIXTURE);
    expect(item.connectorId).toBe("zotero");
    expect(item.externalId).toBe("ABCD1234");
    expect(item.identifiers).toContainEqual({ namespace: "zotero", value: "ABCD1234" });
    expect(item.identifiers).toContainEqual({ namespace: "doi", value: "10.48550/arxiv.1706.03762" });
    expect(item.collections).toEqual(["COLL01"]);
    expect(item.authors).toContain("Ashish Vaswani");
  });
  it("rejects items without keys", () => {
    expect(() => normalizeZoteroItem({ title: "No key" })).toThrow(ConnectorError);
  });
});

describe("identity resolution", () => {
  it("prefers DOI identity for crossref items", () => {
    const r = resolveIdentityForItem(externalItemFixture());
    expect(r?.kind).toBe("doi");
    expect(r?.namespace).toBe("doi");
    expect(r?.entityId).toMatch(/^ent_paper_[0-9a-f]{8}$/);
  });
  it("uses namespaced zotero identity without DOI", () => {
    const item = externalItemFixture({
      connectorId: "zotero", externalId: "KEY12345", identifiers: [{ namespace: "zotero", value: "KEY12345" }],
    });
    const r = resolveIdentityForItem(item);
    expect(r?.namespace).toBe("zotero");
    expect(r?.entityId).toMatch(/^ent_paper_/);
  });
  it("returns null when confidence is insufficient", () => {
    expect(resolveIdentityForItem(externalItemFixture({ title: undefined, identifiers: [] }))).toBeNull();
  });
  it("is stable across repeated resolution", () => {
    const a = resolveIdentityForItem(externalItemFixture());
    const b = resolveIdentityForItem(externalItemFixture());
    expect(a?.entityId).toBe(b?.entityId);
  });
});

describe("deterministic hashing", () => {
  it("hashes equal items equally and changed items differently", () => {
    const a = itemHashFor(externalItemFixture());
    const b = itemHashFor(externalItemFixture());
    const c = itemHashFor(externalItemFixture({ title: "Something else entirely" }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("URL + SSRF policy", () => {
  it("accepts public https URLs", () => {
    expect(validateExternalUrl("https://doi.org/10.1038/nature12373")).toContain("https://");
  });
  it("blocks private/unsafe targets", () => {
    for (const u of [
      "http://example.com/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://169.254.169.254/",
      "https://example.local/x",
      "ftp://example.com/x",
      "https://user:pass@example.com/",
    ]) {
      expect(() => validateExternalUrl(u), u).toThrow();
    }
  });
  it("rejects invalid externalUrl on items", () => {
    expect(() => validateExternalItem(externalItemFixture({ externalUrl: "https://127.0.0.1/x" }))).toThrow();
  });
});

describe("bounded fetch", () => {
  function jsonResponse(body: unknown, contentType = "application/json"): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": contentType } });
  }
  it("parses bounded JSON", async () => {
    const f = vi.fn(async () => jsonResponse({ message: { DOI: "10.1/x" } }));
    const { json } = await fetchConnectorJson("https://api.crossref.org/works/10.1%2Fx", f as unknown as typeof fetch);
    expect((json as { message: { DOI: string } }).message.DOI).toBe("10.1/x");
  });
  it("rejects wrong content types and oversized bodies", async () => {
    const html = vi.fn(async () => jsonResponse({}, "text/html"));
    await expect(fetchConnectorJson("https://example.com/x", html as unknown as typeof fetch)).rejects.toThrow(ConnectorError);
    const big = vi.fn(async () => new Response("x".repeat(100), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(
      fetchConnectorJson("https://example.com/x", big as unknown as typeof fetch, { maxBytes: 10 })
    ).rejects.toThrow(ConnectorError);
  });
  it("maps timeouts and rate limits to typed errors", async () => {
    const aborter = vi.fn(async () => { throw new DOMException("x", "AbortError"); });
    await expect(fetchConnectorJson("https://example.com/x", aborter as unknown as typeof fetch)).rejects.toMatchObject({ kind: "timeout" });
    const limited = vi.fn(async () => new Response("{}", { status: 429, headers: { "content-type": "application/json" } }));
    await expect(fetchConnectorJson("https://example.com/x", limited as unknown as typeof fetch)).rejects.toMatchObject({ kind: "rate_limited" });
  });
  it("never follows SSRF redirects", async () => {
    const redir = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/evil" } }));
    await expect(fetchConnectorJson("https://example.com/x", redir as unknown as typeof fetch)).rejects.toMatchObject({ kind: "ssrf_blocked" });
  });
});

describe("error taxonomy + redaction", () => {
  it("maps HTTP statuses safely", () => {
    expect(httpStatusToError(401).kind).toBe("authentication_failed");
    expect(httpStatusToError(429).kind).toBe("rate_limited");
    expect(httpStatusToError(500).kind).toBe("provider_error");
  });
  it("translates url policy errors", () => {
    expect(toConnectorError(new Error("url-blocked")).kind).toBe("ssrf_blocked");
    expect(toConnectorError(new Error("url-timeout")).kind).toBe("timeout");
  });
  it("redacts credentials from text", () => {
    const out = redactConnectorSecrets("key api_key=SECRET123 and Bearer TOKEN456 ok");
    expect(out).not.toContain("SECRET123");
    expect(out).not.toContain("TOKEN456");
    expect(out).toContain("[redacted]");
  });
});

describe("provenance", () => {
  it("builds ID-safe SourceRefs with connector trail", () => {
    const ref = sourceRefForConnectorItem(externalItemFixture());
    expect(ref.documentId).toMatch(/^[a-zA-Z0-9_:@.-]{1,128}$/);
    expect(ref.chunkId).toMatch(/^[a-zA-Z0-9_:@.-]{1,128}$/);
    expect(ref.chunkId).not.toContain("/");
    expect(ref.connector?.connectorId).toBe("crossref");
    expect(ref.connector?.externalId).toBe("10.1038/nature12373");
    expect(ref.connector?.retrievedAt).toBeTruthy();
  });
});

describe("sync state machine", () => {
  it("walks legal transitions only", () => {
    const s0 = initialSyncState("crossref");
    expect(s0.status).toBe("never_synced");
    const s1 = transitionSync(s0, "syncing");
    expect(s1.lastAttemptAt).toBeTruthy();
    const s2 = transitionSync(s1, "synced", { itemsSeen: 3 });
    expect(s2.lastSuccessAt).toBeTruthy();
    expect(() => transitionSync(s0, "synced")).toThrow();
    expect(canTransition("synced", "syncing")).toBe(true);
    expect(canTransition("synced", "synced")).toBe(false);
  });
  it("derives terminal states and marks stale without deleting", () => {
    expect(terminalStatusForCounts(5, 0)).toBe("synced");
    expect(terminalStatusForCounts(5, 2)).toBe("partial");
    expect(terminalStatusForCounts(5, 5)).toBe("failed");
    const prev = new Map([["a", { externalId: "a" }], ["b", { externalId: "b" }]]);
    expect(markStaleItems(prev, new Set(["a"]))).toEqual([
      { id: "a", status: "seen" },
      { id: "b", status: "not_seen" },
    ]);
  });
});
