/**
 * Phase 8 — Minimal deterministic workflow engine (main process only).
 * Workflows/steps validated by workflowCore.mjs. Execution is real:
 * tool_call steps run through executeToolMain (policy enforced); a CONFIRM
 * decision suspends the run as awaiting_approval with the minted approval id;
 * the run resumes only via resumeWorkflowRun after trusted-UI approval.
 * Schedule triggers are driven by the workflow tick (60 s); sync_completed
 * triggers dispatch from the sync scheduler. No simulated events.
 */
import { getDb } from "./researchDb.mjs";
import { createLogger } from "./log.mjs";
import { executeToolMain, recordToolAuditEvent } from "./toolStore.mjs";
import { getApproval } from "./actionStore.mjs";
import {
  evaluateCondition,
  isTerminalRunStatus,
  newWorkflowId,
  newWorkflowRunId,
  validateWorkflow,
  WORKFLOW_TRIGGER_KINDS,
} from "../src/lib/workflows/workflowCore.mjs";

const log = createLogger("workflows");
const TICK_MS = 60 * 1000;
const MAX_STEPS_PER_TICK = 20;

function fail(message) {
  throw new Error(`Workflows: ${message}`);
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/* ---------------- definitions ---------------- */

export function createWorkflow(app, raw) {
  const err = validateWorkflow(raw ?? {});
  if (err) fail(err);
  const id = newWorkflowId();
  const now = nowIso();
  const db = getDb(app);
  db.prepare(
    `INSERT INTO workflows (id, name, description, trigger_json, steps_json, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(raw.name).trim().slice(0, 200),
    typeof raw.description === "string" ? raw.description.slice(0, 2000) : "",
    JSON.stringify(raw.trigger).slice(0, 4000),
    JSON.stringify(raw.steps.slice(0, 20)).slice(0, 20000),
    raw.enabled === false ? 0 : 1,
    now, now
  );
  return getWorkflow(app, id);
}

export function getWorkflow(app, id) {
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM workflows WHERE id = ?").get(id);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trigger: parseJson(row.trigger_json, { kind: "manual" }),
    steps: parseJson(row.steps_json, []),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listWorkflows(app) {
  const db = getDb(app);
  return db.prepare("SELECT id FROM workflows ORDER BY updated_at DESC").all()
    .map((r) => getWorkflow(app, r.id)).filter(Boolean);
}

export function updateWorkflow(app, id, patch = {}) {
  const current = getWorkflow(app, id);
  if (!current) fail("workflow not found");
  const next = {
    name: patch.name === undefined ? current.name : String(patch.name),
    description: patch.description === undefined ? current.description : String(patch.description ?? ""),
    trigger: patch.trigger === undefined ? current.trigger : patch.trigger,
    steps: patch.steps === undefined ? current.steps : patch.steps,
  };
  const err = validateWorkflow(next);
  if (err) fail(err);
  const db = getDb(app);
  db.prepare(
    "UPDATE workflows SET name = ?, description = ?, trigger_json = ?, steps_json = ?, enabled = ?, updated_at = ? WHERE id = ?"
  ).run(
    next.name.trim().slice(0, 200),
    next.description.slice(0, 2000),
    JSON.stringify(next.trigger).slice(0, 4000),
    JSON.stringify(next.steps.slice(0, 20)).slice(0, 20000),
    patch.enabled === undefined ? (current.enabled ? 1 : 0) : (patch.enabled === false ? 0 : 1),
    nowIso(), id
  );
  return getWorkflow(app, id);
}

export function deleteWorkflow(app, id) {
  const db = getDb(app);
  db.prepare("DELETE FROM workflow_runs WHERE workflow_id = ?").run(id);
  db.prepare("DELETE FROM workflows WHERE id = ?").run(id);
  return { ok: true };
}

/* ---------------- runs ---------------- */

function rowToRun(row) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    triggerKind: row.trigger_kind,
    status: row.status,
    currentStep: row.current_step,
    state: parseJson(row.state_json, {}),
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function saveRun(app, run) {
  const db = getDb(app);
  db.prepare(
    `INSERT INTO workflow_runs (id, workflow_id, trigger_kind, status, current_step, state_json, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status, current_step = excluded.current_step,
       state_json = excluded.state_json, error = excluded.error, updated_at = excluded.updated_at`
  ).run(
    run.id, run.workflowId, run.triggerKind, run.status, run.currentStep,
    JSON.stringify(run.state ?? {}).slice(0, 20000),
    run.error ? String(run.error).slice(0, 500) : null,
    run.createdAt, nowIso()
  );
  return getWorkflowRun(app, run.id);
}

export function getWorkflowRun(app, id) {
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(id);
  return row ? rowToRun(row) : null;
}

export function listWorkflowRuns(app, { workflowId, status, limit = 50 } = {}) {
  const db = getDb(app);
  const conditions = [];
  const params = [];
  if (workflowId !== undefined) {
    if (typeof workflowId !== "string" || !workflowId) fail("invalid workflow id");
    conditions.push("workflow_id = ?");
    params.push(workflowId);
  }
  if (status !== undefined) {
    if (!["running", "awaiting_approval", "completed", "failed", "cancelled"].includes(status)) fail("invalid status");
    conditions.push("status = ?");
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return db.prepare(`SELECT * FROM workflow_runs ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, lim).map(rowToRun);
}

function auditWorkflow(app, run, phase, ok, detail) {
  try {
    recordToolAuditEvent(app, {
      eventId: `wf_${Date.now().toString(36)}_${run.id.slice(-6)}_${phase}`,
      toolId: "workflow.run",
      toolVersion: "1",
      requestId: run.id,
      timestamp: nowIso(),
      source: "workflow-engine",
      permission: "SYSTEM_INTERNAL",
      risk: "LOW",
      decision: "ALLOW",
      status: ok ? "ok" : "failed",
      durationMs: 0,
      resourceSummary: {
        workflowId: run.workflowId,
        runId: run.id,
        phase,
        ...(detail ?? {}),
      },
      ...(ok ? {} : { errorCategory: "execution_failed" }),
    });
  } catch {
    /* audit must never break runs */
  }
}

/**
 * Advance a run until it suspends (awaiting_approval), completes, or fails.
 * Tool steps execute with source `workflow:<runId>`; confirmation-gated
 * tools mint approvals (via executeToolMain CONFIRM path) and suspend.
 */
export async function advanceWorkflowRun(app, runId) {
  let run = getWorkflowRun(app, runId);
  if (!run) fail("run not found");
  if (isTerminalRunStatus(run.status)) return run;
  const def = getWorkflow(app, run.workflowId);
  if (!def) {
    run.status = "failed";
    run.error = "workflow definition missing";
    return saveRun(app, run);
  }
  const steps = Array.isArray(def.steps) ? def.steps : [];
  let guard = 0;
  while (run.currentStep < steps.length && guard < MAX_STEPS_PER_TICK) {
    guard += 1;
    const step = steps[run.currentStep];
    if (step?.kind === "condition") {
      const pass = evaluateCondition(step.expression, run.state);
      run.state[`step_${run.currentStep}`] = { kind: "condition", pass };
      if (!pass) {
        run.status = "completed";
        run.state.completedEarly = `condition false at step ${run.currentStep}`;
        auditWorkflow(app, run, "run_finish", true, { completedEarly: true });
        return saveRun(app, run);
      }
      run.currentStep += 1;
      run = saveRun(app, run);
      continue;
    }
    if (step?.kind === "approval_wait") {
      const approval = getApproval(app, step.approvalId);
      if (!approval) {
        run.status = "failed";
        run.error = `approval ${String(step.approvalId).slice(0, 32)} not found`;
        auditWorkflow(app, run, "run_finish", false, { error: run.error });
        return saveRun(app, run);
      }
      if (approval.status === "approved" || approval.status === "consumed") {
        run.state[`step_${run.currentStep}`] = { kind: "approval_wait", approval: approval.status };
        run.currentStep += 1;
        run = saveRun(app, run);
        continue;
      }
      if (approval.status === "rejected" || approval.status === "expired") {
        run.status = "failed";
        run.error = `approval ${approval.status}`;
        auditWorkflow(app, run, "run_finish", false, { error: run.error });
        return saveRun(app, run);
      }
      run.status = "awaiting_approval";
      run.state.pendingApprovalId = approval.id;
      auditWorkflow(app, run, "run_suspend", true, { approvalId: approval.id });
      return saveRun(app, run);
    }
    if (step?.kind === "tool_call") {
      const toolInput = { ...((step.input ?? {})) };
      // Approval bound at resume time is persisted in run state (never in
      // the static definition): single-use, fingerprint-verified at consume.
      const boundApproval = run.state?.stepApprovals?.[String(run.currentStep)];
      const res = await executeToolMain(app, step.toolId, toolInput, {
        projectId: run.state.projectId,
        source: `workflow:${run.id}`,
        ...((step.approvalId && step.confirmed === true) || boundApproval
          ? {
            userConfirmed: true,
            confirmedToolId: step.toolId,
            confirmedApprovalId: step.approvalId ?? boundApproval,
          }
          : {}),
      });
      if (boundApproval && res.decision !== "CONFIRM") {
        // Binding is single-use: drop it once the executor accepted it.
        try {
          const bindings = { ...((run.state.stepApprovals ?? {})) };
          delete bindings[String(run.currentStep)];
          run.state.stepApprovals = bindings;
        } catch {
          /* ignore */
        }
      }
      run.state[`step_${run.currentStep}`] = {
        kind: "tool_call",
        toolId: step.toolId,
        decision: res.decision,
        ok: res.ok,
        requestId: res.requestId,
      };
      if (res.decision === "CONFIRM") {
        const approvalId = res.data?.approvalId;
        run.status = "awaiting_approval";
        run.state.pendingApprovalId = approvalId;
        auditWorkflow(app, run, "run_suspend", true, { toolId: step.toolId, approvalId });
        return saveRun(app, run);
      }
      if (!res.ok) {
        run.status = "failed";
        run.error = `${step.toolId}: ${(res.error ?? "failed").slice(0, 200)}`;
        auditWorkflow(app, run, "run_finish", false, { error: run.error });
        return saveRun(app, run);
      }
      // Merge bounded tool output into run state for later conditions.
      if (res.data && typeof res.data === "object") {
        try {
          run.state.lastOutput = JSON.parse(JSON.stringify(res.data).slice(0, 4000));
        } catch {
          /* ignore */
        }
      }
      run.currentStep += 1;
      run = saveRun(app, run);
      continue;
    }
    run.status = "failed";
    run.error = `unknown step kind at ${run.currentStep}`;
    auditWorkflow(app, run, "run_finish", false, { error: run.error });
    return saveRun(app, run);
  }
  if (run.currentStep >= steps.length) {
    run.status = "completed";
    auditWorkflow(app, run, "run_finish", true, {});
  }
  return saveRun(app, run);
}

export async function startWorkflowRun(app, workflowId, { triggerKind = "manual", state = {} } = {}) {
  const def = getWorkflow(app, workflowId);
  if (!def) fail("workflow not found");
  if (!def.enabled) fail("workflow is disabled");
  if (!WORKFLOW_TRIGGER_KINDS.includes(triggerKind)) fail("invalid trigger");
  const run = {
    id: newWorkflowRunId(),
    workflowId,
    triggerKind,
    status: "running",
    currentStep: 0,
    state: { ...state },
    error: null,
    createdAt: nowIso(),
  };
  saveRun(app, run);
  auditWorkflow(app, run, "run_start", true, { triggerKind });
  return advanceWorkflowRun(app, run.id);
}

/** Resume a suspended run after its approval resolved (approve→tool re-runs). */
export async function resumeWorkflowRun(app, runId) {
  const run = getWorkflowRun(app, runId);
  if (!run) fail("run not found");
  if (run.status !== "awaiting_approval") fail("run is not awaiting approval");
  const def = getWorkflow(app, run.workflowId);
  const step = def?.steps?.[run.currentStep];
  // Bind the resolved approval into PERSISTED run state (the definition
  // object is a fresh copy each advance; mutating it would be lost).
  if (step?.kind === "tool_call" && run.state.pendingApprovalId) {
    const approval = getApproval(app, run.state.pendingApprovalId);
    if (!approval) fail("approval not found");
    if (approval.status === "rejected" || approval.status === "expired") {
      run.status = "failed";
      run.error = `approval ${approval.status}`;
      return saveRun(app, run);
    }
    if (approval.status === "approved") {
      run.state.stepApprovals = {
        ...((run.state.stepApprovals ?? {})),
        [String(run.currentStep)]: approval.id,
      };
    }
  }
  run.status = "running";
  saveRun(app, run);
  return advanceWorkflowRun(app, run.id);
}

export function cancelWorkflowRun(app, runId) {
  const run = getWorkflowRun(app, runId);
  if (!run) fail("run not found");
  if (isTerminalRunStatus(run.status)) return run;
  run.status = "cancelled";
  auditWorkflow(app, run, "run_cancel", true, {});
  return saveRun(app, run);
}

/** Dispatch real sync-completion events to matching workflow triggers. */
export async function dispatchSyncCompleted(app, connectorId, detail = {}) {
  const matches = listWorkflows(app).filter(
    (w) => w.enabled && w.trigger?.kind === "sync_completed" && w.trigger?.connectorId === connectorId
  );
  const started = [];
  for (const w of matches.slice(0, 5)) {
    try {
      const run = await startWorkflowRun(app, w.id, {
        triggerKind: "sync_completed",
        state: {
          connectorId,
          status: detail.status,
          counts: detail.counts ?? {},
        },
      });
      started.push(run.id);
    } catch (err) {
      log.warn("sync-triggered workflow failed to start", {
        workflowId: w.id, error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return started;
}

/* ---------------- schedule tick ---------------- */

let wfTimer = null;
let wfApp = null;

export function startWorkflowScheduler(app) {
  stopWorkflowScheduler();
  wfApp = app;
  wfTimer = setInterval(() => {
    void tickWorkflowScheduler().catch((err) => {
      log.warn("workflow tick failed", { error: err instanceof Error ? err.message : "unknown" });
    });
  }, TICK_MS);
  if (wfTimer.unref) wfTimer.unref();
  return { ok: true };
}

export function stopWorkflowScheduler() {
  if (wfTimer) {
    clearInterval(wfTimer);
    wfTimer = null;
  }
  wfApp = null;
}

export async function tickWorkflowScheduler(now = Date.now()) {
  if (!wfApp) return { ran: [] };
  const ran = [];
  const due = listWorkflows(wfApp).filter((w) => {
    if (!w.enabled || w.trigger?.kind !== "schedule") return false;
    const last = w.trigger.lastRunAt ? Date.parse(w.trigger.lastRunAt) : NaN;
    const interval = Math.min(1440, Math.max(5, Math.floor(Number(w.trigger.intervalMinutes) || 60)));
    const base = Number.isFinite(last) ? last : 0;
    return base + interval * 60 * 1000 <= now;
  });
  for (const w of due.slice(0, 5)) {
    try {
      const run = await startWorkflowRun(wfApp, w.id, { triggerKind: "schedule", state: {} });
      ran.push(run.id);
      w.trigger.lastRunAt = new Date(now).toISOString();
      updateWorkflow(wfApp, w.id, { trigger: w.trigger });
    } catch (err) {
      log.warn("scheduled workflow failed", {
        workflowId: w.id, error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return { ran };
}
