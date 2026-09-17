/**
 * Phase 6 — Prompt protocol tests: strict parsing, registry projection,
 * untrusted-data wrapping. Non-conforming model text never becomes a call.
 */
import { describe, expect, it } from "vitest";
import {
  parseModelTurn,
  projectToolsForModel,
  summarizeToolResultForModel,
  wrapToolResultForModel,
} from "@/lib/agent/agentPrompt";
import { RESEARCH_ASSISTANT_DEFINITION } from "@/lib/agent/agentDefinitions";

describe("proposal parsing", () => {
  it("parses a valid fenced tool block", () => {
    const r = parseModelTurn('Let me search.\n```tool\n{"tool": "knowledge.search", "input": {"query": "x"}}\n```');
    expect(r).toEqual({ type: "tool", proposal: { tool: "knowledge.search", input: { query: "x" } } });
  });
  it("treats FINAL: text as final and strips the marker", () => {
    const r = parseModelTurn("FINAL: The answer is 42.");
    expect(r).toEqual({ type: "final", text: "The answer is 42." });
  });
  it("treats plain text as final", () => {
    expect(parseModelTurn("Just an answer.")).toEqual({ type: "final", text: "Just an answer." });
  });
  it("rejects malformed blocks as final (never a call)", () => {
    for (const bad of [
      '```tool\n{"tool": 42, "input": {}}\n```',
      '```tool\n{"input": {}}\n```',
      '```tool\n{"tool": "x", "input": [1]}\n```',
      '```tool\nnot json\n```',
      '```tool\n{"tool": "' + "y".repeat(200) + '", "input": {}}\n```',
      "call knowledge.search with query x",
    ]) {
      expect(parseModelTurn(bad).type, bad.slice(0, 30)).toBe("final");
    }
  });
  it("last valid block wins", () => {
    const r = parseModelTurn(
      '```tool\n{"tool": "a.b", "input": {}}\n```\nthen\n```tool\n{"tool": "c.d", "input": {"q": 1}}\n```'
    );
    expect(r).toEqual({ type: "tool", proposal: { tool: "c.d", input: { q: 1 } } });
  });
  it("ignores excess blocks beyond the scan budget", () => {
    const many = Array.from({ length: 10 }, (_, i) => `\`\`\`tool\n{"tool": "t${i}", "input": {}}\n\`\`\``).join("\n");
    const r = parseModelTurn(many);
    // 5-block scan budget: later blocks (t5+) are not adopted.
    if (r.type === "tool") expect(["t0", "t1", "t2", "t3", "t4"]).toContain(r.proposal.tool);
  });
});

describe("tool projection", () => {
  it("projects allowlisted tools from the registry without duplicating schemas", () => {
    const text = projectToolsForModel(RESEARCH_ASSISTANT_DEFINITION);
    expect(text).toContain("knowledge.search");
    expect(text).toContain("connector.import");
    expect(text).toContain("USER_CONFIRMATION");
  });
  it("omits allowlist entries missing from the registry (fail closed)", () => {
    const text = projectToolsForModel({ ...RESEARCH_ASSISTANT_DEFINITION, toolAllowlist: ["nope.tool"] });
    expect(text).not.toContain("nope.tool");
  });
});

describe("untrusted-data wrapping", () => {
  it("wraps results in explicit DATA markers", () => {
    const w = wrapToolResultForModel("knowledge.search", "some text");
    expect(w).toContain("[BEGIN UNTRUSTED TOOL DATA — knowledge.search");
    expect(w).toContain("[END UNTRUSTED TOOL DATA — knowledge.search]");
  });
  it("bounds observation summaries", () => {
    const big = { items: Array.from({ length: 500 }, (_, i) => ({ id: i, text: "x".repeat(100) })) };
    const s = summarizeToolResultForModel("t", big);
    expect(s.length).toBeLessThan(5000);
    expect(s).toContain("truncated");
  });
});
