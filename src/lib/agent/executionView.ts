/**
 * Canonical execution view model (renderer-side, pure).
 *
 * Answers "what is OpenCode doing right now?" from a task + its canonical
 * event stream. Chat stays conversational; this module powers the operational
 * surface (timeline, terminal, changes, permissions, questions, logs).
 *
 * No Node APIs, no IPC — all inputs are plain data. Tested in
 * executionView.test.ts.
 */
import type { OpenCodeAgentEvent, OpenCodeTask } from "./openCodeTypes";

export type ExecutionStatus =
  | "idle"
  | "starting"
  | "running"
  | "thinking"
  | "tool_running"
  | "terminal_running"
  | "waiting_permission"
  | "waiting_user"
  | "editing"
  | "completed"
  | "failed"
  | "cancelled";

export interface ExecutionSnapshot {
  status: ExecutionStatus;
  /** Human-readable current activity, e.g. "Running tests — npm test". */
  headline: string;
  /** Detail line: command, file, tool, question, or permission target. */
  detail?: string;
  /** Pending permission request payload, if any. */
  pendingPermission?: Record<string, unknown>;
  /** Pending question payload, if any. */
  pendingQuestion?: Record<string, unknown>;
  /** Active tool call (tool + callId), if any. */
  activeTool?: { tool: string; callId?: string };
  /** Active terminal command, if any. */
  activeCommand?: string;
  /** Last error message, if any. */
  lastError?: string;
  /** Context usage, if reported. */
  context?: { input: number; output: number; cost?: number };
  /** Todo list, if reported. */
  todos?: Array<{ content: string; status: string; priority: string }>;
}

function payload(e: OpenCodeAgentEvent): Record<string, unknown> {
  return (e.payload ?? {}) as Record<string, unknown>;
}

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Latest event of any of the given types (events are chronological). */
function latest(events: OpenCodeAgentEvent[], types: Set<string>): OpenCodeAgentEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (types.has(events[i].type)) return events[i];
  }
  return undefined;
}

const TERMINAL_TYPES = new Set(["agent.terminal.started", "agent.terminal.output", "agent.terminal.completed"]);
const PERMISSION_TYPES = new Set(["agent.permission.requested", "agent.permission.replied"]);
const QUESTION_TYPES = new Set(["agent.question.requested", "agent.question.answered", "agent.question.rejected"]);
const TOOL_ACTIVE_TYPES = new Set(["agent.tool.started", "agent.tool.progress"]);
const TOOL_DONE_TYPES = new Set(["agent.tool.completed", "agent.tool.failed"]);
const FAILURE_TYPES = new Set(["agent.tool.failed", "agent.step.failed", "agent.error"]);

/**
 * Derive the execution snapshot. Only uses reliably derivable state:
 * task status + waitingKind + the latest semantic events.
 */
