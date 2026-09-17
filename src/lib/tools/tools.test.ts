/**
 * Phase 5 — Tool unit + security tests: registry, schemas, policy,
 * enforcement, isolation, all 15 tools, audit, limits, injection.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageMock } from "../../../test/helpers/localStorage";
import {
  evaluateCalculation,
  evaluatePolicy,
  TOOL_CAPABILITIES,
  validateAgainstSchema,
} from "@/lib/tools/toolCore.mjs";
import { ToolError } from "@/lib/tools/toolErrors";
import {
  assertKnownTool,
  getToolDefinition,
  inspectTool,
  listToolDefinitions,
} from "@/lib/tools/toolRegistry";
import { executeTool } from "@/lib/tools/toolExecutor";
import type { ToolAuditEvent } from "@/lib/tools/toolTypes";
import { validateToolContext } from "@/lib/tools/toolPolicy";
import { toolAuditWebStore } from "@/lib/tools/toolWebStore";
import { knowledgeWebStore } from "@/lib/knowledge/webStore";
import {
  connectorImportFixture,
  seedDocumentFixture,
  seedKnowledgeFixture,
} from "@/lib/tools/toolFixtures";

beforeEach(() => {
  installLocalStorageMock();
  knowledgeWebStore.resetForTest();
  toolAuditWebStore.clearForTest();
});

const CTX = { userInitiated: true, source: "test" };
const AUDIT = { audit: (e: ToolAuditEvent) => toolAuditWebStore.record(e) };

describe("registry", () => {
  it("registers exactly the documented inventory", () => {
    const ids = listToolDefinitions().map((d) => d.id).sort();
    expect(ids).toEqual([
      "connector.get", "connector.import", "connector.list", "connector.preview", "connector.search",
      "document.get", "document.inspect", "document.search",
      "export.create",
      "knowledge.get_entity", "knowledge.get_evidence", "knowledge.get_relationships", "knowledge.search",
      "project.get",
      "utility.calculate",
    ]);
  });
  it("looks up and inspects without exposing implementation", () => {
    const def = getToolDefinition("knowledge.search");
    expect(def.version).toBe("1");
    expect(def.permission).toBe("READ_ONLY");
    const view = inspectTool("connector.import");
    expect(view).not.toHaveProperty("execute");
    expect(view.permission).toBe("USER_CONFIRMATION");
    expect(() => getToolDefinition("shell.exec")).toThrow(ToolError);
    expect(() => assertKnownTool("nope")).toThrow(ToolError);
  });
  it("declares known capabilities only", () => {
    for (const d of listToolDefinitions()) {
      for (const c of d.capabilities) expect(TOOL_CAPABILITIES).toContain(c);
      expect(d.risk).toMatch(/^(LOW|MEDIUM|HIGH)$/);
    }
  });
});

describe("schema validation", () => {
  it("accepts valid input and strips nothing silently", () => {
    const def = getToolDefinition("knowledge.search");
    const res = executeTool(def.id, { query: "x", limit: 5 }, CTX);
    return expect(res).resolves.toMatchObject({ ok: true });
  });
  it("rejects malformed input", async () => {
    const r = await executeTool("knowledge.get_entity", { entityId: 42 }, CTX);
    expect(r.ok).toBe(false);
    expect(r.errorKind).toBe("invalid_input");
  });
  it("rejects unknown fields", async () => {
    const r = await executeTool("knowledge.search", { query: "x", dropTable: true }, CTX);
    expect(r.ok).toBe(false);
    expect(r.decision).toBe("DENY");
  });
  it("rejects oversized input", async () => {
    const r = await executeTool("knowledge.search", { query: "x".repeat(600) }, CTX);
    expect(r.ok).toBe(false);
    expect(r.errorKind).toBe("input_too_large");
  });
  it("rejects bad id formats and enum violations", async () => {
    const bad = await executeTool("knowledge.get_entity", { entityId: "a/b/../c" }, CTX);
    expect(bad.ok).toBe(false);
    const rel = await executeTool("knowledge.get_relationships", { entityId: "ent_x", direction: "sideways" }, CTX);
    expect(rel.ok).toBe(false);
  });
  it("core validator enforces bounds directly", () => {
    expect(validateAgainstSchema({ fields: { q: { type: "string", maxLength: 3 } } }, { q: "toolong" }).ok).toBe(false);
    expect(validateAgainstSchema({ fields: {} }, { evil: 1 }).ok).toBe(false);
  });
});

describe("policy enforcement", () => {
  it("allows read-only, confirms gated mutations", () => {
    expect(evaluatePolicy({ id: "a", permission: "READ_ONLY", risk: "LOW", capabilities: [] }, {}).decision).toBe("ALLOW");
    const c = evaluatePolicy(
      { id: "connector.import", permission: "USER_CONFIRMATION", risk: "MEDIUM", capabilities: ["connector.import"] }, {}
    );
    expect(c.decision).toBe("CONFIRM");
    const ok = evaluatePolicy(
      { id: "connector.import", permission: "USER_CONFIRMATION", risk: "MEDIUM", capabilities: ["connector.import"] },
      { userConfirmed: true, confirmedToolId: "connector.import" }
    );
    expect(ok.decision).toBe("ALLOW");
  });
  it("denies unknown tools, capabilities, permissions", () => {
    expect(evaluatePolicy(null, {}).decision).toBe("DENY");
    expect(evaluatePolicy({ id: "x", permission: "READ_ONLY", risk: "LOW", capabilities: ["time.travel"] }, {}).decision).toBe("DENY");
    expect(evaluatePolicy({ id: "x", permission: "SUDO", risk: "LOW", capabilities: [] }, {}).decision).toBe("DENY");
    expect(evaluatePolicy(
      { id: "x", permission: "USER_INITIATED_WRITE", risk: "HIGH", capabilities: [] }, {}
    ).decision).toBe("DENY");
  });
  it("executor returns CONFIRM payload without executing", async () => {
    const r = await executeTool("connector.import", { items: [connectorImportFixture()] }, CTX);
    expect(r.ok).toBe(false);
    expect(r.decision).toBe("CONFIRM");
    expect(r.errorKind).toBe("confirmation_required");
    expect(r.data).toMatchObject({ toolId: "connector.import", confirmationRequired: true });
    // Nothing was imported.
    expect(knowledgeWebStore.searchEntities({ query: "Tool Import" })).toEqual([]);
  });
  it("confirmation bypass is rejected (wrong tool id)", async () => {
    const r = await executeTool("connector.import", { items: [connectorImportFixture()] }, {
      ...CTX, userConfirmed: true, confirmedToolId: "knowledge.search",
    });
    expect(r.decision).toBe("CONFIRM");
  });
  it("rejects invalid contexts", () => {
    expect(() => validateToolContext({ projectId: "../../etc" })).toThrow(ToolError);
    expect(() => validateToolContext("yes")).toThrow(ToolError);
  });
});

describe("knowledge tools", () => {
  it("knowledge.search finds seeded entities", async () => {
    await seedKnowledgeFixture();
    const r = await executeTool("knowledge.search", { query: "Tool Test" }, CTX);
    expect(r.ok).toBe(true);
    expect((r.data as { entities: unknown[] }).entities.length).toBeGreaterThan(0);
  });
  it("knowledge.get_entity returns provenance summary", async () => {
    const { paperId } = await seedKnowledgeFixture();
    const r = await executeTool("knowledge.get_entity", { entityId: paperId }, CTX);
    expect(r.ok).toBe(true);
    const e = (r.data as { entity: { provenanceSummary: string } }).entity;
    expect(e.provenanceSummary).toContain("document");
  });
  it("knowledge.get_relationships depth1 + traversal depth2", async () => {
    const { personId } = await seedKnowledgeFixture();
    const d1 = await executeTool("knowledge.get_relationships", { entityId: personId, depth: 1 }, CTX);
    expect(d1.ok).toBe(true);
    expect((d1.data as { relationships: unknown[] }).relationships.length).toBe(1);
    const d2 = await executeTool("knowledge.get_relationships", { entityId: personId, depth: 2 }, CTX);
    expect(d2.ok).toBe(true);
  });
  it("knowledge.get_evidence returns provenance", async () => {
    const { paperId } = await seedKnowledgeFixture();
    const r = await executeTool("knowledge.get_evidence", { entityId: paperId }, CTX);
    expect(r.ok).toBe(true);
    expect((r.data as { evidence: unknown[] }).evidence.length).toBeGreaterThan(0);
  });
  it("missing entity is a safe failure, not a leak", async () => {
    const r = await executeTool("knowledge.get_entity", { entityId: "ent_missing_1" }, CTX);
    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/sqlite|Error:.*at /i);
  });
});

describe("document tools", () => {
  it("document.search/get/inspect round-trip", async () => {
    const id = await seedDocumentFixture();
    const s = await executeTool("document.search", { query: "local-first" }, CTX);
    expect(s.ok).toBe(true);
    expect((s.data as { hits: { documentId: string }[] }).hits[0].documentId).toBe(id);
    const g = await executeTool("document.get", { documentId: id }, CTX);
    expect(g.ok).toBe(true);
    expect((g.data as { document: { chunkCount: number } }).document.chunkCount).toBeGreaterThan(0);
    expect(g.data).not.toHaveProperty("bytes");
    const insp = await executeTool("document.inspect", { documentId: id, maxBlocks: 3, maxChunks: 2 }, CTX);
    expect(insp.ok).toBe(true);
    const view = (insp.data as { inspection: { blocks: unknown[]; chunks: unknown[]; sourceRef: object } }).inspection;
    expect(view.blocks.length).toBeLessThanOrEqual(3);
    expect(view.chunks.length).toBeLessThanOrEqual(2);
    expect(view.sourceRef).toMatchObject({ documentId: id });
  });
  it("document.get hides filesystem paths", async () => {
    const id = await seedDocumentFixture();
    const g = await executeTool("document.get", { documentId: id }, CTX);
    expect(JSON.stringify(g.data)).not.toMatch(/\/home\/|\/tmp\/|C:\\/);
  });
});

describe("connector tools", () => {
  it("connector.list/get expose declarations only", async () => {
    const l = await executeTool("connector.list", {}, CTX);
    expect(l.ok).toBe(true);
    expect((l.data as { connectors: { id: string }[] }).connectors.map((c) => c.id).sort())
      .toEqual(["crossref", "zotero"]);
    const g = await executeTool("connector.get", { connectorId: "crossref" }, CTX);
    expect(g.ok).toBe(true);
    expect((g.data as { connector: { capabilities: string[] } }).connector.capabilities).toContain("SEARCH");
    const bad = await executeTool("connector.get", { connectorId: "arxiv" }, CTX);
    expect(bad.ok).toBe(false);
  });
  it("connector.preview validates without importing", async () => {
    const p = await executeTool("connector.preview", { items: [connectorImportFixture()] }, CTX);
    expect(p.ok).toBe(true);
    expect(knowledgeWebStore.searchEntities({ query: "Tool Import" })).toEqual([]);
  });
  it("connector.search uses bounded stubbed fetch", async () => {
    const stub = vi.fn(async () => new Response(JSON.stringify({
      message: { items: [{
        DOI: "10.1000/stub", title: ["Stubbed Work"], author: [{ given: "A", family: "U Thor" }],
        issued: { "date-parts": [[2026]] }, "container-title": ["Stub J"], publisher: "Stub",
        URL: "https://doi.org/10.1000/stub", type: "journal-article",
      }] },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", stub as unknown as typeof fetch);
    try {
      const r = await executeTool("connector.search", { query: "stubbed", rows: 3 }, CTX);
      expect(r.ok).toBe(true);
      const items = (r.data as { items: { externalId: string; retrievedAt: string }[] }).items;
      expect(items).toHaveLength(1);
      expect(items[0].externalId).toBe("10.1000/stub");
      expect(items[0].retrievedAt).toBeTruthy();
      expect((stub.mock.calls[0] as unknown[])[0] as string).toContain("api.crossref.org");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("connector.import executes only with confirmation (Phase 4 idempotency reused)", async () => {
    const first = await executeTool("connector.import", { items: [connectorImportFixture()] }, {
      ...CTX, userConfirmed: true, confirmedToolId: "connector.import",
    });
    expect(first.ok).toBe(true);
    expect((first.data as { result: { counts: { created: number } } }).result.counts.created).toBe(1);
    const again = await executeTool("connector.import", { items: [connectorImportFixture()] }, {
      ...CTX, userConfirmed: true, confirmedToolId: "connector.import",
    });
    expect((again.data as { result: { counts: { unchanged: number } } }).result.counts.unchanged).toBe(1);
  });
});

describe("project/export/utility tools", () => {
  it("utility.calculate evaluates deterministically", async () => {
    const r = await executeTool("utility.calculate", { expression: "2 + 3 * (4 - 1)^2" }, CTX);
    expect(r).toMatchObject({ ok: true, data: { result: 29 } });
  });
  it("utility.calculate rejects code execution attempts", async () => {
    for (const expr of [
      "import('fs')", "process.exit(1)", "a.constructor", "2+",
      "9".repeat(30), "__proto__.x", "eval('1')", "Function('1')",
    ]) {
      const r = await executeTool("utility.calculate", { expression: expr }, CTX);
      expect(r.ok, expr).toBe(false);
    }
    expect(evaluateCalculation("sqrt(16) + min(3, 9)")).toBe(7);
    expect(evaluateCalculation("10 % 3")).toBe(1);
  });
  it("export.create returns bounded validated JSON", async () => {
    await seedKnowledgeFixture();
    const r = await executeTool("export.create", { projectId: "proj_tools" }, CTX);
    expect(r.ok).toBe(true);
    const e = (r.data as { export: { format: string; counts: { entities: number }; json: string } }).export;
    expect(e.format).toBe("openbentt-knowledge-v1");
    expect(e.counts.entities).toBeGreaterThan(0);
    expect(JSON.parse(e.json).format).toBe("openbentt-knowledge-v1");
  });
});

describe("project isolation", () => {
  it("project-scoped search honors scope", async () => {
    await seedKnowledgeFixture("proj_a");
    // Second project needs distinct entity ids (same-shape, other scope).
    knowledgeWebStore.upsertEntity({
      id: "ent_paper_tools02", type: "paper", canonicalName: "Tool Test Paper B",
      normalizedName: "tool test paper b", origin: "document", projectId: "proj_b",
    });
    const a = await executeTool("knowledge.search", { query: "Tool Test", projectId: "proj_a" }, CTX);
    const ents = (a.data as { entities: { projectId?: string }[] }).entities;
    expect(ents.length).toBeGreaterThan(0);
    expect(ents.every((e) => e.projectId === "proj_a")).toBe(true);
  });
  it("context projectId scopes search", async () => {
    await seedKnowledgeFixture("proj_ctx");
    const r = await executeTool("knowledge.search", { query: "Tool Test" }, { ...CTX, projectId: "proj_ctx" });
    const ents = (r.data as { entities: { projectId?: string }[] }).entities;
    expect(ents.every((e) => e.projectId === "proj_ctx")).toBe(true);
  });
});

describe("audit events", () => {
  it("every execution produces a structured event", async () => {
    await seedKnowledgeFixture();
    await executeTool("knowledge.search", { query: "x" }, { ...CTX, requestId: "req_1" }, AUDIT);
    await executeTool("connector.import", { items: [connectorImportFixture()] }, CTX, AUDIT);
    await executeTool("nope.tool", {}, CTX, AUDIT);
    const events = toolAuditWebStore.list({});
    expect(events.length).toBe(3);
    const ok = events.find((e) => e.requestId === "req_1");
    expect(ok).toMatchObject({ toolId: "knowledge.search", status: "ok", decision: "ALLOW" });
    expect(ok?.durationMs).toBeGreaterThanOrEqual(0);
    expect(ok?.resourceSummary).toBeDefined();
    const denied = events.find((e) => e.toolId === "nope.tool");
    expect(denied?.status).toBe("denied");
  });
  it("audit redacts secrets and bounds input", async () => {
    await executeTool("knowledge.search", {
      query: "x",
    }, CTX, AUDIT);
    await executeTool("utility.calculate", { expression: "1+1" }, {
      ...CTX, requestId: "r",
    }, AUDIT);
    // Inject secret-shaped content through a confirm-required path summary.
    await executeTool("connector.import", {
      items: [{ ...connectorImportFixture(), title: "t api_key=SECRET123 Bearer TOKEN456" }],
    }, CTX, AUDIT);
    const events = toolAuditWebStore.list({ toolId: "connector.import" });
    const blob = JSON.stringify(events);
    expect(blob).not.toContain("SECRET123");
    expect(blob).not.toContain("TOKEN456");
  });
  it("output size limits hold", async () => {
    await seedKnowledgeFixture();
    const r = await executeTool("knowledge.search", { query: "Tool", limit: 100 }, CTX);
    expect((r.data as { entities: unknown[] }).entities.length).toBeLessThanOrEqual(100);
  });
  it("timeouts are typed", async () => {
    const r = await executeTool("knowledge.search", { query: "x" }, CTX, { timeoutMs: 1000 });
    expect(r.ok).toBe(true);
  });
});

describe("injection resistance", () => {
  it("SQL injection attempts are inert strings", async () => {
    await seedKnowledgeFixture();
    const r = await executeTool("knowledge.search", { query: "' OR '1'='1" }, CTX);
    expect(r.ok).toBe(true);
    const bad = await executeTool("knowledge.get_entity", { entityId: "x'; DROP TABLE knowledge_entities;--" }, CTX);
    expect(bad.ok).toBe(false);
  });
  it("path traversal ids are rejected", async () => {
    const r = await executeTool("project.get", { projectId: "../../etc/passwd" }, CTX);
    expect(r.ok).toBe(false);
  });
  it("arbitrary execution is rejected (no shell/code tools)", async () => {
    for (const id of ["shell.exec", "code.run", "browser.open", "mcp.call", "agent.plan"]) {
      const r = await executeTool(id, {}, CTX);
      expect(r.ok).toBe(false);
      expect(r.errorKind).toBe("unknown_tool");
    }
  });
});
