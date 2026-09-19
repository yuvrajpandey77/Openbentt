/**
 * Phase 8 — action tool registration tests: every action is a registered tool
 * with capability, permission, risk, mutation, externalNetwork, schema,
 * execution mode; defaults are confirmation-gated and fail closed.
 */
import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS, evaluatePolicy, validateAgainstSchema } from "@/lib/tools/toolCore.mjs";
import { ACTION_TOOL_IDS } from "@/lib/actions/actionCore.mjs";

describe("phase 8 action tool registration", () => {
  it("registers all 7 action tools", () => {
    const ids = TOOL_DEFINITIONS.map((d) => d.id);
    for (const id of ACTION_TOOL_IDS) {
      expect(ids).toContain(id);
    }
  });
  it("defaults every action to USER_CONFIRMATION + mutation + external network + backend", () => {
    for (const id of ACTION_TOOL_IDS) {
      const def = TOOL_DEFINITIONS.find((d) => d.id === id)!;
      expect(def.permission).toBe("USER_CONFIRMATION");
      expect(def.mutation).toBe(true);
      expect(def.externalNetwork).toBe(true);
      expect(def.executionMode).toBe("backend");
      expect(def.capabilities.length).toBeGreaterThan(0);
      expect(def.version).toBe("1");
    }
  });
  it("marks sends and PRs HIGH, drafts MEDIUM", () => {
    const risk = (id: string) => TOOL_DEFINITIONS.find((d) => d.id === id)!.risk;
    expect(risk("gmail.send")).toBe("HIGH");
    expect(risk("github.create_pull_request")).toBe("HIGH");
    expect(risk("gmail.create_draft")).toBe("MEDIUM");
    expect(risk("calendar.create_event")).toBe("MEDIUM");
    expect(risk("slack.send_message")).toBe("MEDIUM");
    expect(risk("github.create_issue")).toBe("MEDIUM");
    expect(risk("notion.create_page")).toBe("MEDIUM");
  });
  it("policy requires confirmation for every action tool", () => {
    for (const id of ACTION_TOOL_IDS) {
      const def = TOOL_DEFINITIONS.find((d) => d.id === id)!;
      const p = evaluatePolicy(
        { id: def.id, permission: def.permission, risk: def.risk, capabilities: def.capabilities },
        {}
      );
      expect(p.decision).toBe("CONFIRM");
    }
  });
  it("rejects unknown input keys (strict schemas)", () => {
    const def = TOOL_DEFINITIONS.find((d) => d.id === "github.create_issue")!;
    const res = validateAgainstSchema(def.inputSchema, {
      repository: "acme/web", title: "t", exec: "rm -rf",
    });
    expect(res.ok).toBe(false);
  });
  it("rejects invalid repo slugs and missing recipients at schema level", () => {
    const issue = TOOL_DEFINITIONS.find((d) => d.id === "github.create_issue")!;
    expect(validateAgainstSchema(issue.inputSchema, { repository: "nope", title: "t" }).ok).toBe(false);
    const send = TOOL_DEFINITIONS.find((d) => d.id === "gmail.send")!;
    expect(validateAgainstSchema(send.inputSchema, { subject: "s", body: "b" }).ok).toBe(false);
  });
});
