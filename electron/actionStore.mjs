/**
 * Phase 8 — Main-process action approval + idempotency store (SQLite v12).
 * Same DB ownership as researchDb (getDb singleton, main-serialized).
 * Parameterized SQL only; safe generic errors; no secrets (inputs are
 * already schema-validated tool args; bodies are truncated for preview).
 *
 * Lifecycle: proposed → approved|rejected|expired; approved → consumed
 * (single-use, bound to fingerprint). Executions keyed by idempotency key.
 */
import { getDb } from "./researchDb.mjs";
import {
  ACTION_APPROVAL_TTL_MS,
  actionFingerprint,
  buildActionPreview,
  newActionId,
  verifyApprovalForExecution,
} from "../src/lib/actions/actionCore.mjs";

function fail(message) {
  throw new Error(`Actions: ${message}`);
}

function nowIso() {
  return new Date().toISOString();
}

function safeInputForStorage(input) {
  try {
    return JSON.stringify(input ?? {}).slice(0, 20000);
  } catch {
    return "{}";
  }
}

/**
 * Propose an action for approval. Returns the stored approval row
 * (metadata + preview, never secrets beyond the validated args preview).
 */
export function proposeAction(app, { toolId, projectId, runId, requestId, input, risk }) {
  if (typeof toolId !== "string" || !toolId) fail("invalid tool id");
  const fingerprint = actionFingerprint(toolId, projectId, input ?? {});
  const id = newActionId();
  const created = nowIso();
  const expires = new Date(Date.now() + ACTION_APPROVAL_TTL_MS).toISOString();
  const preview = buildActionPreview(toolId, input ?? {});
  const db = getDb(app);
  db.prepare(
    `INSERT INTO action_approvals (id, tool_id, fingerprint, project_id, run_id,
      request_id, input_json, preview_json, risk, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`
  ).run(
    id, toolId.slice(0, 128), fingerprint,
    projectId ? String(projectId).slice(0, 128) : null,
    runId ? String(runId).slice(0, 64) : null,
    String(requestId ?? "").slice(0, 64),
    safeInputForStorage(input),
    JSON.stringify(preview).slice(0, 8000),
    String(risk ?? "MEDIUM").slice(0, 16),
    created, expires
  );
  return getApproval(app, id);
}

export function getApproval(app, id) {
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM action_approvals WHERE id = ?").get(id);
  if (!row) return null;
  return rowToApproval(row);
}

function rowToApproval(r) {
  let input = {};
  let preview = [];
  try {
    input = JSON.parse(r.input_json ?? "{}");
  } catch {
    input = {};
  }
  try {
    preview = JSON.parse(r.preview_json ?? "[]");
  } catch {
    preview = [];
  }
  return {
    id: r.id,
    toolId: r.tool_id,
    fingerprint: r.fingerprint,
    projectId: r.project_id,
    runId: r.run_id,
    requestId: r.request_id,
    input,
    preview,
    risk: r.risk,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    consumedAt: r.consumed_at,
    expiresAt: r.expires_at,
  };
}

