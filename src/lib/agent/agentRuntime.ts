/**
 * Phase 6 — Bounded agent runtime (renderer-side, no new IPC).
 *
 * Loop: request → scoped context → model proposal → strict parse →
 * allowlist+registry check → forced project scope → Phase 5 execute →
 * bounded DATA observation → … → FINAL | limit | deny | confirm.
 *
 * Hard guarantees (structural, not prompt hope):
 * - Every tool call goes through the injected executeTool (Phase 5).
 * - The model can never confirm: confirmation enters only via resumeAgentRun().
 * - The model can never change project scope: projectId is forced from context.
 * - No autonomous retries: one attempt per call, no retry loop.
 * - Tool output never becomes instructions: wrapped DATA + budgeted context.
 */
import { assertKnownTool } from "@/lib/tools/toolRegistry";
import type { ToolResult } from "@/lib/tools/toolTypes";
import {
  buildAgentSystemPrompt,
  parseModelTurn,
  summarizeToolResultForModel,
} from "@/lib/agent/agentPrompt";
import { AgentError } from "@/lib/agent/agentErrors";
import type {
  AgentActivityCallback,
  AgentDefinition,
  AgentModelFn,
  AgentRequest,
  AgentRun,
  AgentStep,
} from "@/lib/agent/agentTypes";

export interface AgentToolExecutor {
  (toolId: string, input: unknown, context: Record<string, unknown>): Promise<ToolResult>;
}

export interface AgentAuditEvent {
  eventId: string; toolId: string; toolVersion: string; requestId: string;
  timestamp: string; source: string; projectId?: string; permission: "READ_ONLY";
  risk: "LOW"; decision: "ALLOW" | "DENY" | "CONFIRM";
  status: "ok" | "denied" | "confirm_required" | "failed"; durationMs: number;
  resourceSummary: Record<string, unknown>; errorCategory?: string;
}

export type AgentAuditSink = (event: AgentAuditEvent) => void | Promise<void>;

export interface RunAgentOptions {
  signal?: AbortSignal;
  activity?: AgentActivityCallback;
  /** Confirmation supplied by the trusted app layer (never the model). */
  userConfirmed?: boolean;
  confirmedToolId?: string;
  audit?: AgentAuditSink;
}

export interface AgentRuntimeDeps {
  model: AgentModelFn;
  executeTool: AgentToolExecutor;
}

export interface AgentSource {
  title: string;
  url?: string;
  snippet?: string;
  id?: string;
}

export interface AgentRunOutput {
  run: AgentRun;
  sources: AgentSource[];
}

const RUN_REGISTRY = new Map<string, AgentRunOutput>();
const MAX_RUNS = 50;

function nowIso(): string {
  return new Date().toISOString();
}

function newRunId(): string {
  return `arun_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff).toString(36)}`.slice(0, 64);
}

function addStep(run: AgentRun, s: Omit<AgentStep, "index" | "timestamp">): AgentStep {
  const full: AgentStep = { ...s, index: run.steps.length, timestamp: nowIso() };
  run.steps.push(full);
  return full;
}

function emit(activity: AgentActivityCallback | undefined, run: AgentRun, kind: AgentStep["kind"], label: string, detail?: string): void {
  try {
    activity?.({ runId: run.runId, step: run.steps.length, kind, label, detail });
  } catch {
    /* activity must never break the run */
  }
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AgentError("RUN_CANCELLED");
}

/** Race a promise against the run budget (fail closed on expiry). */
function rejectAfter<T>(p: Promise<T>, ms: number, makeError: () => Error): Promise<T> {
  if (!Number.isFinite(ms) || ms < 0) return Promise.reject(makeError());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(makeError()), Math.max(0, ms));
  });
  return Promise.race([p.finally(() => { if (timer) clearTimeout(timer); }), timeout]);
}

