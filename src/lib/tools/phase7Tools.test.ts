/**
 * Phase 7 — tool policy tests for new tools (renderer/web path).
 * - connector.unified_search: READ_ONLY, local fallback returns REAL local
 *   hits only; enterprise sources reported skipped (never fabricated).
 * - mcp.tool.execute: USER_CONFIRMATION-gated (CONFIRM without confirmation).
 * - Agent allowlist includes the new tools (no runtime rewrite).
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { executeTool } from "@/lib/tools/toolExecutor";
import { getToolDefinition } from "@/lib/tools/toolRegistry";
import { toolAuditWebStore } from "@/lib/tools/toolWebStore";
import { knowledgeWebStore } from "@/lib/knowledge/webStore";
import { getAgentDefinition } from "@/lib/agent/agentDefinitions";
import type { ToolAuditEvent } from "@/lib/tools/toolTypes";

function installLocalStorageMock() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}

const CTX = { userInitiated: true, source: "test" };
const AUDIT = { audit: (e: ToolAuditEvent) => toolAuditWebStore.record(e) };

beforeEach(() => {
  installLocalStorageMock();
  knowledgeWebStore.resetForTest();
  toolAuditWebStore.clearForTest();
});

describe("Phase 7 tool policy", () => {
  it("connector.unified_search is READ_ONLY backend with bounded schema", () => {
    const def = getToolDefinition("connector.unified_search");
    expect(def.permission).toBe("READ_ONLY");
    expect(def.risk).toBe("LOW");
    expect(def.mutation).toBe(false);
    expect(def.capabilities).toContain("connector.unified_search");
  });
  it("mcp tools are gated (read LOW, execute CONFIRM/MEDIUM)", () => {
    const read = getToolDefinition("mcp.resource.read");
    expect(read.permission).toBe("READ_ONLY");
    const exec = getToolDefinition("mcp.tool.execute");
    expect(exec.permission).toBe("USER_CONFIRMATION");
    expect(exec.risk).toBe("MEDIUM");
    expect(exec.mutation).toBe(true);
  });
  it("mcp.tool.execute suspends for confirmation without userConfirmed", async () => {
    const r = await executeTool(
      "mcp.tool.execute",
      { serverId: "srv", toolName: "t", args: {} },
      { userInitiated: true, source: "test" },
      AUDIT
    );
    expect(r.ok).toBe(false);
    expect(r.decision).toBe("CONFIRM");
  });
  it("unified_search web fallback searches local data, skips enterprise honestly", async () => {
    const r = await executeTool("connector.unified_search", { query: "atlas" }, CTX, AUDIT);
    expect(r.ok).toBe(true);
    const data = r.data as { hits: unknown[]; searchedSources: string[]; skippedSources: { source: string; reason: string }[] };
    expect(data.searchedSources).toContain("Openbentt documents");
    expect(data.skippedSources.map((s) => s.source)).toContain("gmail");
    expect(data.skippedSources.every((s) => s.reason === "desktop_required")).toBe(true);
    // No fabricated enterprise hits on web.
    expect(data.hits.every((h) => (h as { connectorId: string }).connectorId === "local")).toBe(true);
  });
  it("agent allowlist includes Phase 7 tools", () => {
    const def = getAgentDefinition("research-assistant");
    expect(def.toolAllowlist).toContain("connector.unified_search");
    expect(def.toolAllowlist).toContain("mcp.resource.read");
    expect(def.toolAllowlist).toContain("mcp.tool.execute");
  });
  it("audit redacts credential-shaped input for new tools (Phase 5 contract)", async () => {
    await executeTool("connector.unified_search", { query: "Bearer sk-live-abc api_key=zzz" }, CTX, AUDIT);
    const rows = toolAuditWebStore.list({});
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("sk-live-abc");
    expect(JSON.stringify(rows)).not.toContain("api_key=zzz");
  });
});
