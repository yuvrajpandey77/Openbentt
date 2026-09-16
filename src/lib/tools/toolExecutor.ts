/**
 * Phase 5 — Tool executor: resolve → validate input → validate context →
 * capability/policy check → execute (bounded timeout) → validate output →
 * audit → return. No step may be skipped; no dynamic invocation.
 */
import { TOOL_LIMITS } from "@/lib/tools/toolCore.mjs";
import { ToolError, toToolError } from "@/lib/tools/toolErrors";
import { getToolDefinition } from "@/lib/tools/toolRegistry";
import { validateToolInput, validateToolOutput } from "@/lib/tools/toolSchema";
import {
  buildAuditEvent,
  buildConfirmationRequest,
  ensureRequestId,
  evaluateToolPolicy,
  validateToolContext,
} from "@/lib/tools/toolPolicy";
import { runToolHandler } from "@/lib/tools/toolHandlers";
import type {
  ToolAuditEvent,
  ToolExecutionContext,
  ToolRequest,
  ToolResult,
} from "@/lib/tools/toolTypes";

export interface AuditSink {
  (event: ToolAuditEvent): void | Promise<void>;
}

const noopAudit: AuditSink = () => undefined;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ToolError("timeout")), ms);
  });
  return Promise.race([p.finally(() => { if (timer) clearTimeout(timer); }), timeout]) as Promise<T>;
}

function shortSummary(input: Record<string, unknown>): string {
  const keys = Object.keys(input);
  const head = keys.slice(0, 5).map((k) => {
    const v = input[k];
    const s = typeof v === "string" ? v.slice(0, 80) : Array.isArray(v) ? `[${v.length} items]` : typeof v;
    return `${k}=${s}`;
  });
  return head.join(", ").slice(0, 300);
}