/** Assemble bounded model context: system + request + newest-first DATA observations. */
function assembleMessages(def: AgentDefinition, run: AgentRun, system: string): Array<{ role: string; content: unknown }> {
  const budget = def.limits.maxContextChars;
  const reserved = system.length + run.request.length + 2000;
  let obsBudget = Math.max(0, Math.min(def.limits.maxObservationsChars, budget - reserved));
  const obsMessages: Array<{ role: string; content: unknown }> = [];
  for (let i = run.observations.length - 1; i >= 0 && obsBudget > 0; i--) {
    const slice = run.observations[i].summary.slice(0, obsBudget);
    obsBudget -= slice.length;
    obsMessages.unshift({ role: "user", content: slice });
  }
  return [
    { role: "system", content: system },
    { role: "user", content: run.request.slice(0, def.limits.maxRequestChars) },
    ...obsMessages,
  ];
}

function extractSources(toolId: string, data: unknown): AgentSource[] {
  try {
    const d = data as { entities?: Array<{ canonicalName?: string; id?: string }>; hits?: Array<{ title?: string; documentId?: string; snippet?: string }> };
    if (toolId === "knowledge.search" && Array.isArray(d.entities)) {
      return d.entities.slice(0, 6).map((e) => ({
        title: String(e.canonicalName ?? e.id ?? "Knowledge entity").slice(0, 200),
        id: e.id,
      }));
    }
    if (toolId === "document.search" && Array.isArray(d.hits)) {
      return d.hits.slice(0, 6).map((h) => ({
        title: String(h.title ?? h.documentId ?? "Document").slice(0, 200),
        snippet: typeof h.snippet === "string" ? h.snippet.slice(0, 300) : undefined,
        id: h.documentId,
      }));
    }
  } catch {
    return [];
  }
  return [];
}

function needsProject(toolId: string): boolean {
  return toolId === "knowledge.search" || toolId === "export.create" || toolId === "connector.import";
}

function activityLabelFor(toolId: string): string {
  if (toolId.startsWith("knowledge.")) return "Searching knowledge";
  if (toolId.startsWith("document.")) return "Reading documents";
  if (toolId.startsWith("connector.")) return "Checking connected sources";
  if (toolId === "project.get") return "Loading project";
  if (toolId === "export.create") return "Preparing export";
  if (toolId === "utility.calculate") return "Calculating";
  return `Using ${toolId}`;
}

function summarizeProposal(toolId: string, input: Record<string, unknown>): string {
  const keys = Object.keys(input).slice(0, 5).map((k) => {
    const v = input[k];
    const s = typeof v === "string" ? v.slice(0, 80) : Array.isArray(v) ? `[${v.length} items]` : typeof v;
    return `${k}=${s}`;
  });
  return `${toolId} (${keys.join(", ")})`.slice(0, 300);
}

function pushObservation(run: AgentRun, toolId: string, summary: string): void {
  run.observations.push({ toolId, summary: summary.slice(0, 4000) });
  if (run.observations.length > 12) run.observations.splice(0, run.observations.length - 12);
}

async function emitAudit(
  sink: AgentAuditSink | undefined, run: AgentRun, def: AgentDefinition,
  phase: string, decision: "ALLOW" | "DENY" | "CONFIRM",
  status: "ok" | "denied" | "confirm_required" | "failed",
  durationMs: number, errorCategory?: string
): Promise<void> {
  if (!sink) return;
  try {
    await sink({
      eventId: `aevt_${Date.now().toString(36)}_${run.runId.slice(-6)}_${phase}`,
      toolId: "agent.run",
      toolVersion: "1",
      requestId: run.requestId,
      timestamp: nowIso(),
      source: "agent",
      projectId: run.projectId,
      permission: "READ_ONLY",
      risk: "LOW",
      decision,
      status,
      durationMs: Math.max(0, Math.round(durationMs)),
      resourceSummary: {
        agentId: def.id,
        runId: run.runId,
        phase,
        counts: { steps: run.steps.length, toolCalls: run.toolCalls.length },
      },
      errorCategory,
    });
  } catch {
    /* audit must never break the run */
  }
}

