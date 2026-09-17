/**
 * Phase 6 — Full-chain integration with the REAL Phase 5 executor:
 * USER → (stub model) → AGENT → toolApi.execute → policy → executor →
 * service → RESULT → FINAL. No direct service calls from the agent path.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { installLocalStorageMock } from "../../../test/helpers/localStorage";
import { runAgent, resumeAgentRun, clearRunRegistryForTest } from "@/lib/agent/agentRuntime";
import { defaultAgentToolExecutor } from "@/lib/agent/agentTools";
import { RESEARCH_ASSISTANT_DEFINITION } from "@/lib/agent/agentDefinitions";
import { knowledgeWebStore } from "@/lib/knowledge/webStore";
import { toolAuditWebStore } from "@/lib/tools/toolWebStore";
import {
  seedDocumentFixture,
  seedKnowledgeFixture,
} from "@/lib/tools/toolFixtures";
import type { AgentModelFn } from "@/lib/agent/agentTypes";
import type { ToolAuditEvent } from "@/lib/tools/toolTypes";

beforeEach(() => {
  installLocalStorageMock();
  knowledgeWebStore.resetForTest();
  toolAuditWebStore.clearForTest();
  clearRunRegistryForTest();
});

function modelScript(responses: string[]): AgentModelFn {
  let i = 0;
  return async () => ({ text: responses[Math.min(i++, responses.length - 1)], route: "test:model" });
}

describe("agent → real tools → response", () => {
  it("researches across knowledge + documents and answers with sources", async () => {
    await seedKnowledgeFixture("proj_int");
    await seedDocumentFixture("proj_int");
    const model = modelScript([
      '```tool\n{"tool": "knowledge.search", "input": {"query": "Tool Test"}}\n```',
      '```tool\n{"tool": "document.search", "input": {"query": "local-first"}}\n```',
      "FINAL: Tool Test Paper covers local-first workspaces [Tool Test Paper].",
    ]);
    const { run, sources } = await runAgent(
      RESEARCH_ASSISTANT_DEFINITION,
      { request: "What does our research say about local-first?", projectId: "proj_int" },
      { model, executeTool: defaultAgentToolExecutor },
      { audit: (e) => toolAuditWebStore.record(e) }
    );
    expect(run.status).toBe("completed");
    expect(run.toolCalls.map((c) => c.toolId)).toEqual(["knowledge.search", "document.search"]);
    expect(run.finalText).toContain("Tool Test Paper");
    expect(sources.length).toBeGreaterThanOrEqual(2);
    // Tool audit captured both calls with the agent source tag.
    const toolEvents = toolAuditWebStore.list({}).filter((e) => e.toolId !== "agent.run");
    expect(toolEvents).toHaveLength(2);
    expect(toolEvents.every((e) => String(e.source).startsWith("agent:"))).toBe(true);
    // Run-level events bookend the run.
    const runEvents = toolAuditWebStore.list({}).filter((e) => e.toolId === "agent.run");
    expect(runEvents.map((e) => (e.resourceSummary as { phase?: string }).phase)).toEqual(
      expect.arrayContaining(["run_start", "run_finish"])
    );
  });

  it("real policy suspends connector.import until UI confirmation", async () => {
    const item = {
      connectorId: "crossref", externalId: "10.1000/agentint",
      itemType: "journal-article", title: "Agent Integration Paper",
      authors: ["Ada Tester"], organizations: [], identifiers: [{ namespace: "doi", value: "10.1000/agentint" }],
      tags: [], collections: [], references: [], relatedItems: [], rawMetadata: {},
      retrievedAt: "2026-01-01T00:00:00.000Z",
    };
    const proposal = `\`\`\`tool\n{"tool": "connector.import", "input": {"items": [${JSON.stringify(item)}]}}\n\`\`\``;
    const model = modelScript([proposal, proposal, `FINAL: Imported with your approval.`]);
    const deps = { model, executeTool: defaultAgentToolExecutor };
    const audit = { audit: (e: ToolAuditEvent) => toolAuditWebStore.record(e) };
    const first = await runAgent(
      RESEARCH_ASSISTANT_DEFINITION, { request: "Import that paper", projectId: "proj_imp" }, deps, audit
    );
    expect(first.run.status).toBe("awaiting_confirmation");
    expect(first.run.pendingConfirmation?.toolId).toBe("connector.import");
    expect(knowledgeWebStore.searchEntities({ query: "Agent Integration" })).toHaveLength(0);
    const resumed = await resumeAgentRun(first.run.runId, RESEARCH_ASSISTANT_DEFINITION, deps, {
      userConfirmed: true, confirmedToolId: "connector.import",
    }, audit);
    expect(resumed.run.status).toBe("completed");
    expect(knowledgeWebStore.searchEntities({ query: "Agent Integration" })).toHaveLength(1);
  });

  it("denied tools surface as recoverable observations, run completes", async () => {
    const model = modelScript([
      '```tool\n{"tool": "project.get", "input": {"projectId": "proj_missing"}}\n```',
      "FINAL: That project does not exist here.",
    ]);
    const { run } = await runAgent(
      RESEARCH_ASSISTANT_DEFINITION, { request: "x" },
      { model, executeTool: defaultAgentToolExecutor }
    );
    expect(run.status).toBe("completed");
    expect(run.toolCalls[0].ok).toBe(false);
  });
});