export function listApprovals(app, { status, projectId, limit = 50 } = {}) {
  const db = getDb(app);
  const conditions = [];
  const params = [];
  if (status !== undefined) {
    if (!["proposed", "approved", "rejected", "expired", "consumed"].includes(status)) {
      fail("invalid status");
    }
    conditions.push("status = ?");
    params.push(status);
  }
  if (projectId !== undefined) {
    if (typeof projectId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(projectId)) fail("invalid project id");
    conditions.push("project_id = ?");
    params.push(projectId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return db.prepare(
    `SELECT * FROM action_approvals ${where} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, lim).map(rowToApproval);
}

/** Mark expired proposals (called opportunistically on list/propose). */
export function expireStaleApprovals(app, now = Date.now()) {
  const db = getDb(app);
  const iso = new Date(now).toISOString();
  db.prepare(
    "UPDATE action_approvals SET status = 'expired' WHERE status = 'proposed' AND expires_at < ?"
  ).run(iso);
}

function setStatus(app, id, status) {
  const db = getDb(app);
  const row = getApproval(app, id);
  if (!row) fail("approval not found");
  expireStaleApprovals(app);
  const fresh = getApproval(app, id);
  if (fresh.status !== "proposed") fail(`approval is ${fresh.status}`);
  const decided = nowIso();
  db.prepare("UPDATE action_approvals SET status = ?, decided_at = ? WHERE id = ?").run(status, decided, id);
  return getApproval(app, id);
}

export function approveAction(app, id) {
  return setStatus(app, id, "approved");
}

export function rejectAction(app, id) {
  return setStatus(app, id, "rejected");
}

/**
 * Consume an approved approval for execution. Verifies the live input
 * fingerprint matches the approved fingerprint (parameter-substitution
 * defense) and marks single-use. Returns the approval.
 */
export function consumeApprovalForExecution(app, id, { toolId, projectId, runId, input, now }) {
  const approval = getApproval(app, id);
  if (!approval) fail("approval not found");
  const check = verifyApprovalForExecution(approval, {
    toolId, projectId, runId, input, now,
  });
  if (!check.ok) fail(check.reason);
  const db = getDb(app);
  db.prepare("UPDATE action_approvals SET status = 'consumed', consumed_at = ? WHERE id = ?").run(nowIso(), id);
  return getApproval(app, id);
}

/* ---------------- idempotency / executions ---------------- */

export function findExecutionByKey(app, idempotencyKey) {
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM action_executions WHERE idempotency_key = ?").get(idempotencyKey);
  if (!row) return null;
  let result = {};
  try {
    result = JSON.parse(row.result_json ?? "{}");
  } catch {
    result = {};
  }
  return {
    idempotencyKey: row.idempotency_key,
    toolId: row.tool_id,
    fingerprint: row.fingerprint,
    projectId: row.project_id,
    runId: row.run_id,
    approvalId: row.approval_id,
    status: row.status,
    provider: row.provider,
    externalId: row.external_id,
    result,
    auditEventId: row.audit_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function recordExecution(app, exec) {
  const db = getDb(app);
  const now = nowIso();
  db.prepare(
    `INSERT INTO action_executions (idempotency_key, tool_id, fingerprint, project_id,
      run_id, approval_id, status, provider, external_id, result_json, audit_event_id,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(idempotency_key) DO UPDATE SET
       status = excluded.status, external_id = excluded.external_id,
       result_json = excluded.result_json, updated_at = excluded.updated_at`
  ).run(
    String(exec.idempotencyKey).slice(0, 128),
    String(exec.toolId).slice(0, 128),
    String(exec.fingerprint).slice(0, 64),
    exec.projectId ? String(exec.projectId).slice(0, 128) : null,
    exec.runId ? String(exec.runId).slice(0, 64) : null,
    exec.approvalId ? String(exec.approvalId).slice(0, 64) : null,
    String(exec.status ?? "succeeded").slice(0, 32),
    String(exec.provider ?? "").slice(0, 64),
    exec.externalId ? String(exec.externalId).slice(0, 512) : null,
    JSON.stringify(exec.result ?? {}).slice(0, 8000),
    exec.auditEventId ? String(exec.auditEventId).slice(0, 64) : null,
    now, now
  );
  return findExecutionByKey(app, exec.idempotencyKey);
}

export function listExecutions(app, { projectId, toolId, limit = 50 } = {}) {
  const db = getDb(app);
  const conditions = [];
  const params = [];
  if (projectId !== undefined) {
    if (typeof projectId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(projectId)) fail("invalid project id");
    conditions.push("project_id = ?");
    params.push(projectId);
  }
  if (toolId !== undefined) {
    if (typeof toolId !== "string" || !toolId) fail("invalid tool id");
    conditions.push("tool_id = ?");
    params.push(toolId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return db.prepare(
    `SELECT * FROM action_executions ${where} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, lim).map((row) => findExecutionByKey(app, row.idempotency_key));
}