function storeRun(output: AgentRunOutput): void {
  RUN_REGISTRY.set(output.run.runId, output);
  if (RUN_REGISTRY.size > MAX_RUNS) {
    const oldest = [...RUN_REGISTRY.keys()][0];
    if (oldest) RUN_REGISTRY.delete(oldest);
  }
}

interface LoopState {
  toolCalls: number;
  /** Confirmation bound for the whole (re)entry — app-supplied only. */
  confirmedToolId?: string;
}

/**
 * Single bounded loop driver used by both fresh runs and resumed runs.
 * Returns when the run completes, fails, suspends, or is cancelled.
 */
async function driveLoop(
  def: AgentDefinition,
  run: AgentRun,
  output: AgentRunOutput,
  deps: AgentRuntimeDeps,
  opts: RunAgentOptions,
  state: LoopState
): Promise<AgentRunOutput> {
  const system = buildAgentSystemPrompt(def, run.projectId);
  const runStartMs = new Date(run.startedAt).getTime();
  try {
    while (true) {
      checkAborted(opts.signal);
      if (Date.now() - runStartMs > def.limits.maxTimeMs) throw new AgentError("AGENT_TIMEOUT");
      if (run.steps.length >= def.limits.maxSteps) throw new AgentError("AGENT_STEP_LIMIT");

      emit(opts.activity, run, "model_reasoning", "Thinking", undefined);
      const stepStarted = Date.now();
      let modelText: string;
      try {
        // The run budget also bounds the model call itself (fail closed).
        const remaining = Math.max(0, runStartMs + def.limits.maxTimeMs - Date.now());
        const call = deps.model(assembleMessages(def, run, system), {
          signal: opts.signal ?? new AbortController().signal,
          streamFinal: false,
        });
        const res = await rejectAfter(call, remaining, () => new AgentError("AGENT_TIMEOUT"));
        checkAborted(opts.signal);
        modelText = res.text;
        if (res.route) run.modelRoute = res.route;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw new AgentError("RUN_CANCELLED");
        if (err instanceof AgentError) throw err;
        throw new AgentError("MODEL_FAILURE", err instanceof Error ? err.message.slice(0, 200) : undefined);
      }
      addStep(run, { kind: "model_reasoning", label: "Reasoned", durationMs: Date.now() - stepStarted });

      const decision = parseModelTurn(modelText);
      if (decision.type === "final") {
        const truncated = decision.text.length > def.limits.maxFinalChars;
        run.finalText = truncated
          ? `${decision.text.slice(0, def.limits.maxFinalChars)}\n\n…[response truncated to output budget]`
          : decision.text;
        addStep(run, { kind: "final_answer", label: "Synthesizing", detail: truncated ? "truncated" : undefined });
        emit(opts.activity, run, "final_answer", "Synthesizing answer", undefined);
        run.status = "completed";
        run.updatedAt = nowIso();
        run.durationMs = Date.now() - runStartMs;
        await emitAudit(opts.audit, run, def, "run_finish", "ALLOW", "ok", run.durationMs);
        return output;
      }

      // --- Tool proposal: validate everything before the executor. ---
      const { tool: proposedId, input: proposedInput } = decision.proposal;
      const deny = (label: string, note: string): void => {
        addStep(run, { kind: "policy_block", label, toolId: proposedId, decision: "DENY" });
        pushObservation(run, proposedId, note);
      };
      if (!def.toolAllowlist.includes(proposedId)) {
        deny(`Blocked unlisted tool ${proposedId.slice(0, 60)}`, `Policy: tool "${proposedId}" is not in this agent's allowlist.`);
        continue;
      }
      try {
        assertKnownTool(proposedId);
      } catch {
        deny(`Blocked unknown tool ${proposedId.slice(0, 60)}`, `Policy: tool "${proposedId}" is unknown.`);
        continue;
      }
      if (state.toolCalls >= def.limits.maxToolCalls) throw new AgentError("AGENT_TOOL_LIMIT");

      // Project scope is forced from run context — never from the model.
      const input = { ...(proposedInput as Record<string, unknown>) };
      if (run.projectId !== undefined) {
        if (typeof input.projectId === "string" && input.projectId !== run.projectId) {
          deny("Blocked cross-project access", "Policy: cross-project access denied. Stay in the active project.");
          continue;
        }
        if (input.projectId === undefined && needsProject(proposedId)) input.projectId = run.projectId;
      }

      const callStarted = Date.now();
      const label = activityLabelFor(proposedId);
      emit(opts.activity, run, "tool_call", label, proposedId);
      const toolCtx: Record<string, unknown> = {
        projectId: run.projectId,
        userInitiated: true,
        source: `agent:${run.runId}`,
        requestId: `${run.requestId}:s${run.steps.length}`,
        ...(state.confirmedToolId !== undefined ? { userConfirmed: true, confirmedToolId: state.confirmedToolId } : {}),
      };
      let result: ToolResult;
      try {
        result = await deps.executeTool(proposedId, input, toolCtx);
      } catch {
        result = {
          ok: false, toolId: proposedId, toolVersion: "?", requestId: toolCtx.requestId as string,
          error: "Tool execution failed.", errorKind: "TOOL_FAILED",
          decision: "DENY", durationMs: Date.now() - callStarted,
        };
      }
      state.toolCalls += 1;
      run.toolCalls.push({
        toolId: proposedId, requestId: result.requestId, decision: result.decision,
        ok: result.ok, errorKind: result.errorKind, durationMs: result.durationMs, timestamp: nowIso(),
      });

      if (result.decision === "CONFIRM") {
        run.status = "awaiting_confirmation";
        run.pendingConfirmation = {
          toolId: proposedId,
          requestId: result.requestId,
          summary: summarizeProposal(proposedId, input),
        };
        addStep(run, {
          kind: "confirmation_request", label: `Awaiting confirmation: ${proposedId}`,
          toolId: proposedId, decision: "CONFIRM", durationMs: Date.now() - callStarted,
        });
        emit(opts.activity, run, "confirmation_request", "Awaiting confirmation", proposedId);
        run.updatedAt = nowIso();
        run.durationMs = Date.now() - runStartMs;
        await emitAudit(opts.audit, run, def, "run_suspend", "CONFIRM", "confirm_required", run.durationMs);
        return output;
      }
      if (!result.ok) {
        const blocked = result.decision === "DENY";
        addStep(run, {
          kind: blocked ? "policy_block" : "tool_observation",
          label: blocked ? `Denied: ${proposedId}` : `Tool ${proposedId} failed`,
          toolId: proposedId, decision: result.decision, durationMs: Date.now() - callStarted,
        });
        pushObservation(run, proposedId,
          `Tool "${proposedId}" did not succeed (${result.errorKind ?? result.decision}). ${result.error ?? ""}`.slice(0, 500));
        run.updatedAt = nowIso();
        continue;
      }
      addStep(run, { kind: "tool_observation", label: `${label} — done`, toolId: proposedId, decision: "ALLOW", durationMs: Date.now() - callStarted });
      emit(opts.activity, run, "tool_observation", `${label} — done`, proposedId);
      pushObservation(run, proposedId, summarizeToolResultForModel(proposedId, result.data));
      for (const s of extractSources(proposedId, result.data)) {
        if (output.sources.length < 12) output.sources.push(s);
      }
      run.updatedAt = nowIso();
    }
  } catch (err) {
    const agentErr = err instanceof AgentError ? err : new AgentError("TOOL_FAILED", err instanceof Error ? err.message.slice(0, 200) : undefined);
    run.status = agentErr.kind === "RUN_CANCELLED" ? "cancelled" : "failed";
    run.errorKind = agentErr.kind;
    run.error = agentErr.message.slice(0, 500);
    addStep(run, { kind: "error", label: agentErr.message.slice(0, 200), detail: agentErr.kind });
    run.updatedAt = nowIso();
    run.durationMs = Date.now() - runStartMs;
    await emitAudit(opts.audit, run, def, "run_finish", "ALLOW", "failed", run.durationMs, agentErr.kind);
    return output;
  }
}

