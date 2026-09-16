/**
 * Phase 5 — Policy + context + audit facades over toolCore.mjs.
 * The policy engine is deterministic: (tool, context) -> ALLOW/DENY/CONFIRM.
 */
import {
  buildToolRequest,
  evaluatePolicy,
  newEventId,
  newRequestId,
  summarizeForAudit,
} from "@/lib/tools/toolCore.mjs";
import { ToolError } from "@/lib/tools/toolErrors";
import type {
  PolicyDecision,
  ToolAuditEvent,
  ToolDefinition,
  ToolExecutionContext,
  ToolRequest,
} from "@/lib/tools/toolTypes";

export function evaluateToolPolicy(
  tool: Pick<ToolDefinition, "id" | "permission" | "risk" | "capabilities">,
  context: ToolExecutionContext
): { decision: PolicyDecision; reason: string } {
  return evaluatePolicy(
    { id: tool.id, permission: tool.permission, risk: tool.risk, capabilities: tool.capabilities },
    {
      userInitiated: context.userInitiated,
      userConfirmed: context.userConfirmed,
      confirmedToolId: context.confirmedToolId,
      systemInternal: context.systemInternal,
    }
  ) as { decision: PolicyDecision; reason: string };
}

/** Validate the execution context shape (never carries secrets). */
export function validateToolContext(raw: unknown): ToolExecutionContext {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new ToolError("invalid_context");
  const c = raw as Record<string, unknown>;
  const out: ToolExecutionContext = {};
  if (c.projectId !== undefined) {
    if (typeof c.projectId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(c.projectId)) {
      throw new ToolError("invalid_context", "projectId");
    }
    out.projectId = c.projectId;
  }
  for (const k of ["userInitiated", "userConfirmed", "systemInternal"] as const) {
    if (c[k] !== undefined) {
      if (typeof c[k] !== "boolean") throw new ToolError("invalid_context", k);
      out[k] = c[k];
    }
  }
  if (c.confirmedToolId !== undefined) {
    if (typeof c.confirmedToolId !== "string" || c.confirmedToolId.length > 128) {
      throw new ToolError("invalid_context", "confirmedToolId");
    }
    out.confirmedToolId = c.confirmedToolId;
  }
  if (c.source !== undefined) {
    if (typeof c.source !== "string" || c.source.length > 64) throw new ToolError("invalid_context", "source");
    out.source = c.source;
  }
  if (c.requestId !== undefined) {
    if (typeof c.requestId !== "string" || c.requestId.length > 64) throw new ToolError("invalid_context", "requestId");
    out.requestId = c.requestId;
  }
  return out;
}

export function ensureRequestId(context: ToolExecutionContext): string {
  if (context.requestId) return context.requestId;
  const id = newRequestId() as string;
  context.requestId = id;
  return id;
}

export function buildConfirmationRequest(tool: ToolDefinition, inputSummary: string): ToolRequest {
  return buildToolRequest(
    { id: tool.id, name: tool.name, version: tool.version, risk: tool.risk, permission: tool.permission, capabilities: tool.capabilities },
    inputSummary
  ) as ToolRequest;
}

export function buildAuditEvent(args: {
  tool: Pick<ToolDefinition, "id" | "version" | "permission" | "risk">;
  requestId: string;
  context: ToolExecutionContext;
  decision: PolicyDecision;
  status: ToolAuditEvent["status"];
  durationMs: number;
  input: unknown;
  resourceIds?: string[];
  counts?: Record<string, number>;
  errorCategory?: string;
}): ToolAuditEvent {
  return {
    eventId: newEventId() as string,
    toolId: args.tool.id,
    toolVersion: args.tool.version,
    requestId: args.requestId,
    timestamp: new Date().toISOString(),
    source: args.context.source ?? "unknown",
    projectId: args.context.projectId,
    permission: args.tool.permission,
    risk: args.tool.risk,
    decision: args.decision,
    status: args.status,
    durationMs: Math.max(0, Math.round(args.durationMs)),
    resourceSummary: {
      input: summarizeForAudit(args.input),
      resourceIds: (args.resourceIds ?? []).slice(0, 50),
      counts: args.counts ?? {},
    },
    errorCategory: args.errorCategory?.slice(0, 120),
  };
}
