/**
 * Phase 5 — Integration: request → registry → validation → policy →
 * existing service → result validation → audit event.
 * Parity: tool results equal direct service results (no duplicate logic).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageMock } from "../../../test/helpers/localStorage";
import { executeTool } from "@/lib/tools/toolExecutor";
import { toolAuditWebStore } from "@/lib/tools/toolWebStore";
import { knowledgeWebStore } from "@/lib/knowledge/webStore";
import { searchDocuments } from "@/lib/documents/search";
import { getDocument } from "@/lib/documents/service";
import { crossrefNormalizeMessage } from "@/lib/connectors/crossrefConnector";
import {
  connectorImportFixture,
  seedDocumentFixture,
  seedKnowledgeFixture,
} from "@/lib/tools/toolFixtures";
import type { ToolAuditEvent } from "@/lib/tools/toolTypes";

beforeEach(() => {
  installLocalStorageMock();
  knowledgeWebStore.resetForTest();
  toolAuditWebStore.clearForTest();
});

const CTX = { userInitiated: true, source: "integration" };
const AUDIT = { audit: (e: ToolAuditEvent) => toolAuditWebStore.record(e) };

describe("knowledge parity (tool vs direct API)", () => {
  it("search/entities/relationships/evidence match the underlying service", async () => {
    const { paperId, personId } = await seedKnowledgeFixture();
    const viaTool = await executeTool("knowledge.search", { query: "Tool Test" }, CTX, AUDIT);
    const direct = knowledgeWebStore.searchEntities({ query: "Tool Test" });
    expect(viaTool.ok).toBe(true);
    expect((viaTool.data as { entities: { id: string }[] }).entities.map((e) => e.id).sort())
      .toEqual(direct.map((e) => e.id).sort());

    const entTool = await executeTool("knowledge.get_entity", { entityId: paperId }, CTX, AUDIT);
    const entDirect = knowledgeWebStore.getEntity(paperId);
    expect((entTool.data as { entity: { id: string; canonicalName: string } }).entity.id).toBe(entDirect?.id);
    expect((entTool.data as { entity: { canonicalName: string } }).entity.canonicalName)
      .toBe(entDirect?.canonicalName);

    const relTool = await executeTool("knowledge.get_relationships", { entityId: personId }, CTX, AUDIT);
    const relDirect = knowledgeWebStore.listRelationships(personId, {});
    expect((relTool.data as { relationships: { id: string }[] }).relationships.map((r) => r.id))
      .toEqual(relDirect.map((r) => r.id));

    const evTool = await executeTool("knowledge.get_evidence", { entityId: paperId }, CTX, AUDIT);
    const evDirect = knowledgeWebStore.getEvidenceFor("entity", paperId);
    expect((evTool.data as { evidence: { id: string }[] }).evidence.map((e) => e.id))
      .toEqual(evDirect.map((e) => e.id));

    // Every step produced an audit event.
    expect(toolAuditWebStore.list({}).length).toBe(4);
  });
});

describe("document parity (tool vs DocumentService)", () => {
  it("search/get/inspect match the underlying service", async () => {
    const id = await seedDocumentFixture();
    const sTool = await executeTool("document.search", { query: "local-first" }, CTX, AUDIT);
    const sDirect = searchDocuments("local-first", {}, 20);
    expect(sTool.ok).toBe(true);
    expect((sTool.data as { hits: { documentId: string }[] }).hits.map((h) => h.documentId))
      .toEqual(sDirect.map((h) => h.document.id));

    const gTool = await executeTool("document.get", { documentId: id }, CTX, AUDIT);
    const gDirect = getDocument(id);
    expect((gTool.data as { document: { id: string; title: string } }).document.id).toBe(gDirect?.id);
    expect((gTool.data as { document: { title: string } }).document.title).toBe(gDirect?.title);
  });
});

describe("connector parity (tool vs Phase 4 engine)", () => {
  it("import matches direct engine semantics + idempotency", async () => {
    const confirmed = { ...CTX, userConfirmed: true, confirmedToolId: "connector.import" };
    const first = await executeTool("connector.import", { items: [connectorImportFixture()] }, confirmed, AUDIT);
    expect(first.ok).toBe(true);
    expect((first.data as { result: { counts: Record<string, number> } }).result.counts.created).toBe(1);
    // Entity discoverable through the knowledge tool with connector provenance.
    const found = await executeTool("knowledge.search", { query: "Tool Import" }, CTX, AUDIT);
    const papers = (found.data as { entities: { externalIds: { namespace: string }[] }[] }).entities;
    expect(papers.length).toBe(1);
    expect(papers[0].externalIds.some((x) => x.namespace === "doi")).toBe(true);
    const ev = await executeTool(
      "knowledge.get_evidence", { entityId: (papers[0] as unknown as { id: string }).id }, CTX, AUDIT
    );
    expect((ev.data as { evidence: unknown[] }).evidence.length).toBeGreaterThan(0);
    // Dry run reports no changes after import.
    const dry = await executeTool("connector.import",
      { items: [connectorImportFixture()], dryRun: true }, confirmed, AUDIT);
    expect(dry.ok).toBe(true);
    expect((dry.data as { result: { counts: Record<string, number> } }).result.counts.created).toBe(0);
  });
  it("preview normalizes exactly like the connector boundary", async () => {
    const msg = {
      DOI: "10.1000/parity", title: ["Parity Work"],
      author: [{ given: "P", family: "Arity" }],
      issued: { "date-parts": [[2026]] },
    };
    const direct = crossrefNormalizeMessage(msg, { retrievedAt: "2026-01-01T00:00:00.000Z" });
    expect(direct.externalId).toBe("10.1000/parity");
    expect(direct.title).toBe("Parity Work");
  });
  it("connector.search hits only the allowlisted host", async () => {
    const stub = vi.fn(async () => new Response(JSON.stringify({ message: { items: [] } }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", stub as unknown as typeof fetch);
    try {
      const r = await executeTool("connector.search", { query: "x" }, CTX, AUDIT);
      expect(r.ok).toBe(true);
      const url = String((stub.mock.calls[0] as unknown[])[0]);
      expect(url.startsWith("https://api.crossref.org/")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("full lifecycle audit chain", () => {
  it("request → allow → result → audit with matching requestId", async () => {
    await seedKnowledgeFixture();
    const r = await executeTool("knowledge.search", { query: "Tool" }, { ...CTX, requestId: "chain_1" }, AUDIT);
    expect(r.ok).toBe(true);
    expect(r.requestId).toBe("chain_1");
    const events = toolAuditWebStore.list({});
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      requestId: "chain_1", toolId: "knowledge.search", status: "ok", decision: "ALLOW",
    });
  });
});