export async function runAgent(
  def: AgentDefinition,
  request: AgentRequest,
  deps: AgentRuntimeDeps,
  opts: RunAgentOptions = {}
): Promise<AgentRunOutput> {
  const started = Date.now();
  const cleanRequest = String(request.request ?? "").trim();
  if (!cleanRequest) throw new AgentError("TOOL_INVALID_INPUT", "empty request");
  if (cleanRequest.length > def.limits.maxRequestChars) throw new AgentError("CONTEXT_LIMIT", "request");

  const run: AgentRun = {
    runId: newRunId(),
    requestId: `areq_${Date.now().toString(36)}`,
    projectId: request.projectId,
    request: cleanRequest,
    agentId: def.id,
    status: "running",
    steps: [],
    toolCalls: [],
    observations: [],
    modelRoute: undefined,
    startedAt: nowIso(),
    updatedAt: nowIso(),
  };
  const output: AgentRunOutput = { run, sources: [] };
  storeRun(output);
  await emitAudit(opts.audit, run, def, "run_start", "ALLOW", "ok", Date.now() - started);
  return driveLoop(def, run, output, deps, opts, {
    toolCalls: 0,
    confirmedToolId: opts.userConfirmed === true ? opts.confirmedToolId : undefined,
  });
}

/**
 * Resume a suspended run with trusted-app confirmation (never model-supplied).
 * The confirmation must name the exact pending tool.
 */