export async function executeTool(
  toolId: string,
  rawInput: unknown,
  rawContext?: unknown,
  opts?: { audit?: AuditSink; timeoutMs?: number }
): Promise<ToolResult> {
  const started = Date.now();
  const audit = opts?.audit ?? noopAudit;
  const timeoutMs = Math.min(
    Math.max(Number(opts?.timeoutMs ?? TOOL_LIMITS.defaultTimeoutMs), 1000),
    TOOL_LIMITS.maxTimeoutMs
  );
  // 1. resolve (reject unknown tools before anything else).
  let def;
  try {
    def = getToolDefinition(toolId);
  } catch (err) {
    const e = toToolError(err);
    await audit(buildAuditEvent({
      tool: { id: String(toolId ?? "unknown"), version: "?", permission: "READ_ONLY", risk: "LOW" },
      requestId: "none", context: {}, decision: "DENY", status: "denied",
      durationMs: Date.now() - started, input: rawInput, errorCategory: e.kind,
    }));
    return {
      ok: false, toolId: String(toolId ?? "unknown"), toolVersion: "?",
      requestId: "none", error: e.message, errorKind: e.kind,
      decision: "DENY", durationMs: Date.now() - started,
    };
  }
  // 2-3. validate input + context.
  let input: Record<string, unknown>;
  let context: ToolExecutionContext;
  try {
    input = validateToolInput(def.inputSchema, rawInput, def.id);
    context = validateToolContext(rawContext);
  } catch (err) {
    const e = toToolError(err);
    const requestId = (rawContext as { requestId?: string } | undefined)?.requestId ?? "none";
    await audit(buildAuditEvent({
      tool: def, requestId, context: {}, decision: "DENY", status: "denied",
      durationMs: Date.now() - started, input: rawInput, errorCategory: e.kind,
    }));
    return {
      ok: false, toolId: def.id, toolVersion: def.version, requestId,
      error: e.message, errorKind: e.kind, decision: "DENY", durationMs: Date.now() - started,
    };
  }
  const requestId = ensureRequestId(context);
  // 4-6. policy check (capabilities + permission + risk).
  const { decision } = evaluateToolPolicy(def, context);
  if (decision === "DENY") {
    await audit(buildAuditEvent({
      tool: def, requestId, context, decision, status: "denied",
      durationMs: Date.now() - started, input,
      errorCategory: def.permission === "SYSTEM_INTERNAL" ? "permission_denied" : "permission_denied",
    }));
    const e = new ToolError("permission_denied", def.id);
    return {
      ok: false, toolId: def.id, toolVersion: def.version, requestId,
      error: e.message, errorKind: e.kind, decision, durationMs: Date.now() - started,
    };
  }
  if (decision === "CONFIRM") {
    const req: ToolRequest = buildConfirmationRequest(def, shortSummary(input));
    await audit(buildAuditEvent({
      tool: def, requestId, context, decision, status: "confirm_required",
      durationMs: Date.now() - started, input,
      resourceIds: Array.isArray((input as { items?: unknown[] }).items)
        ? ((input as { items: { externalId?: string }[] }).items ?? []).slice(0, 20).map((i) => String(i?.externalId ?? "?"))
        : undefined,
    }));
    const e = new ToolError("confirmation_required", def.id);
    return {
      ok: false, toolId: def.id, toolVersion: def.version, requestId,
      error: e.message, errorKind: e.kind, decision,
      durationMs: Date.now() - started,
      data: req as unknown as Record<string, unknown>,
    };
  }
  // 7-9. execute with bounded timeout, then validate output.
  try {
    const raw = await withTimeout(runToolHandler(def.id, input, context), timeoutMs);
    const data = validateToolOutput(def.outputSchema, raw, def.id) as Record<string, unknown>;
    const resourceIds = extractResourceIds(def.id, data);
    await audit(buildAuditEvent({
      tool: def, requestId, context, decision: "ALLOW", status: "ok",
      durationMs: Date.now() - started, input, resourceIds,
      counts: countResult(def.id, data),
    }));
    return {
      ok: true, toolId: def.id, toolVersion: def.version, requestId,
      data, decision: "ALLOW", durationMs: Date.now() - started,
    };
  } catch (err) {
    const e = toToolError(err);
    await audit(buildAuditEvent({
      tool: def, requestId, context, decision: "ALLOW", status: "failed",
      durationMs: Date.now() - started, input, errorCategory: e.kind,
    }));
    return {
      ok: false, toolId: def.id, toolVersion: def.version, requestId,
      error: e.message, errorKind: e.kind, decision: "ALLOW",
      durationMs: Date.now() - started,
    };
  }
}

function extractResourceIds(toolId: string, data: Record<string, unknown>): string[] {
  try {
    if (toolId === "knowledge.search") {
      return ((data.entities as { id?: string }[] | undefined) ?? []).slice(0, 50).map((e) => String(e?.id ?? "?"));
    }
    if (toolId === "knowledge.get_entity") {
      const e = data.entity as { id?: string } | undefined;
      return e?.id ? [String(e.id)] : [];
    }
    if (toolId === "document.search") {
      return ((data.hits as { documentId?: string }[] | undefined) ?? []).slice(0, 50).map((h) => String(h?.documentId ?? "?"));
    }
    if (toolId === "connector.import") {
      const r = data.result as { created?: string[]; updated?: string[] } | undefined;
      return [...(r?.created ?? []), ...(r?.updated ?? [])].slice(0, 50).map(String);
    }
  } catch {
    return [];
  }
  return [];
}

function countResult(toolId: string, data: Record<string, unknown>): Record<string, number> {
  try {
    for (const k of ["entities", "relationships", "evidence", "hits", "connectors", "preview", "items"]) {
      if (Array.isArray((data as Record<string, unknown[]>)[k])) {
        return { [k]: (data as Record<string, unknown[]>)[k].length };
      }
    }
    if (toolId === "connector.import") {
      const c = (data.result as { counts?: Record<string, number> } | undefined)?.counts;
      if (c) return c;
    }
    if (toolId === "export.create") {
      const c = (data.export as { counts?: Record<string, number> } | undefined)?.counts;
      if (c) return c;
    }
  } catch {
    return {};
  }
  return {};
}
