/**
 * Phase 6 — Tool + audit wiring (Phase 5 boundary, no bypass).
 * Default executor is toolApi.execute; default audit sink records run-level
 * agent events into the same Phase 5 audit infrastructure (toolId
 * "agent.run") — no second audit system.
 */
import { toolApi } from "@/lib/tools/toolApi";
import { toolAuditWebStore } from "@/lib/tools/toolWebStore";
import type { ToolResult } from "@/lib/tools/toolTypes";
import type { AgentAuditSink } from "@/lib/agent/agentRuntime";

export async function defaultAgentToolExecutor(
  toolId: string, input: unknown, context: Record<string, unknown>
): Promise<ToolResult> {
  return toolApi.execute(toolId, input, context);
}

/** Run-level audit sink: desktop persists to SQLite, web locally. */
export function createAgentAuditSink(): AgentAuditSink {
  return async (event) => {
    try {
      await toolApi.record(event as Parameters<typeof toolApi.record>[0]);
    } catch {
      try {
        toolAuditWebStore.record(event as Parameters<typeof toolAuditWebStore.record>[0]);
      } catch {
        /* audit must never break the run */
      }
    }
  };
}
