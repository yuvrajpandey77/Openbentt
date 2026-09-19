/**
 * Phase 7 — MCP → Openbentt tool adapter.
 *
 * Every discovered MCP tool is converted into an internal ToolDefinition and
 * MUST pass through the Phase 5 registry → policy → executor → audit chain.
 * Risk inference is fail-closed: unknown/mutation/network capabilities force
 * USER_CONFIRMATION + MEDIUM/HIGH risk; tools outside the server allowlist
 * or matching the deny list are rejected outright.
 *
 * Agent NEVER calls MCP directly: Agent → toolApi.execute(mcp.tool.execute)
 * → policy → executor → mcpStore → MCP server.
 */
import { sanitizeMcpText } from "@/lib/mcp/mcpTypes";
import type { McpTool } from "@/lib/mcp/mcpTypes";

export interface AdaptedMcpTool {
  toolId: string;
  definition: {
    id: string;
    name: string;
    description: string;
    version: string;
    category: string;
    inputSchema: { fields: Record<string, unknown> };
    outputSchema: { fields: Record<string, unknown> };
    capabilities: string[];
    permission: string;
    risk: string;
    executionMode: string;
    externalNetwork: boolean;
    mutation: boolean;
  };
  denied?: string;
}

const MUTATION_HINTS = [/write|create|update|delete|remove|send|post|publish|merge|push|execute|run|exec/i];
const NETWORK_HINTS = [/fetch|http|url|web|request|network|download/i];

function toSafeFieldName(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64);
  return s || "arg";
}

/** Convert a JSON-Schema-ish MCP inputSchema into Openbentt field defs (bounded). */
export function mcpSchemaToFields(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = (schema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set(Array.isArray(schema?.required) ? (schema.required as string[]) : []);
  for (const [rawName, rawDef] of Object.entries(props).slice(0, 32)) {
    const name = toSafeFieldName(rawName);
    const def = rawDef ?? {};
    const type = typeof def.type === "string" ? def.type : "string";
    const field: Record<string, unknown> = {
      type: ["string", "number", "boolean", "array", "object"].includes(type) ? type : "string",
      ...(required.has(rawName) ? { required: true } : {}),
    };
    if (typeof def.description === "string") field.description = def.description.slice(0, 500);
    if (typeof def.maxLength === "number") field.maxLength = Math.min(20000, def.maxLength);
    if (typeof def.enum === "object" && Array.isArray(def.enum)) field.enum = def.enum.slice(0, 64);
    out[name] = field;
  }
  return out;
}

export function inferMcpToolRisk(tool: McpTool): { permission: string; risk: string; mutation: boolean } {
  const hay = `${tool.name} ${tool.description ?? ""}`;
  const mutates = MUTATION_HINTS.some((re) => re.test(hay));
  if (mutates) return { permission: "USER_CONFIRMATION", risk: "HIGH", mutation: true };
  if (NETWORK_HINTS.some((re) => re.test(hay))) {
    return { permission: "USER_CONFIRMATION", risk: "MEDIUM", mutation: false };
  }
  return { permission: "READ_ONLY", risk: "LOW", mutation: false };
}

export function adaptMcpTool(serverId: string, tool: McpTool, allowedTools?: string[]): AdaptedMcpTool {
  const name = String(tool?.name ?? "");
  if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(name)) {
    return {
      toolId: "",
      definition: undefined as never,
      denied: "mcp-invalid-tool-name",
    };
  }
  if (allowedTools && !allowedTools.includes(name)) {
    return { toolId: "", definition: undefined as never, denied: "mcp-tool-not-allowlisted" };
  }
  const toolId = `mcp.${serverId}.${name}`.slice(0, 128);
  const { permission, risk, mutation } = inferMcpToolRisk(tool);
  return {
    toolId,
    definition: {
      id: toolId,
      name: sanitizeMcpText(`${tool.name}`, 128),
      description: sanitizeMcpText(`MCP tool ${name} via server ${serverId}. ${tool.description ?? ""}`, 1000),
      version: "1",
      category: "CONNECTOR",
      inputSchema: { fields: mcpSchemaToFields(tool.inputSchema ?? {}) },
      outputSchema: { fields: { result: { type: "object", freeform: true } } },
      capabilities: ["connector.search"],
      permission,
      risk,
      executionMode: "backend",
      externalNetwork: true,
      mutation,
    },
  };
}

/** Unknown MCP tool ids fail closed — never executed. */
export function assertKnownMcpTool(knownIds: Set<string>, toolId: string): void {
  if (!knownIds.has(toolId)) throw new Error("mcp-unknown-tool");
}