export function deriveExecutionStatus(
  task: Pick<OpenCodeTask, "status" | "waitingKind" | "error"> | undefined,
  events: OpenCodeAgentEvent[],
): ExecutionSnapshot {
  const idle: ExecutionSnapshot = { status: "idle", headline: "Idle" };
  if (!task) return idle;

  const pendingPermissionEvt = latest(events, new Set(["agent.permission.requested"]));
  const permissionRepliedAfter =
    pendingPermissionEvt !== undefined &&
    events.some(
      (e) => e.type === "agent.permission.replied" && e.timestamp >= pendingPermissionEvt.timestamp,
    );
  const pendingQuestionEvt = latest(events, new Set(["agent.question.requested"]));
  const questionResolvedAfter =
    pendingQuestionEvt !== undefined &&
    events.some(
      (e) =>
        (e.type === "agent.question.answered" || e.type === "agent.question.rejected") &&
        e.timestamp >= pendingQuestionEvt.timestamp,
    );

  const lastFailure = latest(events, FAILURE_TYPES);
  const lastError = lastFailure ? str(payload(lastFailure).message, 500) || undefined : undefined;
  const contextEvt = latest(events, new Set(["agent.context.updated"]));
  const todoEvt = latest(events, new Set(["agent.todo.updated"]));

  const base: ExecutionSnapshot = {
    status: "running",
    headline: "Working",
    lastError,
    context: contextEvt
      ? {
          input: Number(payload(contextEvt).input ?? 0) || 0,
          output: Number(payload(contextEvt).output ?? 0) || 0,
          cost: typeof payload(contextEvt).cost === "number" ? (payload(contextEvt).cost as number) : undefined,
        }
      : undefined,
    todos: todoEvt && Array.isArray(payload(todoEvt).todos)
      ? ((payload(todoEvt).todos as Array<Record<string, unknown>>).slice(0, 50).map((t) => ({
        content: str(t.content, 300),
        status: str(t.status, 32) || "pending",
        priority: str(t.priority, 16) || "medium",
      })))
      : undefined,
  };

  switch (task.status) {
    case "QUEUED":
    case "STARTING":
      return { ...base, status: "starting", headline: "Starting" };
    case "COMPLETED":
      return { ...base, status: "completed", headline: "Completed" };
    case "FAILED":
    case "CRASHED":
      return { ...base, status: "failed", headline: "Failed", lastError: task.error ?? lastError };
    case "CANCELLED":
      return { ...base, status: "cancelled", headline: "Cancelled" };
    case "UNKNOWN":
      return { ...base, status: "idle", headline: "Interrupted — verify before retrying" };
    default:
      break;
  }

  // WAITING_FOR_PERMISSION splits into permission vs question.
  if (task.status === "WAITING_FOR_PERMISSION") {
    if ((task.waitingKind === "question" || (!task.waitingKind && pendingQuestionEvt && !questionResolvedAfter)) &&
      pendingQuestionEvt && !questionResolvedAfter) {
      const qs = payload(pendingQuestionEvt);
      const first = Array.isArray(qs.questions) ? (qs.questions[0] as Record<string, unknown>) : undefined;
      return {
        ...base,
        status: "waiting_user",
        headline: "Waiting for your input",
        detail: first ? str(first.question, 300) || str(first.header, 200) : "The agent asked a question",
        pendingQuestion: qs,
      };
    }
    if (pendingPermissionEvt && !permissionRepliedAfter) {
      const qp = payload(pendingPermissionEvt);
      return {
        ...base,
        status: "waiting_permission",
        headline: "Waiting for permission",
        detail: str(qp.description, 300) || `OpenCode wants to ${str(qp.serverAction ?? qp.capability, 120)}`,
        pendingPermission: qp,
      };
    }
    // Stale WAITING flag (e.g. hydrated before resync) — report honestly.
    return { ...base, status: "running", headline: "Working" };
  }

  // RUNNING: refine from the latest semantic event.
  const lastTerminal = latest(events, TERMINAL_TYPES);
  const lastToolActive = latest(events, TOOL_ACTIVE_TYPES);
  const lastToolDone = latest(events, TOOL_DONE_TYPES);
  const toolStillOpen =
    lastToolActive !== undefined &&
    (!lastToolDone || lastToolDone.timestamp < lastToolActive.timestamp);

  // An unterminated terminal (started without completion after it) wins.
  if (lastTerminal?.type === "agent.terminal.started" || lastTerminal?.type === "agent.terminal.output") {
    const cmd = str(payload(lastTerminal).command, 300);
    return {
      ...base,
      status: "terminal_running",
      headline: cmd ? `Running ${cmd.split(" ").slice(0, 3).join(" ")}` : "Running command",
      detail: cmd || undefined,
      activeCommand: cmd || undefined,
    };
  }
  if (toolStillOpen && lastToolActive) {
    const tp = payload(lastToolActive);
    const tool = str(tp.tool, 120) || "tool";
    const fileArg =
      tool === "read" || tool === "write" || tool === "edit"
        ? fileFromInput(tp.input)
        : undefined;
    if (tool === "bash") {
      const cmd = commandFromInput(tp.input);
      return {
        ...base, status: "terminal_running",
        headline: cmd ? `Running ${cmd.split(" ").slice(0, 3).join(" ")}` : "Running command",
        detail: cmd || undefined, activeCommand: cmd || undefined,
        activeTool: { tool, callId: str(tp.callId, 120) || undefined },
      };
    }
    if (fileArg) {
      return {
        ...base, status: "editing",
        headline: tool === "read" ? `Reading ${shortPath(fileArg)}` : `Editing ${shortPath(fileArg)}`,
        detail: fileArg, activeTool: { tool, callId: str(tp.callId, 120) || undefined },
      };
    }
    return {
      ...base, status: "tool_running",
      headline: `Running ${tool}`,
      activeTool: { tool, callId: str(tp.callId, 120) || undefined },
    };
  }
  if (latest(events, new Set(["agent.thinking", "agent.reasoning.delta"]))) {
    const inLastFive = events.slice(-5).some((e) => e.type === "agent.thinking" || e.type === "agent.reasoning.delta");
    if (inLastFive) return { ...base, status: "thinking", headline: "Thinking" };
  }
  return base;
}

function fileFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const v = o.filePath ?? o.path ?? o.file;
  return typeof v === "string" && v ? v.slice(0, 500) : undefined;
}

function commandFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const v = o.command;
  return typeof v === "string" && v ? v.slice(0, 500) : undefined;
}

function shortPath(p: string): string {
  const parts = p.split("/");
  return parts.length > 3 ? `…/${parts.slice(-2).join("/")}` : p;
}

/* ---------------- selectors (timeline tabs) ---------------- */

export function selectTerminalEvents(events: OpenCodeAgentEvent[]): OpenCodeAgentEvent[] {
  return events.filter(
    (e) =>
      e.type === "agent.terminal.started" ||
      e.type === "agent.terminal.output" ||
      e.type === "agent.terminal.completed" ||
      e.type === "agent.command.requested" ||
      e.type === "agent.command.output",
  );
}

export function selectChangeEvents(events: OpenCodeAgentEvent[]): OpenCodeAgentEvent[] {
  return events.filter(
    (e) => e.type === "agent.file.changed" || e.type === "agent.diff.updated",
  );
}

export function selectPermissionEvents(events: OpenCodeAgentEvent[]): OpenCodeAgentEvent[] {
  return events.filter((e) => PERMISSION_TYPES.has(e.type));
}

export function selectQuestionEvents(events: OpenCodeAgentEvent[]): OpenCodeAgentEvent[] {
  return events.filter((e) => QUESTION_TYPES.has(e.type));
}

export function selectLogEvents(events: OpenCodeAgentEvent[]): OpenCodeAgentEvent[] {
  return events.filter(
    (e) =>
      e.type === "agent.error" ||
      e.type === "agent.failed" ||
      e.type === "agent.tool.failed" ||
      e.type === "agent.step.failed" ||
      e.type === "agent.session.idle",
  );
}

export function selectToolEvents(events: OpenCodeAgentEvent[]): OpenCodeAgentEvent[] {
  return events.filter(
    (e) =>
      e.type === "agent.tool.started" ||
      e.type === "agent.tool.progress" ||
      e.type === "agent.tool.output" ||
      e.type === "agent.tool.completed" ||
      e.type === "agent.tool.failed" ||
      e.type === "agent.step.started" ||
      e.type === "agent.step.completed" ||
      e.type === "agent.step.failed" ||
      e.type === "agent.subagent.started",
  );
}

/** Pending (unresolved) permission request payload, if any. */
export function pendingPermission(events: OpenCodeAgentEvent[]): Record<string, unknown> | undefined {
  const req = latest(events, new Set(["agent.permission.requested"]));
  if (!req) return undefined;
  const resolved = events.some(
    (e) => e.type === "agent.permission.replied" && e.timestamp >= req.timestamp,
  );
  return resolved ? undefined : payload(req);
}

/** Pending (unresolved) question payload, if any. */
export function pendingQuestion(events: OpenCodeAgentEvent[]): Record<string, unknown> | undefined {
  const req = latest(events, new Set(["agent.question.requested"]));
  if (!req) return undefined;
  const resolved = events.some(
    (e) =>
      (e.type === "agent.question.answered" || e.type === "agent.question.rejected") &&
      e.timestamp >= req.timestamp,
  );
  return resolved ? undefined : payload(req);
}

/** Streaming text accumulator: appends deltas with a hard cap (perf). */
export function appendDelta(current: string, delta: string, maxChars = 60000): string {
  if (!delta) return current;
  const next = current + delta;
  return next.length > maxChars ? next.slice(-maxChars) : next;
}

/**
 * Heal streaming content with a full-text snapshot (engine text parts arrive
 * whole while deltas stream incrementally). Longest-overlap merge: finds the
 * largest k where the current tail matches the snapshot head, so redelivered
 * or partially-missed content neither duplicates nor drops text.
 */
export function mergeStreamingText(current: string, full: string, maxChars = 60000): string {
  if (!full) return current;
  if (!current) return full.slice(-maxChars);
  if (current.endsWith(full)) return current;
  if (full.startsWith(current)) return full.slice(-maxChars);
  const maxOverlap = Math.min(current.length, full.length, 8000);
  let overlap = 0;
  for (let k = Math.min(maxOverlap, full.length); k > 0; k--) {
    if (current.endsWith(full.slice(0, k))) {
      overlap = k;
      break;
    }
  }
  return `${current}${full.slice(overlap)}`.slice(-maxChars);
}

