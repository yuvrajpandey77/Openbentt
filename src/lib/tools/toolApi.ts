/**
 * Phase 5 — Renderer tool API: desktop IPC (`research:tools` on the existing
 * openbenttResearch bridge) with local web execution fallback.
 * The contract is identical on both runtimes; only the backend differs.
 */
import { executeTool } from "@/lib/tools/toolExecutor";
import { inspectTool, listToolDefinitions } from "@/lib/tools/toolRegistry";
import { toolAuditWebStore } from "@/lib/tools/toolWebStore";
import type {
  ToolAuditEvent,
  ToolDefinition,
  ToolResult,
} from "@/lib/tools/toolTypes";

function bridge(): { tools: (op: string, payload?: unknown) => Promise<unknown> } | undefined {
  try {
    const w = window as unknown as {
      openbenttResearch?: { tools?: (op: string, payload?: unknown) => Promise<unknown> };
    };
    return w.openbenttResearch?.tools ? { tools: w.openbenttResearch.tools } : undefined;
  } catch {
    return undefined;
  }
}

export function hasToolDesktopApi(): boolean {
  return Boolean(bridge());
}

/**
 * Local-only tools execute in the caller runtime even on desktop
 * (document registry + pure compute need no backend).
 */
const LOCAL_TOOLS = new Set([
  "document.search",
  "document.get",
  "document.inspect",
  "utility.calculate",
]);

async function webExecute(
  toolId: string, input: unknown, context?: Record<string, unknown>
): Promise<ToolResult> {
  return executeTool(toolId, input, context, {
    audit: (event) => toolAuditWebStore.record(event),
  });
}

export const toolApi = {
  list(): Promise<ToolDefinition[]> {
    const b = bridge();
    if (b) return b.tools("list") as Promise<ToolDefinition[]>;
    return Promise.resolve(listToolDefinitions());
  },
  get(toolId: string) {
    const b = bridge();
    if (b) return b.tools("get", { toolId }) as Promise<ReturnType<typeof inspectTool>>;
    return Promise.resolve(inspectTool(toolId));
  },
  execute(toolId: string, input: unknown, context?: Record<string, unknown>): Promise<ToolResult> {
    const b = bridge();
    if (b && !LOCAL_TOOLS.has(toolId)) {
      return b.tools("execute", { toolId, input, context }) as Promise<ToolResult>;
    }
    return webExecute(toolId, input, context);
  },
  audit(opts?: { toolId?: string; projectId?: string; status?: string; limit?: number }): Promise<ToolAuditEvent[]> {
    const b = bridge();
    if (b) return b.tools("audit", opts ?? {}) as Promise<ToolAuditEvent[]>;
    return Promise.resolve(toolAuditWebStore.list(opts));
  },
  /** Persist a pre-built audit event (Phase 6 run-level events reuse this ledger). */
  record(event: ToolAuditEvent): Promise<string | void> {
    const b = bridge();
    if (b) return b.tools("record", { event }) as Promise<string>;
    toolAuditWebStore.record(event);
    return Promise.resolve();
  },
};
