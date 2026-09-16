/**
 * Phase 5 — Static tool registry (no dynamic registration).
 * Unknown ids are rejected; definitions are data-only (see toolDefinitions).
 */
import { TOOL_DEFINITIONS } from "@/lib/tools/toolDefinitions";
import { ToolError } from "@/lib/tools/toolErrors";
import type { ToolDefinition } from "@/lib/tools/toolTypes";

const BY_ID = new Map<string, ToolDefinition>(TOOL_DEFINITIONS.map((d) => [d.id, d]));

export function getToolDefinition(id: string): ToolDefinition {
  const def = BY_ID.get(id);
  if (!def) throw new ToolError("unknown_tool", id);
  return def;
}

export function listToolDefinitions(): ToolDefinition[] {
  return [...BY_ID.values()];
}

export function assertKnownTool(id: unknown): string {
  if (typeof id !== "string" || !BY_ID.has(id)) {
    throw new ToolError("unknown_tool", typeof id === "string" ? id : "missing");
  }
  return id;
}

/** Public inspection view (never exposes implementation). */
export function inspectTool(id: string): Pick<ToolDefinition,
  "id" | "name" | "description" | "category" | "version" | "inputSchema" |
  "outputSchema" | "capabilities" | "permission" | "risk"> {
  const d = getToolDefinition(id);
  return {
    id: d.id, name: d.name, description: d.description, category: d.category,
    version: d.version, inputSchema: d.inputSchema, outputSchema: d.outputSchema,
    capabilities: [...d.capabilities], permission: d.permission, risk: d.risk,
  };
}
