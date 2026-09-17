/**
 * Phase 5 — Tool benchmark (real measured timings, printed, never fabricated).
 * Run: npx vitest run src/lib/tools/benchmark.test.ts
 */
import { beforeEach, describe, expect, it } from "vitest";
import { installLocalStorageMock } from "../../../test/helpers/localStorage";
import {
  evaluatePolicy,
  validateAgainstSchema,
} from "@/lib/tools/toolCore.mjs";
import { getToolDefinition } from "@/lib/tools/toolRegistry";
import { executeTool } from "@/lib/tools/toolExecutor";
import { toolAuditWebStore } from "@/lib/tools/toolWebStore";
import { knowledgeWebStore } from "@/lib/knowledge/webStore";
import {
  seedDocumentFixture,
  seedKnowledgeFixture,
} from "@/lib/tools/toolFixtures";

beforeEach(() => {
  installLocalStorageMock();
  knowledgeWebStore.resetForTest();
  toolAuditWebStore.clearForTest();
});

const CTX = { userInitiated: true, source: "bench" };
const noop = { audit: () => undefined };

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { median, p95 };
}

describe("tool benchmark", () => {
  it("measures lookup/validation/policy/tools/bulk executions", async () => {
    const rows: string[] = [];
    const { paperId, personId } = await seedKnowledgeFixture();
    const docId = await seedDocumentFixture();
    void docId;

    let t0 = performance.now();
    for (let i = 0; i < 1000; i++) getToolDefinition("knowledge.search");
    rows.push(`registry lookup x1000: ${(performance.now() - t0).toFixed(1)}ms`);

    const schema = getToolDefinition("knowledge.search").inputSchema;
    t0 = performance.now();
    for (let i = 0; i < 1000; i++) validateAgainstSchema(schema, { query: "bench query", limit: 20 });
    rows.push(`schema validation x1000: ${(performance.now() - t0).toFixed(1)}ms`);

    const def = getToolDefinition("connector.import");
    t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      evaluatePolicy(
        { id: def.id, permission: def.permission, risk: def.risk, capabilities: def.capabilities },
        { userInitiated: true }
      );
    }
    rows.push(`policy evaluation x1000: ${(performance.now() - t0).toFixed(1)}ms`);

    async function time(label: string, n: number, fn: () => Promise<unknown>) {
      const samples: number[] = [];
      for (let i = 0; i < n; i++) {
        const s = performance.now();
        await fn();
        samples.push(performance.now() - s);
      }
      const { median, p95 } = stats(samples);
      rows.push(`${label} x${n}: median ${median.toFixed(2)}ms p95 ${p95.toFixed(2)}ms`);
    }

    await time("knowledge.search", 50, () => executeTool("knowledge.search", { query: "Tool" }, CTX, noop));
    await time("knowledge.get_entity", 50, () => executeTool("knowledge.get_entity", { entityId: paperId }, CTX, noop));
    await time("knowledge.get_relationships(depth2)", 20, () =>
      executeTool("knowledge.get_relationships", { entityId: personId, depth: 2 }, CTX, noop));
    await time("document.search", 50, () => executeTool("document.search", { query: "local-first" }, CTX, noop));
    await time("utility.calculate", 100, () =>
      executeTool("utility.calculate", { expression: "sqrt(144) + 2^10" }, CTX, noop));

    // Bulk: 100 mixed read executions.
    t0 = performance.now();
    for (let i = 0; i < 25; i++) {
      await executeTool("knowledge.search", { query: "Tool" }, CTX, noop);
      await executeTool("document.search", { query: "local" }, CTX, noop);
      await executeTool("utility.calculate", { expression: `${i} * 7 + 1` }, CTX, noop);
      await executeTool("knowledge.get_evidence", { entityId: paperId }, CTX, noop);
    }
    const bulk100 = performance.now() - t0;
    rows.push(`100 mixed tool executions: ${bulk100.toFixed(1)}ms (${(100000 / bulk100).toFixed(0)}/s)`);

    // Bulk: 1000 lightweight executions (validation + policy + calc).
    t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      await executeTool("utility.calculate", { expression: `${i % 97} * 3 + 1` }, CTX, noop);
    }
    const bulk1000 = performance.now() - t0;
    rows.push(`1000 calculate executions: ${bulk1000.toFixed(1)}ms (${(1000000 / bulk1000).toFixed(0)}/s)`);

    console.log(`[tool-bench]\n${rows.join("\n")}`);
    expect(bulk100).toBeGreaterThan(0);
  }, 120000);
});
