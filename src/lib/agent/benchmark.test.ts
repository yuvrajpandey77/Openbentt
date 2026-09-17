/**
 * Phase 6 — Agent benchmark (local runtime overhead only).
 * The model is stubbed (instant) so figures reflect runtime cost, not
 * provider latency — provider latency must not be reported as runtime cost.
 * Run: npx vitest run src/lib/agent/benchmark.test.ts
 */
import { describe, expect, it } from "vitest";
import { installLocalStorageMock } from "../../../test/helpers/localStorage";
import { runAgent, clearRunRegistryForTest } from "@/lib/agent/agentRuntime";
import { RESEARCH_ASSISTANT_DEFINITION } from "@/lib/agent/agentDefinitions";
import { buildAgentSystemPrompt, parseModelTurn } from "@/lib/agent/agentPrompt";
import { knowledgeWebStore } from "@/lib/knowledge/webStore";
import { toolAuditWebStore } from "@/lib/tools/toolWebStore";
import { seedKnowledgeFixture } from "@/lib/tools/toolFixtures";
import type { AgentModelFn } from "@/lib/agent/agentTypes";

installLocalStorageMock();

const instantModel: AgentModelFn = async () => ({ text: "FINAL: done.", route: "bench:model" });
const noopExec = async (toolId: string) => ({
  ok: true as const, toolId, toolVersion: "1", requestId: "r",
  data: { entities: [] }, decision: "ALLOW" as const, durationMs: 0,
});

describe("agent benchmark", () => {
  it("measures runtime overhead (model stubbed)", async () => {
    const rows: string[] = [];
    clearRunRegistryForTest();
    await seedKnowledgeFixture();

    let t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      buildAgentSystemPrompt(RESEARCH_ASSISTANT_DEFINITION, "proj_bench");
    }
    rows.push(`system prompt assembly x1000: ${(performance.now() - t0).toFixed(1)}ms`);

    t0 = performance.now();
    const sample = 'Reasoning text.\n```tool\n{"tool": "knowledge.search", "input": {"query": "x"}}\n```';
    for (let i = 0; i < 1000; i++) parseModelTurn(sample);
    rows.push(`proposal parsing x1000: ${(performance.now() - t0).toFixed(1)}ms`);

    // No-tool run latency (runtime overhead only).
    const noToolSamples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const s = performance.now();
      await runAgent(RESEARCH_ASSISTANT_DEFINITION, { request: "Hello" }, { model: instantModel, executeTool: noopExec });
      noToolSamples.push(performance.now() - s);
    }
    noToolSamples.sort((a, b) => a - b);
    rows.push(`no-tool run x50: median ${noToolSamples[25].toFixed(2)}ms p95 ${noToolSamples[47].toFixed(2)}ms`);

    // Tool-using run latency (executor stubbed, 2 tool calls).
    const toolModel: AgentModelFn = (() => {
      const script = [
        '```tool\n{"tool": "knowledge.search", "input": {"query": "x"}}\n```',
        '```tool\n{"tool": "utility.calculate", "input": {"expression": "1+1"}}\n```',
        "FINAL: done.",
      ];
      let i = 0;
      return async () => ({ text: script[Math.min(i++, script.length - 1)], route: "bench:model" });
    })();
    const toolSamples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      await runAgent(RESEARCH_ASSISTANT_DEFINITION, { request: "Research x" }, { model: toolModel, executeTool: noopExec });
      toolSamples.push(performance.now() - s);
    }
    toolSamples.sort((a, b) => a - b);
    rows.push(`2-tool run x20: median ${toolSamples[10].toFixed(2)}ms p95 ${toolSamples[19].toFixed(2)}ms`);

    // Audit sink cost.
    t0 = performance.now();
    for (let i = 0; i < 200; i++) {
      toolAuditWebStore.record({
        eventId: `bench_${i}`, toolId: "agent.run", toolVersion: "1", requestId: "r",
        timestamp: new Date().toISOString(), source: "bench", decision: "ALLOW",
        status: "ok", durationMs: 1, permission: "READ_ONLY", risk: "LOW",
        resourceSummary: { agentId: "research-assistant" },
      });
    }
    rows.push(`audit record x200 (localStorage): ${(performance.now() - t0).toFixed(1)}ms`);
    toolAuditWebStore.clearForTest();

    console.log(`[agent-bench]\n${rows.join("\n")}`);
    expect(noToolSamples[25]).toBeGreaterThanOrEqual(0);
  }, 120000);
});