export async function resumeAgentRun(
  runId: string,
  def: AgentDefinition,
  deps: AgentRuntimeDeps,
  confirmation: { userConfirmed: boolean; confirmedToolId: string },
  opts: RunAgentOptions = {}
): Promise<AgentRunOutput> {
  const stored = RUN_REGISTRY.get(runId);
  if (!stored) throw new AgentError("TOOL_INVALID_INPUT", "unknown run");
  const { run } = stored;
  if (run.status !== "awaiting_confirmation" || !run.pendingConfirmation) {
    throw new AgentError("TOOL_CONFIRMATION_REQUIRED", "run is not awaiting confirmation");
  }
  if (confirmation.userConfirmed !== true || confirmation.confirmedToolId !== run.pendingConfirmation.toolId) {
    throw new AgentError("TOOL_CONFIRMATION_REQUIRED", "confirmation mismatch");
  }
  run.status = "running";
  run.pendingConfirmation = undefined;
  run.updatedAt = nowIso();
  pushObservation(run, confirmation.confirmedToolId,
    `User confirmation recorded for "${confirmation.confirmedToolId}". You may proceed with the call.`);
  return driveLoop(def, run, stored, deps, opts, {
    toolCalls: run.toolCalls.length,
    confirmedToolId: confirmation.confirmedToolId,
  });
}

export function getStoredRun(runId: string): AgentRunOutput | undefined {
  return RUN_REGISTRY.get(runId);
}

export function cancelStoredRun(runId: string): boolean {
  const stored = RUN_REGISTRY.get(runId);
  if (!stored || (stored.run.status !== "running" && stored.run.status !== "awaiting_confirmation")) return false;
  stored.run.status = "cancelled";
  stored.run.updatedAt = nowIso();
  return true;
}

export function clearRunRegistryForTest(): void {
  RUN_REGISTRY.clear();
}