/** Human-readable one-liner for timeline rendering. */
export function humanizeExecutionEvent(e: OpenCodeAgentEvent): string {
  const p = payload(e);
  const msg = str(p.message, 140);
  const file = str(p.file, 200);
  const target = str(p.target, 200);
  switch (e.type) {
    case "agent.started":
      return "Working on it…";
    case "agent.thinking":
      return msg ? `Thinking · ${msg}` : "Thinking…";
    case "agent.status":
      return msg ? `Status · ${msg}` : "Status update";
    case "agent.tool.requested":
      return `Tool requested · ${str(p.tool ?? p.capability, 120) || "tool"}`;
    case "agent.tool.started": {
      const t = str(p.tool, 120) || "tool";
      const cmd = commandFromInput(p.input);
      const f = fileFromInput(p.input);
      if (cmd) return `Run · ${cmd.slice(0, 140)}`;
      if (f) return `${t === "read" ? "Read" : "Edit"} · ${f.slice(0, 140)}`;
      return `Running · ${t}`;
    }
    case "agent.tool.progress":
      return msg ? `Working · ${msg}` : "Working…";
    case "agent.tool.output":
      return msg ? `Output · ${msg}` : "Tool output";
    case "agent.tool.completed": {
      const out = str(p.output, 140);
      return out && out !== "[completed]" ? `Done · ${out}` : "Tool completed";
    }
    case "agent.tool.failed":
      return `Tool failed · ${(msg || "see details").slice(0, 140)}`;
    case "agent.step.started":
      return "Step started";
    case "agent.step.completed":
      return "Step finished";
    case "agent.step.failed":
      return "Step failed";
    case "agent.file.changed":
      return `Changed file · ${file || target || "file"}`;
    case "agent.diff.updated": {
      const files = Array.isArray(p.files) ? p.files : [];
      return files.length ? `Changed ${files.length} file${files.length === 1 ? "" : "s"}` : "Changes updated";
    }
    case "agent.command.requested":
      return `Command requested · ${str(p.command ?? target, 140)}`;
    case "agent.command.output":
      return msg ? `Command output · ${msg}` : "Command output";
    case "agent.terminal.started":
      return str(p.command, 140) ? `$ ${str(p.command, 140)}` : "Terminal started";
    case "agent.terminal.output":
      return str(p.output, 140) || "Terminal output";
    case "agent.terminal.completed": {
      const code = p.exitCode;
      return typeof code === "number" ? `Exit code: ${code}` : "Terminal finished";
    }
    case "agent.message.delta":
      return str(p.delta, 140);
    case "agent.message.completed":
      return "Response completed";
    case "agent.reasoning.delta":
      return str(p.delta, 140);
    case "agent.todo.updated": {
      const todos = Array.isArray(p.todos) ? p.todos : [];
      const active = todos.find((t) => (t as Record<string, unknown>).status === "in_progress") as Record<string, unknown> | undefined;
      return active ? `Next · ${str(active.content, 140)}` : todos.length ? `${todos.length} task${todos.length === 1 ? "" : "s"} planned` : "Plan updated";
    }
    case "agent.context.updated": {
      const input = Number(p.input ?? 0) || 0;
      const output = Number(p.output ?? 0) || 0;
      return `Context · ${(input + output).toLocaleString()} tokens`;
    }
    case "agent.session.status":
      return msg ? `Engine · ${msg}` : `Engine ${str(p.status, 32)}`;
    case "agent.session.idle":
      return "Engine idle — turn finished";
    case "agent.subagent.started":
      return `Subagent · ${str(p.agent, 120) || "started"}`;
    case "agent.permission.requested":
      return `Permission required · ${str(p.serverAction ?? p.capability, 120)} ${target}`.slice(0, 160);
    case "agent.permission.replied":
      return `Permission ${str(p.reply, 32) === "reject" ? "denied" : "decided"}`;
    case "agent.question.requested": {
      const qs = Array.isArray(p.questions) ? (p.questions[0] as Record<string, unknown>) : undefined;
      return qs ? `Question · ${str(qs.question ?? qs.header, 140)}` : "Question asked";
    }
    case "agent.question.answered":
      return "Answered — resuming";
    case "agent.question.rejected":
      return "Question dismissed";
    case "agent.error":
      return `Error · ${(msg || "see details").slice(0, 140)}`;
    case "agent.completed":
      return msg ? `Done · ${msg.slice(0, 160)}` : "Completed";
    case "agent.failed":
      return `Failed · ${(msg || "see details").slice(0, 160)}`;
    case "agent.cancelled":
      return "Cancelled";
    default:
      return e.type;
  }
}
