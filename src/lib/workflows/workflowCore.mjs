/**
 * Phase 8 — Workflow core (single source of truth, deterministic).
 * Plain JS shared by Electron store and UI. No network, no secrets.
 *
 * Model: TRIGGER → CONDITION → AGENT/TOOL → APPROVAL → ACTION → AUDIT.
 * Workflows never execute actions directly: a tool step that requires
 * confirmation suspends the run and mints an approval; the run resumes only
 * after trusted-UI approval. No simulated triggers: manual, schedule
 * (interval), and sync_completed (real sync events) only.
 */

export const WORKFLOW_TRIGGER_KINDS = ["manual", "schedule", "sync_completed"];

export const WORKFLOW_STEP_KINDS = ["tool_call", "approval_wait", "condition"];

export const WORKFLOW_STATUSES = ["running", "awaiting_approval", "completed", "failed", "cancelled"];

export const WORKFLOW_RUN_STATUSES = WORKFLOW_STATUSES;

export function newWorkflowId(prefix = "wf") {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff).toString(36)}`.slice(0, 64);
}

export function newWorkflowRunId(prefix = "wfrun") {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff).toString(36)}`.slice(0, 64);
}

function isRecord(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function validateTrigger(raw) {
  if (!isRecord(raw)) return "trigger must be an object";
  if (!WORKFLOW_TRIGGER_KINDS.includes(raw.kind)) return "unknown trigger kind";
  if (raw.kind === "schedule") {
    const n = Number(raw.intervalMinutes);
    if (!Number.isFinite(n) || Math.floor(n) < 5 || Math.floor(n) > 1440) {
      return "schedule interval must be 5–1440 minutes";
    }
  }
  if (raw.kind === "sync_completed") {
    if (typeof raw.connectorId !== "string" || !raw.connectorId) return "sync_completed requires connectorId";
  }
  return null;
}

export function validateStep(raw, index) {
  if (!isRecord(raw)) return `step ${index} must be an object`;
  if (!WORKFLOW_STEP_KINDS.includes(raw.kind)) return `step ${index} has unknown kind`;
  if (raw.kind === "tool_call") {
    if (typeof raw.toolId !== "string" || !raw.toolId || raw.toolId.length > 128) {
      return `step ${index} requires toolId`;
    }
    if (raw.input !== undefined && !isRecord(raw.input)) return `step ${index} input must be an object`;
  }
  if (raw.kind === "approval_wait") {
    if (typeof raw.approvalId !== "string" || !raw.approvalId) return `step ${index} requires approvalId`;
  }
  if (raw.kind === "condition") {
    if (typeof raw.expression !== "string" || !raw.expression.trim()) return `step ${index} requires expression`;
  }
  return null;
}

export function validateWorkflow(raw) {
  if (!isRecord(raw)) return "workflow must be an object";
  if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 200) {
    return "workflow name is required (max 200 chars)";
  }
  if (raw.description !== undefined && (typeof raw.description !== "string" || raw.description.length > 2000)) {
    return "description too long";
  }
  const terr = validateTrigger(raw.trigger);
  if (terr) return terr;
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) return "at least one step is required";
  if (raw.steps.length > 20) return "at most 20 steps";
  for (let i = 0; i < raw.steps.length; i++) {
    const serr = validateStep(raw.steps[i], i);
    if (serr) return serr;
  }
  return null;
}

/**
 * Evaluate a condition step against run state. Deliberately tiny and
 * deterministic: `field operator value` over counts/status fields only
 * (e.g. "counts.imported > 0", "status == synced"). Anything else is false
 * (fail closed) — no expression language, no code.
 */
export function evaluateCondition(expression, state) {
  try {
    const m = String(expression ?? "").trim().match(/^([a-zA-Z0-9_.]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (!m) return false;
    const [, path, op, rawVal] = m;
    const actual = path.split(".").reduce((acc, k) => (isRecord(acc) ? acc[k] : undefined), state);
    let expected = rawVal.trim();
    if (/^-?\d+(\.\d+)?$/.test(expected)) expected = Number(expected);
    else if (/^".*"$/.test(expected)) expected = expected.slice(1, -1);
    else if (expected === "true") expected = true;
    else if (expected === "false") expected = false;
    else if (!/^[a-zA-Z0-9_-]+$/.test(expected)) return false;
    switch (op) {
      case "==": return actual === expected;
      case "!=": return actual !== expected;
      case ">": return Number(actual) > Number(expected);
      case "<": return Number(actual) < Number(expected);
      case ">=": return Number(actual) >= Number(expected);
      case "<=": return Number(actual) <= Number(expected);
      default: return false;
    }
  } catch {
    return false;
  }
}

export function isTerminalRunStatus(status) {
  return status === "completed" || status === "failed" || status === "cancelled";
}
