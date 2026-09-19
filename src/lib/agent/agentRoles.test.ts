/**
 * Phase 8 — role configuration tests: configurations reuse the runtime;
 * allowlists are subsets of the registry; writes stay proposable-only.
 */
import { describe, it, expect } from "vitest";
import { listAgentRoles, getAgentRole } from "@/lib/agent/agentRoles";
import { getAgentDefinition, listAgentDefinitions } from "@/lib/agent/agentDefinitions";
import { TOOL_DEFINITIONS } from "@/lib/tools/toolCore.mjs";

const REGISTRY = new Set(TOOL_DEFINITIONS.map((d) => d.id));
const WRITE_TOOLS = new Set([
  "gmail.create_draft", "gmail.send", "calendar.create_event", "slack.send_message",
  "github.create_issue", "github.create_pull_request", "notion.create_page",
]);

describe("agent roles", () => {
  it("registers 5 roles including research-assistant", () => {
    const roles = listAgentRoles();
    expect(roles.map((r) => r.id).sort()).toEqual([
      "engineering-assistant",
      "executive-assistant",
      "marketing-assistant",
      "operations-assistant",
      "research-assistant",
    ]);
  });
  it("allowlist only registered tools", () => {
    for (const r of listAgentRoles()) {
      for (const t of r.toolAllowlist) {
        expect(REGISTRY.has(t), `${r.id} lists unknown tool ${t}`).toBe(true);
      }
    }
  });
  it("keeps research read-only; executive drafts/sends; engineering PRs", () => {
    const research = getAgentRole("research-assistant");
    expect(research.toolAllowlist.some((t) => WRITE_TOOLS.has(t))).toBe(false);
    expect(research.accessLevel).toBe("read-only");
    expect(getAgentRole("executive-assistant").toolAllowlist).toContain("gmail.send");
    expect(getAgentRole("executive-assistant").toolAllowlist).not.toContain("github.create_pull_request");
    expect(getAgentRole("engineering-assistant").toolAllowlist).toContain("github.create_pull_request");
    expect(getAgentRole("engineering-assistant").toolAllowlist).not.toContain("gmail.send");
    expect(getAgentRole("marketing-assistant").toolAllowlist).not.toContain("gmail.send");
  });
  it("exposes every role through the runtime registry", () => {
    for (const r of listAgentRoles()) {
      const def = getAgentDefinition(r.id);
      // Same tool SET (legacy research definition keeps Phase 6 ordering).
      expect([...def.toolAllowlist].sort()).toEqual([...r.toolAllowlist].sort());
    }
    expect(listAgentDefinitions().length).toBeGreaterThanOrEqual(5);
  });
  it("rejects unknown roles", () => {
    expect(() => getAgentRole("ai-ceo-unrestricted")).toThrow();
  });
});
