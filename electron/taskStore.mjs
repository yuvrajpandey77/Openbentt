/**
 * Phase 2 — Durable agent task/session/event persistence (Electron main only).
 *
 * Additive SQLite tables (v13: agent_tasks, agent_sessions, agent_events,
 * agent_runtime_meta) on the shared researchDb singleton. Same ownership as
 * all other stores: getDb singleton, main-serialized, parameterized SQL only,
 * safe generic errors.
 *
 * Explicitly NOT an approval authority: actionStore.mjs remains the sole
 * authority for proposals/approvals/fingerprints/idempotency. This store
 * persists execution history + runtime metadata only.
 */
import { getDb } from "./researchDb.mjs";
import { redactSecretsFromText } from "../src/lib/agent/openCodeCore.mjs";

const MAX_EVENTS_PER_TASK = 500;
const MAX_TASKS_KEPT = 200;
const MAX_PAYLOAD_CHARS = 8000;

function nowIso() {
  return new Date().toISOString();
}

function fail(msg) {
  throw new Error(`TaskStore: ${msg}`);
}

function boundPayload(payload) {
  let json = "{}";
  try {
    json = JSON.stringify(payload ?? {});
  } catch {
    json = "{}";
  }
  return redactSecretsFromText(json).slice(0, MAX_PAYLOAD_CHARS);
}

function rowToTask(r) {
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    prompt: r.prompt,
    category: r.category,
    mode: r.mode,
    workspace: {
      workspaceId: r.workspace_id,
      rootPath: r.workspace_root,
      displayName: r.workspace_name,
    },
    sessionId: r.session_id ?? undefined,
    status: r.status,
    provider: r.provider ?? undefined,
    model: r.model ?? undefined,
    providerStatus: r.provider_status ?? undefined,
    inputSource: r.input_source === "voice" ? "voice" : "text",
    error: r.error ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Column-aware insert: v14 adds input_source; older DBs ignore it. */
function taskColumns(app) {
  try {
    const cols = getDb(app).prepare("PRAGMA table_info(agent_tasks)").all().map((c) => c.name);
    return new Set(cols);
  } catch {
    return new Set();
  }
}

/** Upsert a task snapshot (called on every status transition). */
export function saveTask(app, task) {
  if (!task || typeof task.id !== "string" || !task.id) fail("invalid task");
  const db = getDb(app);
  const now = nowIso();
  const hasInputSource = taskColumns(app).has("input_source");
  const inputSource = task.inputSource === "voice" ? "voice" : "text";
  const cols = hasInputSource
    ? "(id, title, prompt, category, mode, workspace_id, workspace_root, workspace_name, session_id, status, provider, model, provider_status, input_source, error, created_at, updated_at)"
    : "(id, title, prompt, category, mode, workspace_id, workspace_root, workspace_name, session_id, status, provider, model, provider_status, error, created_at, updated_at)";
  const placeholders = hasInputSource ? "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?" : "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?";
  const updateSet = hasInputSource
    ? `title = excluded.title, prompt = excluded.prompt, category = excluded.category,
       mode = excluded.mode, workspace_id = excluded.workspace_id,
       workspace_root = excluded.workspace_root, workspace_name = excluded.workspace_name,
       session_id = excluded.session_id, status = excluded.status,
       provider = excluded.provider, model = excluded.model,
       provider_status = excluded.provider_status, input_source = excluded.input_source,
       error = excluded.error, updated_at = excluded.updated_at`
    : `title = excluded.title, prompt = excluded.prompt, category = excluded.category,
       mode = excluded.mode, workspace_id = excluded.workspace_id,
       workspace_root = excluded.workspace_root, workspace_name = excluded.workspace_name,
       session_id = excluded.session_id, status = excluded.status,
       provider = excluded.provider, model = excluded.model,
       provider_status = excluded.provider_status, error = excluded.error,
       updated_at = excluded.updated_at`;
  const values = [
    task.id,
    String(task.title ?? "").slice(0, 200),
    String(task.prompt ?? "").slice(0, 20000),
    String(task.category ?? "UNKNOWN").slice(0, 32),
    String(task.mode ?? "build").slice(0, 16),
    String(task.workspace?.workspaceId ?? "").slice(0, 128),
    String(task.workspace?.rootPath ?? "").slice(0, 1024),
    String(task.workspace?.displayName ?? "").slice(0, 120),
    task.sessionId ? String(task.sessionId).slice(0, 64) : null,
    String(task.status ?? "UNKNOWN").slice(0, 32),
    task.provider ? String(task.provider).slice(0, 128) : null,
    task.model ? String(task.model).slice(0, 128) : null,
    task.providerStatus ? String(task.providerStatus).slice(0, 64) : null,
  ];
  if (hasInputSource) values.push(inputSource);
  values.push(
    task.error ? String(task.error).slice(0, 1000) : null,
    task.createdAt ?? now,
    task.updatedAt ?? now,
  );
  db.prepare(
    `INSERT INTO agent_tasks ${cols}
     VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updateSet}`,
  ).run(...values);
  pruneTasks(app);
  return getTask(app, task.id);
}

export function getTask(app, id) {
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM agent_tasks WHERE id = ?").get(id);
  return rowToTask(row);
}

export function listTasks(app, limit = 50) {
  const db = getDb(app);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return db
    .prepare("SELECT * FROM agent_tasks ORDER BY updated_at DESC LIMIT ?")
    .all(lim)
    .map(rowToTask);
}

function pruneTasks(app) {
  try {
    const db = getDb(app);
    const stale = db
      .prepare("SELECT id FROM agent_tasks ORDER BY updated_at DESC LIMIT -1 OFFSET 200")
      .all();
    if (stale.length) {
      const ids = stale.map((r) => r.id);
      db.prepare(`DELETE FROM agent_events WHERE task_id IN (${ids.map(() => "?").join(",")})`).run(...ids);
      db.prepare(`DELETE FROM agent_tasks WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
    }
  } catch { /* best effort */ }
}

export function saveSession(app, session) {
  if (!session || typeof session.id !== "string" || !session.id) fail("invalid session");
  const db = getDb(app);
  const now = nowIso();
  db.prepare(
    `INSERT INTO agent_sessions (id, workspace_id, task_id, status, opencode_session_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id, task_id = excluded.task_id,
       status = excluded.status, opencode_session_id = excluded.opencode_session_id,
       updated_at = excluded.updated_at`,
  ).run(
    session.id,
    String(session.workspaceId ?? "").slice(0, 128),
    session.taskId ? String(session.taskId).slice(0, 64) : null,
    String(session.status ?? "UNKNOWN").slice(0, 32),
    session.opencodeSessionId ? String(session.opencodeSessionId).slice(0, 128) : null,
    session.createdAt ?? now,
    session.updatedAt ?? now,
  );
}

export function appendTaskEvent(app, event) {
  if (!event || typeof event.eventId !== "string" || typeof event.taskId !== "string") {
    fail("invalid event");
  }
  const db = getDb(app);
  db.prepare(
    `INSERT INTO agent_events (event_id, task_id, session_id, type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id) DO NOTHING`,
  ).run(
    event.eventId.slice(0, 64),
    event.taskId.slice(0, 64),
    String(event.sessionId ?? "unknown").slice(0, 64),
    String(event.type ?? "agent.error").slice(0, 64),
    boundPayload(event.payload),
    event.timestamp ?? nowIso(),
  );
  // Bound per-task events (latest N).
  const count = db.prepare("SELECT COUNT(*) AS n FROM agent_events WHERE task_id = ?").get(event.taskId);
  if (count && count.n > MAX_EVENTS_PER_TASK) {
    const overflow = db
      .prepare("SELECT event_id FROM agent_events WHERE task_id = ? ORDER BY created_at ASC LIMIT ?")
      .all(event.taskId, count.n - MAX_EVENTS_PER_TASK);
    if (overflow.length) {
      db.prepare(`DELETE FROM agent_events WHERE event_id IN (${overflow.map(() => "?").join(",")})`).run(
        ...overflow.map((r) => r.event_id),
      );
    }
  }
}

export function getTaskEvents(app, taskId, limit = 500) {
  const db = getDb(app);
  const lim = Math.min(Math.max(Number(limit) || 500, 1), 500);
  return db
    .prepare(
      `SELECT event_id AS eventId, task_id AS taskId, session_id AS sessionId,
        type, payload_json AS payloadJson, created_at AS timestamp
       FROM agent_events WHERE task_id = ? ORDER BY created_at ASC LIMIT ?`,
    )
    .all(taskId, lim)
    .map((r) => {
      let payload = {};
      try {
        payload = JSON.parse(r.payloadJson ?? "{}");
      } catch {
        payload = {};
      }
      return { eventId: r.eventId, taskId: r.taskId, sessionId: r.sessionId, type: r.type, payload, timestamp: r.timestamp };
    });
}

export function saveRuntimeMeta(app, key, value) {
  if (typeof key !== "string" || !key || key.length > 128) fail("invalid meta key");
  const db = getDb(app);
  db.prepare(
    `INSERT INTO agent_runtime_meta (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(key, boundPayload(value), nowIso());
}

export function getRuntimeMeta(app, key) {
  const db = getDb(app);
  const row = db.prepare("SELECT value_json FROM agent_runtime_meta WHERE key = ?").get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value_json ?? "{}");
  } catch {
    return null;
  }
}

/**
 * Startup reconciliation: previous-process RUNNING/STARTING/WAITING tasks did
 * not survive the restart — mark them INTERRUPTED (explicit, never completed).
 * Returns reconciled count.
 */
export function reconcileInterruptedTasks(app) {
  const db = getDb(app);
  const rows = db
    .prepare("SELECT * FROM agent_tasks WHERE status IN ('QUEUED','STARTING','RUNNING','WAITING_FOR_PERMISSION')")
    .all();
  const now = nowIso();
  for (const r of rows) {
    db.prepare("UPDATE agent_tasks SET status = 'UNKNOWN', error = ?, updated_at = ? WHERE id = ?").run(
      "Interrupted by application restart; verify workspace state before retrying. Destructive steps are never auto-replayed.",
      now,
      r.id,
    );
    appendTaskEvent(app, {
      eventId: `aevt_reconcile_${r.id.slice(-8)}`,
      taskId: r.id,
      sessionId: r.session_id ?? "unknown",
      type: "agent.failed",
      payload: { message: "Task interrupted by restart; marked UNKNOWN pending verification." },
      timestamp: now,
    });
  }
  return rows.length;
}

export const __taskStoreLimits = { MAX_EVENTS_PER_TASK, MAX_TASKS_KEPT, MAX_PAYLOAD_CHARS };
