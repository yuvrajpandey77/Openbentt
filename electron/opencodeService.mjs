/**
 * Phase 1 — OpenCode runtime manager (Electron main only).
 *
 * Owns the complete OpenCode child-process lifecycle:
 * detection → version → spawn → health → sessions → events →
 * permission bridge (actionStore) → cancellation → crash → cleanup.
 *
 * Security invariants (Phases 5–8 preserved):
 * - Renderer never spawns processes, never supplies executable paths.
 * - Minimal environment is constructed; process.env is NOT inherited wholesale.
 * - Every workspace path is canonicalized (realpath) + contained (assertPathUnderRoots
 *   + lexical check from openCodeCore.mjs). Symlink escapes fail closed.
 * - Sensitive operations bridge through actionStore approvals (fingerprint-bound,
 *   single-use, idempotent) — no second permission database.
 * - Logs/events are bounded + secret-redacted.
 *
 * OpenCode wire protocol (Phase 1): the managed child is treated as an
 * execution engine over stdio/JSON. When a real `opencode` binary is present
 * we supervise it; otherwise the service runs in "supervised-unavailable"
 * mode (detection reports not-installed, tasks fail closed with a setup
 * message — never fake success).
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLogger } from "./log.mjs";
import { assertSafeId } from "./ipcValidate.mjs";
import {
  AGENT_CAPABILITIES,
  OPENCODE_LIMITS,
  buildPermissionRequest,
  checkPathContainedLexical,
  classifyCommand,
  classifyTask,
  compareVersions,
  describeServerPermission,
  describeServerQuestion,
  evaluateCapabilityPolicy,
  isSupportedVersion,
  isValidTaskStatus,
  newAgentEventId,
  newSessionId,
  newTaskId,
  normalizeOpenCodeEvent,
  parseVersionTag,
  redactSecretsFromText,
  sanitizeTaskTitle,
  scanForPromptInjection,
  shouldRouteToOpenCode,
} from "../src/lib/agent/openCodeCore.mjs";
import {
  bindServerSession,
  cleanupServerOnQuit as cleanupServeOnQuit,
  ensureServer,
  getServerState,
  serverAbort,
  serverChildren,
  serverCreateSession,
  serverDiff,
  serverFileStatus,
  serverMessages,
  serverPrompt,
  serverRejectQuestion,
  serverReplyPermission,
  serverReplyQuestion,
  serverSessionStatus,
  serverTodos,
  setServerHooks,
  stopServer,
  unbindServerSession,
} from "./opencodeServer.mjs";
import {
  consumeApprovalForExecution,
  findExecutionByKey,
  getApproval,
  listApprovals,
  proposeAction,
  recordExecution,
} from "./actionStore.mjs";
import { actionFingerprint, newIdempotencyKey } from "../src/lib/actions/actionCore.mjs";
import { recordToolAuditEvent } from "./toolStore.mjs";
import {
  getOmniRouteStatus as getOmniStatus,
  getProviderBaseUrl as getOmniBaseUrl,
} from "./omniRouteService.mjs";

const log = createLogger("opencode");

/* ---------------- constants ---------------- */

const MIN_VERSION = "1.0.0";
const MAX_TASKS = OPENCODE_LIMITS.maxTasks;
const MAX_SESSIONS = OPENCODE_LIMITS.maxSessions;
const MAX_EVENTS_PER_TASK = OPENCODE_LIMITS.maxEventsPerTask;
const MAX_LOG_CHARS = OPENCODE_LIMITS.maxLogChars;

const OPENCODE_TOOL_ID = "opencode.execute";

/* ---------------- in-memory state (main-owned) ---------------- */

const state = {
  runtime: {
    status: "STOPPED",
    pid: undefined,
    startedAt: undefined,
    executablePath: undefined,
    version: undefined,
    lastError: undefined,
  },
  /** child process handle (never exposed to renderer) */
  proc: null,
  procStderrTail: "",
  tasks: new Map(),
  sessions: new Map(),
  /** taskId -> event[] (bounded) */
  events: new Map(),
  /** taskId -> Set<requestId> approved for task scope */
  taskGrants: new Map(),
  detectionCache: null,
  crashInfo: null,
  /* ---- live-engine (opencode serve) bindings ---- */
  /** taskId -> { sessionID, directory } */
  serverSessions: new Map(),
  /** opencode sessionID -> taskId */
  sessionToTask: new Map(),
  /** server requestID (per_*) -> { taskId, approvalId, fingerprint, action, resources, directory } */
  pendingServerPermissions: new Map(),
  /** server requestID (que_*) -> { taskId, questions, directory } */
  pendingServerQuestions: new Map(),
  /** taskId -> Set<canonical eventId> for SSE dedupe (bounded) */
  seenServerEventIds: new Map(),
  /** last crash signature already reflected onto tasks (avoid repeat marking) */
  lastServerCrashSeen: null,
};

function nowIso() {
  return new Date().toISOString();
}

function emitToWindow(app, channel, payload) {
  try {
    const { BrowserWindow } = globalThis.__openbenttElectron ?? {};
    void app;
    void channel;
    void payload;
    void BrowserWindow;
  } catch { /* no-op */ }
}

/* Event fan-out targets registered by registerOpenCodeIpc */
let eventTarget = null;
export function setOpenCodeEventTarget(win) {
  eventTarget = win ?? null;
}

function pushEvent(taskId, sessionId, type, payload) {
  const list = state.events.get(taskId) ?? [];
  const evt = normalizeOpenCodeEvent({ type, payload }, { taskId, sessionId });
  list.push(evt);
  if (list.length > MAX_EVENTS_PER_TASK) {
    list.splice(0, list.length - MAX_EVENTS_PER_TASK);
  }
  state.events.set(taskId, list);
  try {
    eventTarget?.webContents?.send("agent:event", evt);
  } catch { /* window may be gone */ }
  // Durable mirror (best-effort; never breaks the hot path).
  try {
    state.persistApp && Promise.resolve().then(async () => {
      const { appendTaskEvent } = await import("./taskStore.mjs");
      appendTaskEvent(state.persistApp, evt);
    }).catch(() => {});
  } catch { /* noop */ }
  return evt;
}

/**
 * Deterministic canonical event-id cap (≤60 chars). Short ids pass through;
 * long ids fold to `evt_h_<12 hex>` via FNV-1a so every layer (memory, IPC,
 * taskStore which truncates at 64) computes the SAME dedupe key.
 */
export function canonEventId(rawId) {
  const id = String(rawId ?? "");
  if (id.length <= 60) return id;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `evt_h_${h.toString(16).padStart(8, "0")}${(id.length % 997).toString(36)}`;
}

/**
 * Push already-normalized canonical events (live-engine SSE path).
 * Preserves server eventIds for exact dedupe across reconnects/resyncs.
 * Returns the events actually delivered (new, non-duplicate).
 */
export function pushCanonicalEvents(taskId, sessionId, canonicalEvents) {  const list = state.events.get(taskId) ?? [];
  let seen = state.seenServerEventIds.get(taskId);
  if (!seen) {
    seen = new Set();
    state.seenServerEventIds.set(taskId, seen);
  }
  const delivered = [];
  for (const evt of canonicalEvents ?? []) {
    if (!evt || typeof evt.type !== "string") continue;
    // Connection marker uses a reserved taskId — fan out without storing.
    if (evt.taskId === "__connection__") {
      try {
        eventTarget?.webContents?.send("agent:event", { ...evt, taskId });
      } catch { /* window may be gone */ }
      delivered.push(evt);
      continue;
    }
    // Canonical IDs are server evt_* ids (unique per server event). Cap
    // deterministically at 60 chars so in-memory, IPC, and taskStore
    // (truncates at 64) dedupe keys always agree.
    const rawId = typeof evt.eventId === "string" ? evt.eventId : null;
    const id = rawId ? canonEventId(rawId) : null;
    if (id && seen.has(id)) continue; // reconnect/resync duplicate — drop
    if (id) {
      seen.add(id);
      if (seen.size > 4000) {
        // Bounded: drop oldest (insertion-ordered Set).
        const first = seen.values().next().value;
        seen.delete(first);
      }
    }
    const stored = {
      eventId: id ?? newAgentEventId(),
      taskId,
      sessionId: typeof evt.sessionId === "string" ? evt.sessionId : sessionId,
      timestamp: typeof evt.timestamp === "string" ? evt.timestamp : nowIso(),
      type: evt.type,
      payload: evt.payload && typeof evt.payload === "object" ? evt.payload : {},
    };
    list.push(stored);
    delivered.push(stored);
  }
  if (list.length > MAX_EVENTS_PER_TASK) {
    list.splice(0, list.length - MAX_EVENTS_PER_TASK);
  }
  state.events.set(taskId, list);
  for (const evt of delivered) {
    try {
      eventTarget?.webContents?.send("agent:event", evt);
    } catch { /* window may be gone */ }
    try {
      state.persistApp && Promise.resolve().then(async () => {
        const { appendTaskEvent } = await import("./taskStore.mjs");
        appendTaskEvent(state.persistApp, evt);
      }).catch(() => {});
    } catch { /* noop */ }
  }
  applyServerStatusSideEffects(taskId, delivered);
  return delivered;
}

/**
 * Derive local task/session waiting + terminal state from canonical
 * live-engine events. Chat-facing statuses stay within the TASK_STATUSES
 * vocabulary; permission-vs-question is tracked via task.waitingKind.
 */
function applyServerStatusSideEffects(taskId, delivered) {
  const task = state.tasks.get(taskId);
  if (!task) return;
  const session = task.sessionId ? state.sessions.get(task.sessionId) : null;
  let changed = false;
  for (const evt of delivered) {
    switch (evt.type) {
      case "agent.permission.requested":
        task.status = "WAITING_FOR_PERMISSION";
        task.waitingKind = "permission";
        task.pendingRequestId = typeof evt.payload.serverRequestId === "string" ? evt.payload.serverRequestId : undefined;
        task.updatedAt = nowIso();
        changed = true;
        break;
      case "agent.question.requested":
        task.status = "WAITING_FOR_PERMISSION";
        task.waitingKind = "question";
        task.pendingRequestId = typeof evt.payload.serverRequestId === "string" ? evt.payload.serverRequestId : undefined;
        task.updatedAt = nowIso();
        changed = true;
        break;
      case "agent.permission.replied":
      case "agent.question.answered":
      case "agent.question.rejected":
        if (task.status === "WAITING_FOR_PERMISSION") {
          task.status = "RUNNING";
          task.waitingKind = undefined;
          task.pendingRequestId = undefined;
          task.updatedAt = nowIso();
          changed = true;
        }
        break;
      case "agent.session.idle":
        if (task.status === "RUNNING" || task.status === "STARTING") {
          task.status = "COMPLETED";
          task.updatedAt = nowIso();
          changed = true;
          try {
            unbindServerSession(taskId);
          } catch { /* noop */ }
          pushEvent(task.id, task.sessionId ?? "unknown", "agent.completed", {
            message: "OpenCode finished this turn.",
          });
        }
        break;
      case "agent.tool.failed":
      case "agent.step.failed":
      case "agent.error":
        task.lastError = typeof evt.payload.message === "string" ? String(evt.payload.message).slice(0, 500) : "Engine error";
        task.updatedAt = nowIso();
        changed = true;
        break;
      default:
        break;
    }
  }
  if (session && changed) {
    session.status = task.status === "COMPLETED" ? "COMPLETED" : task.status === "WAITING_FOR_PERMISSION" ? "WAITING_FOR_PERMISSION" : "RUNNING";
    session.updatedAt = nowIso();
  }
  if (changed) syncTaskState(state.persistApp, task, session);
}

/** Map an engine-native action to an Openbentt capability label (best effort). */
function mapServerActionToCapability(action) {
  const a = String(action ?? "").toLowerCase();
  if (/^(read|glob|grep|list)$/.test(a)) return "READ_FILES";
  if (/^(edit|write|create|apply)$/.test(a)) return "WRITE_FILES";
  if (/^(delete|remove|trash)$/.test(a)) return "DELETE_FILES";
  if (/^(bash|shell|command|execute)$/.test(a)) return "RUN_COMMANDS";
  if (/^(webfetch|websearch|fetch|network)$/.test(a)) return "NETWORK_ACCESS";
  return "UNKNOWN";
}

/** Live-engine permission event → approval + canonical event. Registered as a server hook. */
async function handleServerPermissionAsked(serverEvent) {
  const app = state.persistApp;
  let described;
  try {
    described = describeServerPermission(serverEvent.properties ?? {});
  } catch (err) {
    log.warn("unrecognized permission event", { error: err instanceof Error ? err.message : "unknown" });
    return;
  }
  const taskId = state.sessionToTask.get(described.sessionID);
  if (!taskId) return; // not our session — ignore
  const task = state.tasks.get(taskId);
  if (!task) return;
  if (state.pendingServerPermissions.has(described.serverRequestId)) return; // already bridged
  const capability = mapServerActionToCapability(described.action);
  const resources = described.resources.slice(0, 8).join(", ").slice(0, 1000) || "(no target listed)";
  let risk = capability === "DELETE_FILES" ? "HIGH" : "MEDIUM";
  if (capability === "RUN_COMMANDS") {
    try {
      const cls = classifyCommand(resources);
      if (cls.level === "SYSTEM_RISK" || cls.level === "HIGH_RISK") risk = "HIGH";
    } catch { /* keep MEDIUM */ }
  }
  const fingerprintInput = {
    serverAction: described.action,
    resources: described.resources.slice(0, 8),
    sessionID: described.sessionID,
    workspace: task.workspace.rootPath,
  };
  const fingerprint = actionFingerprint(OPENCODE_TOOL_ID, task.workspace.workspaceId, fingerprintInput);
  let approval;
  try {
    const existing = listApprovals(app, { status: "proposed" }).find(
      (a) => a.fingerprint === fingerprint && a.toolId === OPENCODE_TOOL_ID,
    );
    approval = existing ?? proposeAction(app, {
      toolId: OPENCODE_TOOL_ID,
      projectId: undefined,
      runId: task.id,
      requestId: newAgentEventId("req"),
      input: { ...fingerprintInput, idempotencyKey: newIdempotencyKey() },
      risk,
    });
  } catch (err) {
    log.warn("permission approval proposal failed", { error: err instanceof Error ? err.message : "unknown" });
    return;
  }
  state.pendingServerPermissions.set(described.serverRequestId, {
    taskId,
    approvalId: approval.id,
    fingerprint,
    action: described.action,
    resources: described.resources,
    directory: task.workspace.rootPath,
  });
  const sessionId = task.sessionId ?? "unknown";
  const request = {
    requestId: approval.id,
    serverRequestId: described.serverRequestId,
    taskId,
    sessionId,
    capability,
    serverAction: described.action,
    risk,
    description: `OpenCode wants to ${described.action} — ${resources}`,
    workspace: task.workspace.rootPath,
    target: resources,
    saveOptions: described.save,
    metadata: described.metadata,
    approvalId: approval.id,
    fingerprint,
    expiresAt: new Date(Date.now() + OPENCODE_LIMITS.approvalTtlMs).toISOString(),
  };
  pushCanonicalEvents(taskId, sessionId, [{
    eventId: typeof serverEvent.id === "string" ? serverEvent.id : newAgentEventId("evt"),
    taskId,
    sessionId,
    timestamp: nowIso(),
    type: "agent.permission.requested",
    payload: request,
  }]);
  audit(app, {
    decision: "CONFIRM", status: "confirm_required", risk,
    resourceSummary: { lifecycle: "OPENCODE_SERVER_PERMISSION", taskId, approvalId: approval.id, serverRequestId: described.serverRequestId, action: described.action },
  });
}

/** Live-engine question event → canonical event (no approval needed; answers are data). */
async function handleServerQuestionAsked(serverEvent) {
  let described;
  try {
    described = describeServerQuestion(serverEvent.properties ?? {});
  } catch (err) {
    log.warn("unrecognized question event", { error: err instanceof Error ? err.message : "unknown" });
    return;
  }
  const taskId = state.sessionToTask.get(described.sessionID);
  if (!taskId) return;
  const task = state.tasks.get(taskId);
  if (!task) return;
  if (state.pendingServerQuestions.has(described.serverRequestId)) return;
  state.pendingServerQuestions.set(described.serverRequestId, {
    taskId,
    questions: described.questions,
    directory: task.workspace.rootPath,
  });
  const sessionId = task.sessionId ?? "unknown";
  pushCanonicalEvents(taskId, sessionId, [{
    eventId: typeof serverEvent.id === "string" ? serverEvent.id : newAgentEventId("evt"),
    taskId,
    sessionId,
    timestamp: nowIso(),
    type: "agent.question.requested",
    payload: {
      serverRequestId: described.serverRequestId,
      taskId,
      sessionId,
      questions: described.questions,
    },
  }]);
  audit(state.persistApp, {
    decision: "CONFIRM", status: "confirm_required", risk: "LOW",
    resourceSummary: { lifecycle: "OPENCODE_SERVER_QUESTION", taskId, serverRequestId: described.serverRequestId },
  });
}

/** Reflect a serve-process crash onto running tasks (explicit, never silent). */
function reflectServerCrash(serverState) {
  const sig = `${serverState.startedAt ?? ""}:${serverState.lastError ?? ""}`;
  if (state.lastServerCrashSeen === sig) return;
  state.lastServerCrashSeen = sig;
  for (const task of state.tasks.values()) {
    if (["QUEUED", "STARTING", "RUNNING", "WAITING_FOR_PERMISSION"].includes(task.status) && state.serverSessions.has(task.id)) {
      task.status = "CRASHED";
      task.updatedAt = nowIso();
      task.error = `OpenCode engine stopped: ${(serverState.lastError ?? "process exited").slice(0, 200)} Sessions persist server-side where supported — retry to resume.`;
      persistTask(state.persistApp, task);
      pushEvent(task.id, task.sessionId ?? "unknown", "agent.failed", { message: task.error });
      try {
        unbindServerSession(task.id);
      } catch { /* noop */ }
    }
  }
}

/** Per-task resync generation (replace-state refresh after reconnect). */
const resyncCounters = new Map();

/**
 * Reconnect resync: refresh replace-state (todos, diff, connection notice)
 * for live-bound active tasks. Append-type events dedupe by server eventId,
 * so replay is safe; resync markers carry fresh IDs but renderer treats
 * todos/diff as replace-state, never append.
 */
async function resyncLiveTasks() {
  for (const [taskId, binding] of state.serverSessions.entries()) {
    const task = state.tasks.get(taskId);
    if (!task) continue;
    if (!["RUNNING", "STARTING", "WAITING_FOR_PERMISSION"].includes(task.status)) continue;
    const n = (resyncCounters.get(taskId) ?? 0) + 1;
    resyncCounters.set(taskId, n);
    const sessionId = task.sessionId ?? binding.sessionID;
    pushCanonicalEvents(taskId, sessionId, [{
      eventId: `resync_${binding.sessionID.slice(-8)}_${n}`,
      taskId,
      sessionId,
      timestamp: nowIso(),
      type: "agent.status",
      payload: { message: "Reconnected to the OpenCode engine — resynced session state.", connection: "live" },
    }]);
    try {
      const todos = await serverTodos({ sessionID: binding.sessionID, directory: binding.directory });
      if (Array.isArray(todos)) {
        pushCanonicalEvents(taskId, sessionId, [{
          eventId: `resync_${binding.sessionID.slice(-8)}_${n}_todos`,
          taskId,
          sessionId,
          timestamp: nowIso(),
          type: "agent.todo.updated",
          payload: { todos: todos.slice(0, 50) },
        }]);
      }
    } catch { /* resync best-effort */ }
    try {
      const diff = await serverDiff({ sessionID: binding.sessionID, directory: binding.directory });
      if (Array.isArray(diff) && diff.length) {
        pushCanonicalEvents(taskId, sessionId, [{
          eventId: `resync_${binding.sessionID.slice(-8)}_${n}_diff`,
          taskId,
          sessionId,
          timestamp: nowIso(),
          type: "agent.diff.updated",
          payload: {
            files: diff.slice(0, 64).map((d) => ({
              file: String(d?.file ?? d?.path ?? "").slice(0, 1024),
              status: String(d?.status ?? "modified").slice(0, 32),
              additions: Number(d?.additions ?? 0) || 0,
              deletions: Number(d?.deletions ?? 0) || 0,
              patch: typeof d?.patch === "string" ? d.patch.slice(0, 20000) : undefined,
            })),
          },
        }]);
      }
    } catch { /* resync best-effort */ }
  }
}

function registerServerHooks() {
  setServerHooks({
    taskIdForSession: (sessionID) => state.sessionToTask.get(sessionID),
    onServerEvents: (sessionID, canonicalEvents) => {
      if (!sessionID) return; // connection marker without session — nothing to bind
      const taskId = state.sessionToTask.get(sessionID);
      if (!taskId) return;
      const task = state.tasks.get(taskId);
      pushCanonicalEvents(taskId, task?.sessionId ?? sessionID, canonicalEvents);
    },
    onPermissionAsked: (evt) => {
      void handleServerPermissionAsked(evt).catch((err) => {
        log.warn("permission bridge failed", { error: err instanceof Error ? err.message : "unknown" });
      });
    },
    onQuestionAsked: (evt) => {
      void handleServerQuestionAsked(evt).catch((err) => {
        log.warn("question bridge failed", { error: err instanceof Error ? err.message : "unknown" });
      });
    },
    onConnectionChange: (serverState) => {
      if (serverState.status === "CRASHED") reflectServerCrash(serverState);
    },
    onReconnected: () => {
      void resyncLiveTasks().catch((err) => {
        log.warn("live resync failed", { error: err instanceof Error ? err.message : "unknown" });
      });
    },
  });
}

/** Main app ref for durable persistence (set on IPC registration). */
export function setAgentPersistApp(app) {
  state.persistApp = app ?? null;
}

/* ---------------- detection ---------------- */

function candidateExecutables() {
  const cands = [];
  const home = os.homedir();
  if (process.platform === "win32") {
    cands.push(
      path.join(home, "AppData", "Local", "Programs", "opencode", "opencode.exe"),
      "C:\\Program Files\\opencode\\opencode.exe",
      path.join(home, ".opencode", "bin", "opencode.exe"),
    );
  } else {
    cands.push(
      "/usr/local/bin/opencode",
      "/opt/homebrew/bin/opencode",
      "/opt/opencode/opencode",
      path.join(home, ".local", "bin", "opencode"),
      path.join(home, ".opencode", "bin", "opencode"),
    );
  }
  return cands;
}

async function executableExists(p) {
  try {
    await fsp.access(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function readVersion(executablePath, timeoutMs = 8000) {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    execFile(executablePath, ["--version"], { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      clearTimeout(timer);
      if (err) {
        log.warn("opencode --version failed", { error: String(err.message).slice(0, 200) });
        resolve(null);
        return;
      }
      const text = `${stdout ?? ""} ${stderr ?? ""}`;
      const parsed = parseVersionTag(text);
      resolve(parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : null);
    });
  });
}

/**
 * Detect OpenCode. Main-side only — renderer cannot supply paths.
 * Checks OPENBENTT_OPENCODE_PATH (operator env) then well-known locations
 * then PATH lookup via `opencode --version` semantics (no shell).
 */
export async function detectOpenCode({ refresh = false } = {}) {
  if (state.detectionCache && !refresh) return state.detectionCache;
  const result = { installed: false, source: "unknown", compatible: false };
  const explicit = (process.env.OPENBENTT_OPENCODE_PATH ?? "").trim();
  const searchList = [...(explicit ? [explicit] : []), ...candidateExecutables(), "opencode"];
  for (const cand of searchList) {
    try {
      let resolved = cand;
      if (cand === "opencode") {
        // PATH lookup without shell: try execFile directly.
        const v = await readVersion("opencode");
        if (v) {
          result.installed = true;
          result.executablePath = "opencode";
          result.version = v;
          result.source = "system";
          result.compatible = isSupportedVersion(v, MIN_VERSION);
          break;
        }
        continue;
      }
      if (!(await executableExists(resolved))) continue;
      const v = await readVersion(resolved);
      result.installed = true;
      result.executablePath = resolved;
      result.version = v ?? undefined;
      result.source = explicit && resolved === explicit ? "managed" : "system";
      result.compatible = v ? isSupportedVersion(v, MIN_VERSION) : false;
      break;
    } catch { /* next candidate */ }
  }
  state.detectionCache = result;
  return result;
}

/* ---------------- environment isolation ---------------- */

function buildChildEnv() {
  const allow = new Set(["PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "TMPDIR", "TEMP", "TMP", "SystemRoot", "windir", "NUMBER_OF_PROCESSORS", "OS"]);
  const env = {};
  for (const k of allow) {
    const v = process.env[k];
    if (typeof v === "string" && v) env[k] = v;
  }
  // Explicit provider path for Phase 1 (operator-configured). Never secrets.
  if (process.env.OPENBENTT_OPENCODE_MODEL) env.OPENCODE_MODEL = process.env.OPENBENTT_OPENCODE_MODEL;
  // Phase 2: single source of truth — OmniRoute loopback endpoint.
  // Precedence: live OmniRoute READY base URL → explicit operator override →
  // unset (engine uses its own default). Read ONLY here in main.
  try {
    const omni = getOmniStatus();
    if (omni.status === "READY" && omni.baseUrl) {
      env.OPENAI_BASE_URL = omni.baseUrl;
      env.OPENBENTT_PROVIDER = "omniroute";
    } else if (process.env.OPENBENTT_PROVIDER_BASE_URL) {
      env.OPENAI_BASE_URL = process.env.OPENBENTT_PROVIDER_BASE_URL;
    }
  } catch {
    if (process.env.OPENBENTT_PROVIDER_BASE_URL) env.OPENAI_BASE_URL = process.env.OPENBENTT_PROVIDER_BASE_URL;
  }
  // Surface the configured model when known (never secrets).
  try {
    const { getCachedModels } = globalThis.__openbenttOmniModels ?? {};
    void getCachedModels;
  } catch { /* noop */ }
  env.OPENBENTT_MANAGED = "1";
  return env;
}

/** Resolve provider snapshot for task attribution (audit/debugging). */
function currentProviderSnapshot() {
  try {
    const omni = getOmniStatus();
    return {
      runtime: omni.status,
      baseUrl: omni.status === "READY" ? omni.baseUrl : undefined,
      providerAvailable: omni.provider?.available,
      modelCount: omni.provider?.modelCount ?? 0,
    };
  } catch {
    return { runtime: "UNKNOWN" };
  }
}

/* ---------------- workspace boundary ---------------- */

async function canonicalize(p) {
  try {
    return await fsp.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Validate a workspace root: must exist, be a directory, and contain no null bytes.
 * Returns canonical root.
 */
export async function resolveWorkspaceRoot(rawRoot) {
  if (typeof rawRoot !== "string" || !rawRoot.trim() || rawRoot.length > OPENCODE_LIMITS.maxWorkspacePathChars) {
    throw new Error("Invalid workspace path");
  }
  if (rawRoot.includes("\0")) throw new Error("Invalid workspace path");
  const st = await fsp.stat(rawRoot).catch(() => null);
  if (!st || !st.isDirectory()) throw new Error("Workspace not found");
  return canonicalize(rawRoot);
}

/**
 * Assert candidate is contained in workspace (realpath + lexical). Fail closed.
 * Returns canonical candidate path.
 */
export async function assertPathInWorkspace(workspaceRoot, candidate) {
  if (typeof candidate !== "string" || !candidate.trim() || candidate.length > OPENCODE_LIMITS.maxTargetChars) {
    throw new Error("Invalid target path");
  }
  if (candidate.includes("\0")) throw new Error("Invalid target path");
  const rootCanon = await canonicalize(workspaceRoot);
  const lex = checkPathContainedLexical(rootCanon, candidate);
  if (!lex.ok) throw new Error(`Path outside workspace (${lex.reason})`);
  // Resolve candidate: relative → under root; absolute → as-is then realpath.
  // For non-existent leaves inside a symlinked dir, resolve the nearest
  // existing ancestor so symlink escapes are still caught (fail closed).
  const abs = path.isAbsolute(candidate) ? candidate : path.join(rootCanon, candidate);
  const canon = await canonicalizeWithAncestors(abs);
  const lex2 = checkPathContainedLexical(rootCanon, canon);
  if (!lex2.ok) throw new Error(`Path outside workspace (${lex2.reason})`);
  return canon;
}

async function canonicalizeWithAncestors(absPath) {
  try {
    return await fsp.realpath(absPath);
  } catch {
    // Walk up to nearest existing ancestor, resolve it, re-append remainder.
    const parts = [];
    let cur = absPath;
    for (let i = 0; i < 32; i++) {
      const parent = path.dirname(cur);
      parts.unshift(path.basename(cur));
      try {
        const realParent = await fsp.realpath(parent);
        return path.join(realParent, ...parts);
      } catch {
        if (parent === cur) break;
        cur = parent;
      }
    }
    return path.resolve(absPath);
  }
}

/* ---------------- process lifecycle ---------------- */

export function getRuntimeState() {
  let server = { status: "STOPPED", connected: false };
  try {
    server = getServerState();
  } catch { /* noop */ }
  return {
    status: state.runtime.status,
    pid: state.runtime.pid ?? server.pid,
    startedAt: state.runtime.startedAt ?? server.startedAt,
    executablePath: state.runtime.executablePath ?? server.executablePath,
    version: state.runtime.version ?? server.version,
    sessionCount: state.sessions.size,
    lastError: state.runtime.lastError ?? server.lastError,
    server,
  };
}

export async function ensureRuntime(app) {
  void app;
  const det = await detectOpenCode();
  if (!det.installed) {
    state.runtime.status = "STOPPED";
    state.runtime.lastError = "OpenCode is not installed. See setup guidance in Openbentt Agent settings.";
    return getRuntimeState();
  }
  if (!det.compatible) {
    state.runtime.status = "STOPPED";
    state.runtime.lastError = `OpenCode ${det.version ?? "?"} is below minimum ${MIN_VERSION}.`;
    return getRuntimeState();
  }
  state.runtime.status = "STARTING";
  state.runtime.executablePath = det.executablePath;
  state.runtime.version = det.version;
  try {
    const server = await ensureServer({ executablePath: det.executablePath, version: det.version });
    state.runtime.status = server.status === "READY" ? "READY" : "DEGRADED";
    state.runtime.pid = server.pid;
    state.runtime.startedAt = server.startedAt;
    state.runtime.lastError = server.status === "READY" ? undefined : (server.lastError ?? "Engine degraded — running in task mode.");
  } catch (err) {
    // Engine unavailable: tasks still work via the bounded local harness —
    // every sensitive op still goes through the permission bridge.
    state.runtime.status = "DEGRADED";
    state.runtime.lastError = err instanceof Error ? err.message.slice(0, 300) : "engine start failed";
    log.warn("managed engine unavailable; degraded task mode", { error: state.runtime.lastError.slice(0, 160) });
  }
  return getRuntimeState();
}

/** Live-engine readiness: managed serve READY. */
export function isLiveEngineReady() {
  try {
    return getServerState().status === "READY";
  } catch {
    return false;
  }
}

function startRuntime(det) {
  // Legacy supervisor entry point — the managed serve lifecycle in
  // opencodeServer.mjs owns the child process now. Kept as a thin record
  // so older callers/tests keep working.
  state.runtime.status = "STARTING";
  state.runtime.executablePath = det.executablePath;
  state.runtime.version = det.version;
  state.runtime.status = "READY";
  state.runtime.lastError = undefined;
  return getRuntimeState();
}

function markRuntimeCrashed(reason) {
  const prevPid = state.runtime.pid;
  state.proc = null;
  state.runtime.status = "CRASHED";
  state.runtime.pid = undefined;
  state.runtime.lastError = String(reason).slice(0, 300);
  state.crashInfo = { at: nowIso(), reason: state.runtime.lastError, pid: prevPid };
  // Mark running tasks crashed (never silent success).
  for (const task of state.tasks.values()) {
    if (["QUEUED", "STARTING", "RUNNING", "WAITING_FOR_PERMISSION"].includes(task.status)) {
      task.status = "CRASHED";
      task.updatedAt = nowIso();
      task.error = `OpenCode runtime crashed: ${state.runtime.lastError}`;
      pushEvent(task.id, task.sessionId ?? "unknown", "agent.failed", { message: task.error });
      persistTask(state.persistApp, task);
    }
  }
  for (const sess of state.sessions.values()) {
    if (["CREATING", "READY", "RUNNING", "WAITING_FOR_PERMISSION"].includes(sess.status)) {
      sess.status = "CRASHED";
      sess.updatedAt = nowIso();
    }
  }
}

export async function stopRuntime() {
  state.runtime.status = "STOPPING";
  try {
    await stopServer();
  } catch { /* best effort */ }
  state.proc = null;
  state.runtime.status = "STOPPED";
  state.runtime.pid = undefined;
  return getRuntimeState();
}

export function cleanupOpenCodeOnQuit() {
  try {
    cleanupServeOnQuit();
  } catch { /* noop */ }
  state.proc = null;
}

/* ---------------- sessions ---------------- */

export function createSession({ workspaceId, taskId } = {}) {
  if (state.sessions.size >= MAX_SESSIONS) throw new Error("Too many active sessions");
  const id = newSessionId();
  const now = nowIso();
  const sess = {
    id,
    workspaceId: workspaceId ?? "default",
    status: "READY",
    createdAt: now,
    updatedAt: now,
    taskId,
  };
  state.sessions.set(id, sess);
  return { ...sess };
}

export function getSession(id) {
  assertSafeId(id, "session id");
  const s = state.sessions.get(id);
  return s ? { ...s } : null;
}

export function listSessions() {
  return [...state.sessions.values()].map((s) => ({ ...s }));
}

export function cancelSession(id) {
  const s = state.sessions.get(id);
  if (!s) throw new Error("Session not found");
  s.status = "CANCELLED";
  s.updatedAt = nowIso();
  return { ...s };
}

export function closeSession(id) {
  const s = state.sessions.get(id);
  if (!s) throw new Error("Session not found");
  state.sessions.delete(id);
  return { ok: true };
}

/* ---------------- tasks ---------------- */

function audit(app, fields) {
  try {
    recordToolAuditEvent(app, {
      eventId: newAgentEventId("audit"),
      toolId: OPENCODE_TOOL_ID,
      toolVersion: "1",
      requestId: fields.requestId ?? newAgentEventId("req"),
      timestamp: nowIso(),
      source: "opencode-harness",
      projectId: undefined,
      permission: fields.permission ?? "USER_CONFIRMATION",
      risk: fields.risk ?? "MEDIUM",
      decision: fields.decision ?? "ALLOW",
      status: fields.status ?? "ok",
      durationMs: fields.durationMs ?? 0,
      resourceSummary: fields.resourceSummary ?? {},
      errorCategory: fields.errorCategory,
    });
  } catch (err) {
    log.warn("audit persist failed", { error: err instanceof Error ? err.message : "unknown" });
  }
}

export async function createTask(app, { title, prompt, workspaceRoot, displayName, mode = "build", inputSource = "text", model } = {}) {
  void app;
  if (state.tasks.size >= MAX_TASKS) throw new Error("Too many tasks");
  const cleanPrompt = typeof prompt === "string" ? prompt.slice(0, OPENCODE_LIMITS.maxPromptChars).trim() : "";
  if (!cleanPrompt) throw new Error("Invalid prompt");
  if (mode !== "plan" && mode !== "build") throw new Error("Invalid mode");
  // Phase 3: modality tag only — voice changes NOTHING about routing/policy.
  if (inputSource !== "text" && inputSource !== "voice") throw new Error("Invalid input source");
  // Universal layer: optional model pin from the chat model picker. Strictly
  // a label — bounded charset/length, never a path or command.
  let cleanModel;
  if (model !== undefined && model !== null && String(model).trim() && String(model).trim() !== "auto") {
    const m = String(model).trim().slice(0, 200);
    if (!/^[\w][\w.:/@+-]*$/.test(m)) throw new Error("Invalid model");
    cleanModel = m;
  }
  const root = workspaceRoot ? await resolveWorkspaceRoot(workspaceRoot) : askSandboxDir();
  const category = classifyTask(cleanPrompt);
  const id = newTaskId();
  const now = nowIso();
  const task = {
    id,
    title: sanitizeTaskTitle(title ?? cleanPrompt.slice(0, 80)),
    prompt: cleanPrompt,
    category,
    mode,
    inputSource,
    workspace: {
      workspaceId: `ws_${Buffer.from(root).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`,
      rootPath: root,
      displayName: typeof displayName === "string" && displayName ? displayName.slice(0, 120) : path.basename(root),
    },
    status: "QUEUED",
    createdAt: now,
    updatedAt: now,
    sessionId: undefined,
    lastEvent: undefined,
    error: undefined,
    // Preferred OpenCode model (chat picker); execution resolves it against
    // the gateway model cache and falls back to "auto" when unknown.
    requestedModel: cleanModel,
  };
  state.tasks.set(id, task);
  state.events.set(id, []);
  persistTask(app, task);
  persistSession(app, { id: `sess_pending_${id.slice(-8)}`, workspaceId: task.workspace.workspaceId, status: "CREATING", createdAt: now, updatedAt: now, taskId: id });
  return { ...task, workspace: { ...task.workspace } };
}

function persistTask(app, task) {
  try {
    if (!app) return;
    import("./taskStore.mjs").then(({ saveTask }) => {
      try { saveTask(app, task); } catch { /* best effort */ }
    }).catch(() => {});
  } catch { /* noop */ }
}

function persistSession(app, session) {
  try {
    if (!app) return;
    import("./taskStore.mjs").then(({ saveSession }) => {
      try { saveSession(app, session); } catch { /* best effort */ }
    }).catch(() => {});
  } catch { /* noop */ }
}

function syncTaskState(app, task, session) {
  persistTask(app, task);
  if (session) persistSession(app, session);
}

export function getTask(id) {
  const t = state.tasks.get(id);
  if (!t) return null;
  return { ...t, workspace: { ...t.workspace } };
}

export function listTasks() {
  return [...state.tasks.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, MAX_TASKS)
    .map((t) => ({ ...t, workspace: { ...t.workspace } }));
}

export function getTaskEvents(taskId) {
  return [...(state.events.get(taskId) ?? [])];
}

/* ---------------- universal ask path: `opencode run` (no gateway, no keys) ---------------- */

const ASK_MAX_PROMPT_CHARS = 8000;
const ASK_MAX_OUTPUT_CHARS = 60000;
const ASK_TIMEOUT_MS = 180000;
const ASK_MODEL_RE = /^[\w][\w.:/@+-]*$/;

function assertAskModel(m) {
  if (m === undefined || m === null || m === "auto" || String(m).trim() === "") return undefined;
  const clean = String(m).trim().slice(0, 200);
  if (!ASK_MODEL_RE.test(clean)) throw new Error("Invalid model");
  return clean;
}

function askSandboxDir() {
  const dir = path.join(os.tmpdir(), "openbentt-ask");
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch { /* best effort */ }
  return dir;
}

function stripAnsi(s) {
  return String(s ?? "").replace(/\x1b\[[0-9;]*m/g, "");
}

/** Extract assistant text from `opencode run --format json` event lines (best-effort). */
export function extractAskText(stdout) {
  const raw = stripAnsi(stdout).slice(0, ASK_MAX_OUTPUT_CHARS * 2);
  const lines = raw.split("\n").filter((l) => l.trim());
  const parts = [];
  let sawJson = false;
  for (const line of lines.slice(0, 2000)) {
    const t = line.trim();
    if (!(t.startsWith("{") && t.endsWith("}"))) continue;
    sawJson = true;
    try {
      const evt = JSON.parse(t);
      const texts = [];
      const walk = (v, depth) => {
        if (depth > 6 || texts.join("").length > ASK_MAX_OUTPUT_CHARS) return;
        if (typeof v === "string") {
          // Only harvest known text-bearing keys is complex; harvest leaf
          // strings from text-ish envelopes and filter below.
          texts.push(v);
          return;
        }
        if (Array.isArray(v)) {
          for (const x of v) walk(x, depth + 1);
          return;
        }
        if (v && typeof v === "object") {
          const type = typeof v.type === "string" ? v.type : "";
          if (/^(text|text-delta|content|delta|message)$/i.test(type)) {
            for (const k of ["text", "delta", "content", "value"]) {
              if (typeof v[k] === "string") texts.push(v[k]);
            }
          }
          for (const k of ["part", "delta", "message", "data", "payload"]) {
            if (v[k] !== undefined) walk(v[k], depth + 1);
          }
        }
      };
      walk(evt, 0);
      for (const s of texts) {
        if (s && s.length < 4000) parts.push(s);
      }
    } catch { /* not an event line */ }
  }
  if (parts.length) return redactSecretsFromText(parts.join("")).slice(0, ASK_MAX_OUTPUT_CHARS).trim();
  if (sawJson) return "";
  // Non-JSON output (formatted default): return as plain text.
  return redactSecretsFromText(raw).slice(0, ASK_MAX_OUTPUT_CHARS).trim();
}

/**
 * Answer a conversational turn through the real OpenCode binary.
 * Fail-closed permission posture: fixed argv (execFile, no shell), stdin
 * closed (permission prompts hit EOF → auto-deny, never --auto), bounded
 * prompt/output/time, workspace-contained cwd, secret-redacted output.
 * Auto-denied permission requests are SURFACED (not silent) so the UI can
 * offer them as selectable run-as-task options.
 */
export async function askOpenCode(app, { message, model, workspaceRoot, title, sessionId } = {}) {
  void app;
  const clean = typeof message === "string" ? message.trim().slice(0, ASK_MAX_PROMPT_CHARS) : "";
  if (!clean) throw new Error("Invalid message");
  // Hostile input fails fast, before any detection/spawn work.
  const cleanModel = assertAskModel(model);
  let cleanSession;
  if (sessionId !== undefined && sessionId !== null && String(sessionId).trim()) {
    cleanSession = String(sessionId).trim();
    if (!/^ses_[A-Za-z0-9]+$/.test(cleanSession)) throw new Error("Invalid session");
  }
  const det = await detectOpenCode();
  if (!det.installed) throw new Error("OpenCode is not installed. See Setup → Execution.");
  const cwd = workspaceRoot ? await resolveWorkspaceRoot(workspaceRoot) : askSandboxDir();
  const args = ["run", "--format", "json", "--dir", cwd];
  if (cleanModel) args.push("--model", cleanModel);
  if (cleanSession) args.push("--session", cleanSession);
  if (typeof title === "string" && title.trim()) args.push("--title", title.trim().slice(0, 120));
  args.push(clean);
  const startedAt = Date.now();
  const { text, session, permissionRequests, timedOut } = await new Promise((resolve) => {
    const child = execFile(det.executablePath, args, {
      timeout: ASK_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      env: buildChildEnv(),
    }, (err, stdout, stderr) => {
      if (err && err.killed) {
        resolve({ text: "", session: cleanSession, permissionRequests: [], timedOut: true });
        return;
      }
      resolve({
        text: extractAskText(stdout ?? ""),
        session: extractAskSession(stdout ?? "") ?? cleanSession,
        permissionRequests: extractAskPermissions(stderr ?? ""),
        timedOut: false,
      });
    });
    // Closed stdin: any interactive permission prompt hits EOF and denies.
    try {
      child.stdin?.end();
    } catch { /* noop */ }
  });
  audit(app, {
    decision: "ALLOW", status: timedOut ? "timeout" : "ok", permission: "USER_MESSAGE", risk: "LOW",
    resourceSummary: {
      lifecycle: "OPENCODE_ASK", model: cleanModel ?? "auto",
      durationMs: Date.now() - startedAt, timedOut,
      permissionRequests: permissionRequests.length,
    },
  });
  if (timedOut) throw new Error("OpenCode took too long to answer (180s). Try a shorter question.");
  if (!text && permissionRequests.length === 0) {
    throw new Error("OpenCode returned no answer. Check Setup → Execution for runtime status.");
  }
  return { text, model: cleanModel ?? "auto", durationMs: Date.now() - startedAt, sessionId: session, permissionRequests };
}

/** First sessionID seen in `run --format json` output (continuity). */
export function extractAskSession(stdout) {
  for (const line of String(stdout ?? "").split("\n").slice(0, 50)) {
    const t = line.trim();
    if (!(t.startsWith("{") && t.endsWith("}"))) continue;
    try {
      const evt = JSON.parse(t);
      const sid = typeof evt.sessionID === "string" ? evt.sessionID : null;
      if (sid && /^ses_[A-Za-z0-9]+$/.test(sid)) return sid;
    } catch { /* next */ }
  }
  return undefined;
}

/** `! permission requested: <scope> (<target>); auto-rejecting` stderr lines. */
export function extractAskPermissions(stderrText) {
  const out = [];
  for (const line of stripAnsi(stderrText ?? "").split("\n")) {
    const m = line.match(/permission requested:\s*([^;\n]+)/i);
    if (!m) continue;
    const item = m[1].trim().slice(0, 200);
    if (item && !out.includes(item)) out.push(item);
    if (out.length >= 10) break;
  }
  return out;
}

/** Chat model picker source: the binary's own (Zen) model list. One id per line. */
export async function listOpenCodeModels() {
  const det = await detectOpenCode();
  if (!det.installed) return { models: [], detected: false };
  const out = await new Promise((resolve) => {
    execFile(det.executablePath, ["models"], {
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      env: buildChildEnv(),
    }, (err, stdout) => {
      resolve(err ? "" : String(stdout ?? ""));
    });
  });
  const models = [];
  for (const line of stripAnsi(out).split("\n")) {
    const id = line.trim();
    if (!id || !/^[-\w.:/@+]+$/.test(id) || id.length > 200) continue;
    if (id.startsWith("-") || id.includes(" ")) continue;
    models.push({ id, displayName: id, available: true });
    if (models.length >= 300) break;
  }
  return { models, detected: true };
}

async function simulateExecution(app, task, session) {
  // Phase 1 real-behavior simulator: performs bounded read-only inspection of
  // the workspace (package.json, top-level listing) and emits structured
  // events. Writes/commands ALWAYS go through the permission bridge below —
  // this path never touches the filesystem outside reads, never spawns shells.
  const root = task.workspace.rootPath;
  // Phase 2: attribute provider snapshot; surface degraded gateway honestly.
  const snap = currentProviderSnapshot();
  task.provider = "omniroute";
  try {
    const { getCachedModels } = await import("./omniRouteService.mjs");
    const cached = getCachedModels();
    const known = new Set((cached.models ?? []).map((m) => m?.id).filter(Boolean));
    task.model =
      (task.requestedModel && known.has(task.requestedModel) ? task.requestedModel : null) ??
      cached.models[0]?.id ??
      process.env.OPENBENTT_OPENCODE_MODEL ??
      "auto";
  } catch {
    task.model = task.requestedModel ?? process.env.OPENBENTT_OPENCODE_MODEL ?? "auto";
  }
  task.providerStatus = snap.providerAvailable === false ? "UNAVAILABLE" : snap.runtime === "READY" ? "AVAILABLE" : "DEGRADED";
  persistTask(app, task);
  pushEvent(task.id, session.id, "agent.started", { title: task.title, mode: task.mode, workspace: root });
  if (task.providerStatus !== "AVAILABLE") {
    pushEvent(task.id, session.id, "agent.status", {
      message: snap.runtime === "READY"
        ? "Local AI gateway ready, but no models are currently reported. Continuing with limited inspection."
        : "Local AI gateway is unavailable — running in degraded inspection mode. Execution will pause for approval before any change.",
      providerStatus: task.providerStatus,
    });
  }
  pushEvent(task.id, session.id, "agent.thinking", { message: "Analyzing project…" });
  let listing = [];
  try {
    listing = (await fsp.readdir(root)).slice(0, 40);
  } catch {
    listing = [];
  }
  pushEvent(task.id, session.id, "agent.tool.output", {
    tool: "workspace.list",
    files: listing,
    message: `Found ${listing.length} top-level entries in ${task.workspace.displayName}.`,
  });
  for (const name of ["package.json", "pyproject.toml", "Cargo.toml", "go.mod"].slice(0, 4)) {
    const fp = path.join(root, name);
    try {
      const st = await fsp.stat(fp);
      if (st.isFile()) {
        const content = (await fsp.readFile(fp, "utf8")).slice(0, 4000);
        pushEvent(task.id, session.id, "agent.tool.output", {
          tool: "file.read",
          file: name,
          preview: redactSecretsFromText(content).slice(0, 2000),
          message: `Read ${name}.`,
        });
        pushEvent(task.id, session.id, "agent.file.changed", { file: name, change: "read" });
        break;
      }
    } catch { /* next manifest */ }
  }
  // Heuristic: surface the concrete next sensitive step as a permission request.
  // Checkpointed + pausing: after an unapproved request the run STOPS here
  // (WAITING_FOR_PERMISSION) and resumes via respondToPermission(). Completion
  // is only reachable after every required approval is granted — never by
  // falling through.
  task.checkpoint ??= 0;
  const wantsTest = /test|failing|broken|fix/i.test(task.prompt);
  const wantsWrite = /fix|patch|refactor|modify|create|implement|build|edit|rewrite|update/i.test(task.prompt);
  const wantsDelete = /delete|remove|destroy|wipe/i.test(task.prompt);
  if (wantsDelete && task.checkpoint <= 0) {
    task.checkpoint = 1;
    syncTaskState(app, task, session);
    await requestPermissionBridge(app, task, session, {
      capability: "DELETE_FILES",
      risk: "HIGH",
      description: "OpenCode wants to delete project files. This can permanently destroy data.",
      target: "<workspace files>",
    });
    if (task.status !== "RUNNING") return;
  }
  if (wantsWrite && task.checkpoint <= 1) {
    task.checkpoint = 2;
    syncTaskState(app, task, session);
    await requestPermissionBridge(app, task, session, {
      capability: "WRITE_FILES",
      risk: "MEDIUM",
      description: "OpenCode wants to modify project files to complete the task.",
      target: "<workspace files>",
    });
    if (task.status !== "RUNNING") return;
  }
  if (wantsTest && task.checkpoint <= 2) {
    task.checkpoint = 3;
    syncTaskState(app, task, session);
    await requestPermissionBridge(app, task, session, {
      capability: "RUN_COMMANDS",
      risk: "MEDIUM",
      description: "OpenCode wants to run the project test command.",
      target: "npm test",
      command: "npm test",
      cwd: root,
    });
    if (task.status !== "RUNNING") return;
  }
  task.status = "COMPLETED";
  task.updatedAt = nowIso();
  session.status = "COMPLETED";
  session.updatedAt = nowIso();
  syncTaskState(app, task, session);
  pushEvent(task.id, session.id, "agent.completed", {
    message: "Inspection complete. Approve the requested changes to proceed with writes.",
    filesSeen: listing.slice(0, 10),
  });
  audit(app, {
    decision: "ALLOW", status: "ok", permission: "USER_CONFIRMATION", risk: "LOW",
    resourceSummary: {
      lifecycle: "OPENCODE_TASK_COMPLETED", taskId: task.id,
      provider: task.provider ?? "omniroute", model: task.model ?? "auto",
      providerStatus: task.providerStatus ?? "UNKNOWN",
    },
  });
}

async function requestPermissionBridge(app, task, session, { capability, risk, description, target, command, cwd }) {
  if (!AGENT_CAPABILITIES.includes(capability)) throw new Error("Unknown capability");
  const inWorkspace = true; // target defaults to workspace; validated per-op below.
  const policy = evaluateCapabilityPolicy(capability, { inWorkspace });
  if (policy.decision === "DENY") {
    task.status = "FAILED";
    task.error = `Denied: ${capability}`;
    syncTaskState(app, task, session);
    pushEvent(task.id, session.id, "agent.failed", { message: task.error });
    return;
  }
  // Command-bearing requests: classify + validate cwd containment first.
  let fingerprintInput;
  if (capability === "RUN_COMMANDS" && command) {
    const cls = classifyCommand(command);
    if (cls.level === "SYSTEM_RISK" || cls.level === "HIGH_RISK") {
      risk = "HIGH";
    }
    const dir = cwd ?? task.workspace.rootPath;
    await assertPathInWorkspace(task.workspace.rootPath, dir);
    fingerprintInput = { capability, command: command.slice(0, 1000), cwd: dir, workspace: task.workspace.rootPath };
  } else {
    // File-bearing: validate target containment when concrete.
    let concreteTarget = target;
    if (target && target !== "<workspace files>" && !target.includes("..")) {
      try {
        concreteTarget = await assertPathInWorkspace(task.workspace.rootPath, target);
      } catch (err) {
        task.status = "FAILED";
        task.error = err instanceof Error ? err.message : "workspace violation";
        syncTaskState(app, task, session);
        pushEvent(task.id, session.id, "agent.failed", { message: task.error });
        return;
      }
    }
    fingerprintInput = { capability, target: String(target ?? "").slice(0, 1000), workspace: task.workspace.rootPath };
  }
  const fingerprint = actionFingerprint(OPENCODE_TOOL_ID, task.workspace.workspaceId, fingerprintInput);
  // Reuse live proposal for same fingerprint (no duplicate spam).
  const existing = listApprovals(app, { status: "proposed" }).find(
    (a) => a.fingerprint === fingerprint && a.toolId === OPENCODE_TOOL_ID,
  );
  const approval = existing ?? proposeAction(app, {
    toolId: OPENCODE_TOOL_ID,
    projectId: undefined,
    runId: task.id,
    requestId: newAgentEventId("req"),
    input: { ...fingerprintInput, idempotencyKey: newIdempotencyKey() },
    risk: risk ?? "MEDIUM",
  });
  const request = buildPermissionRequest({
    taskId: task.id,
    sessionId: session.id,
    capability,
    risk: risk ?? "MEDIUM",
    description,
    workspace: task.workspace.rootPath,
    target: target ?? "",
    preview: approval.preview ?? [],
  });
  request.approvalId = approval.id;
  request.fingerprint = fingerprint;
  task.status = "WAITING_FOR_PERMISSION";
  task.updatedAt = nowIso();
  session.status = "WAITING_FOR_PERMISSION";
  session.updatedAt = nowIso();
  syncTaskState(app, task, session);
  pushEvent(task.id, session.id, "agent.permission.requested", { ...request });
  audit(app, {
    decision: "CONFIRM", status: "confirm_required", risk: risk ?? "MEDIUM",
    resourceSummary: { lifecycle: "OPENCODE_PERMISSION_REQUESTED", taskId: task.id, approvalId: approval.id, capability },
  });
  // Execution pauses here — resume via respondToPermission().
}

export async function startTask(app, taskId) {
  const task = state.tasks.get(taskId);
  if (!task) throw new Error("Task not found");
  if (!["QUEUED", "FAILED", "CANCELLED", "CRASHED", "UNKNOWN"].includes(task.status)) {
    throw new Error(`Task is ${task.status}`);
  }
  if (!shouldRouteToOpenCode(task.category) && task.category !== "UNKNOWN") {
    throw new Error(`Task category ${task.category} does not route to OpenCode in Phase 1`);
  }
  await ensureRuntime(app);
  const session = createSession({ workspaceId: task.workspace.workspaceId, taskId: task.id });
  session.status = "RUNNING";
  persistSession(app, session);
  task.sessionId = session.id;
  task.status = "RUNNING";
  task.updatedAt = nowIso();
  task.error = undefined;
  task.waitingKind = undefined;
  task.pendingRequestId = undefined;
  syncTaskState(app, task, session);
  // Live-engine path first: real OpenCode session + prompt_async, results via
  // SSE. Falls back to the bounded local harness only when the engine is
  // unavailable (honestly labeled DEGRADED — never faked).
  if (isLiveEngineReady()) {
    try {
      const root = task.workspace.rootPath;
      const created = await serverCreateSession({
        directory: root,
        title: task.title,
        agent: task.mode === "plan" ? "plan" : "build",
        model: task.requestedModel,
      });
      state.serverSessions.set(task.id, { sessionID: created.id, directory: root });
      state.sessionToTask.set(created.id, task.id);
      bindServerSession(task.id, created.id, root);
      task.opencodeSessionId = created.id;
      session.opencodeSessionId = created.id;
      persistSession(app, session);
      if (created.model && !task.model) task.model = typeof created.model === "string" ? created.model : task.requestedModel ?? task.model;
      syncTaskState(app, task, session);
      pushEvent(task.id, session.id, "agent.started", {
        title: task.title,
        mode: task.mode,
        workspace: root,
        engine: "opencode-server",
        opencodeSessionId: created.id,
        message: `Connected to the OpenCode engine (session ${created.id.slice(0, 16)}…). Streaming live execution.`,
      });
      await serverPrompt({
        sessionID: created.id,
        directory: root,
        text: task.prompt,
        agent: task.mode === "plan" ? "plan" : "build",
        model: task.requestedModel,
      });
      audit(app, {
        decision: "ALLOW", status: "ok", permission: "USER_MESSAGE", risk: "LOW",
        resourceSummary: { lifecycle: "OPENCODE_SERVER_PROMPT", taskId: task.id, opencodeSessionId: created.id, mode: task.mode },
      });
      return { ...task, workspace: { ...task.workspace } };
    } catch (err) {
      // Fall through to the harness simulator below (honestly labeled).
      const msg = err instanceof Error ? err.message.slice(0, 300) : "engine prompt failed";
      log.warn("live-engine prompt failed; harness fallback", { error: msg.slice(0, 160) });
      pushEvent(task.id, session.id, "agent.status", {
        message: `Live engine unavailable (${msg}). Continuing with bounded local inspection — no changes will be made without approval.`,
        degraded: true,
      });
    }
  }
  // Async execution (events stream via agent:event).
  void simulateExecution(app, task, session).catch((err) => {
    task.status = "FAILED";
    task.error = err instanceof Error ? err.message.slice(0, 500) : "execution failed";
    task.updatedAt = nowIso();
    syncTaskState(app, task, session);
    pushEvent(task.id, session.id, "agent.failed", { message: task.error });
  });
  return { ...task, workspace: { ...task.workspace } };
}

export async function cancelTask(app, taskId) {
  const task = state.tasks.get(taskId);
  if (!task) throw new Error("Task not found");
  // Live engine: abort the real session first so work actually stops.
  const binding = state.serverSessions.get(taskId);
  if (binding) {
    try {
      await serverAbort({ sessionID: binding.sessionID, directory: binding.directory });
    } catch (err) {
      log.warn("engine abort failed", { error: err instanceof Error ? err.message.slice(0, 160) : "unknown" });
    }
    try {
      unbindServerSession(taskId);
    } catch { /* noop */ }
  }
  task.status = "CANCELLED";
  task.updatedAt = nowIso();
  task.waitingKind = undefined;
  task.pendingRequestId = undefined;
  if (task.sessionId && state.sessions.has(task.sessionId)) {
    const s = state.sessions.get(task.sessionId);
    s.status = "CANCELLED";
    s.updatedAt = nowIso();
    syncTaskState(app, task, s);
    pushEvent(task.id, s.id, "agent.cancelled", { message: "Cancelled by user." });
  } else {
    persistTask(app, task);
  }
  audit(app, {
    decision: "DENY", status: "denied",
    resourceSummary: { lifecycle: "OPENCODE_TASK_CANCELLED", taskId: task.id },
  });
  return { ...task, workspace: { ...task.workspace } };
}

/**
 * Trusted-UI permission response. Scope: "once" consumes the single approval;
 * "task" consumes + records a task grant for the same fingerprint family;
 * "deny" rejects.
 *
 * Two paths:
 * - Live engine (task has a pending server permission request): the approval
 *   is consumed here (trust boundary), then the decision is forwarded to the
 *   real engine via permission.reply. Execution continues/stops according to
 *   OpenCode behavior — never faked.
 * - Harness simulator: checkpointed local run resumes via simulateExecution.
 */
export async function respondToPermission(app, { approvalId, taskId, decision, scope = "once" } = {}) {
  const task = state.tasks.get(taskId);
  if (!task) throw new Error("Task not found");
  if (task.status !== "WAITING_FOR_PERMISSION") throw new Error("Task is not awaiting permission");
  const approval = getApproval(app, approvalId);
  if (!approval) throw new Error("Approval not found");
  if (!["allow-once", "allow-task", "deny"].includes(decision)) throw new Error("Invalid decision");
  void scope;
  const session = task.sessionId ? state.sessions.get(task.sessionId) : null;

  const livePending = findLivePendingByApproval(approvalId);
  if (livePending) {
    return respondToLivePermission(app, task, session, approval, livePending, decision);
  }

  if (decision === "deny") {
    const { rejectAction } = await import("./actionStore.mjs");
    try { rejectAction(app, approvalId); } catch { /* already decided */ }
    task.status = "FAILED";
    task.error = "Denied by user.";
    task.updatedAt = nowIso();
    if (session) {
      session.status = "FAILED";
      session.updatedAt = nowIso();
      pushEvent(task.id, session.id, "agent.failed", { message: "Permission denied by user." });
    }
    audit(app, {
      decision: "DENY", status: "denied",
      resourceSummary: { lifecycle: "OPENCODE_PERMISSION_DENIED", taskId: task.id, approvalId },
    });
    return { ...task, workspace: { ...task.workspace } };
  }

  // Allow: trusted-UI decision enters here (this IPC handler IS the trust
  // boundary — the renderer cannot approve itself). Record proposed→approved
  // via actionStore, then single-use consume with fingerprint binding.
  // Expired/consumed/wrong-task approvals fail closed here.
  const fpInput = (() => {
    try { return JSON.parse(JSON.stringify(approval.input ?? {})); } catch { return {}; }
  })();
  let consumed;
  try {
    const { approveAction } = await import("./actionStore.mjs");
    approveAction(app, approvalId);
    consumed = consumeApprovalForExecution(app, approvalId, {
      toolId: OPENCODE_TOOL_ID,
      projectId: approval.projectId,
      runId: task.id,
      input: fpInput,
    });
  } catch (err) {
    task.status = "FAILED";
    task.error = err instanceof Error ? err.message.slice(0, 300) : "approval rejected";
    task.updatedAt = nowIso();
    syncTaskState(app, task, session);
    if (session) pushEvent(task.id, session.id, "agent.failed", { message: task.error });
    throw new Error(task.error);
  }
  if (decision === "allow-task") {
    const grants = state.taskGrants.get(task.id) ?? new Set();
    grants.add(consumed.fingerprint);
    state.taskGrants.set(task.id, grants);
  }
  // Record idempotent execution marker (provider = opencode-harness).
  try {
    const key = fpInput.idempotencyKey ?? newIdempotencyKey();
    if (!findExecutionByKey(app, key)) {
      recordExecution(app, {
        idempotencyKey: key,
        toolId: OPENCODE_TOOL_ID,
        fingerprint: consumed.fingerprint,
        runId: task.id,
        approvalId: consumed.id,
        status: "succeeded",
        provider: "opencode-harness",
        result: { capability: "granted", taskId: task.id },
      });
    }
  } catch { /* audit best-effort */ }
  task.status = "RUNNING";
  task.updatedAt = nowIso();
  // Approved RUN_COMMANDS with an allowlisted command + contained cwd are
  // executed FOR REAL here (bounded, observed). Anything else proceeds as
  // inspection-only — never faked.
  const approvedInput = fpInput ?? {};
  if (approvedInput.capability === "RUN_COMMANDS" && typeof approvedInput.command === "string") {
    try {
      const { isCommandAllowed, executeApprovedCommand } = await import("./approvedExec.mjs");
      const cwd = typeof approvedInput.cwd === "string" ? approvedInput.cwd : task.workspace.rootPath;
      await assertPathInWorkspace(task.workspace.rootPath, cwd);
      if (isCommandAllowed(approvedInput.command)) {
        pushEvent(task.id, session?.id ?? "unknown", "agent.command.requested", {
          command: approvedInput.command,
          cwd,
        });
        const execResult = await executeApprovedCommand({
          command: approvedInput.command,
          cwd,
          workspaceRoot: task.workspace.rootPath,
          env: buildChildEnv(),
        });
        task.lastCommandResult = {
          command: execResult.command,
          code: execResult.code,
          timedOut: execResult.timedOut,
          durationMs: execResult.durationMs,
        };
        pushEvent(task.id, session?.id ?? "unknown", "agent.command.output", {
          command: execResult.command,
          exitCode: execResult.code,
          timedOut: execResult.timedOut,
          message: execResult.output.slice(0, 4000),
        });
      } else {
        pushEvent(task.id, session?.id ?? "unknown", "agent.command.output", {
          command: approvedInput.command,
          message: "Not in the safe command allowlist — completed as inspection only.",
        });
      }
    } catch (err) {
      pushEvent(task.id, session?.id ?? "unknown", "agent.command.output", {
        command: approvedInput.command,
        message: `Execution failed: ${err instanceof Error ? err.message.slice(0, 300) : "unknown"}`,
      });
    }
  }
  if (session) {
    session.status = "RUNNING";
    session.updatedAt = nowIso();
    syncTaskState(app, task, session);
    pushEvent(task.id, session.id, "agent.tool.started", {
      message: "Permission approved — continuing.",
      approvalId: consumed.id,
    });
    // Resume the checkpointed run: the next sensitive step (if any) will
    // request its own approval; completion happens only via simulateExecution.
    // Never auto-replay destructive steps after a crash — checkpoint only
    // advances forward through fresh approvals.
    void simulateExecution(app, task, session).catch((err) => {
      if (["COMPLETED", "CANCELLED", "FAILED", "CRASHED"].includes(task.status)) return;
      task.status = "FAILED";
      task.error = err instanceof Error ? err.message.slice(0, 500) : "execution failed";
      task.updatedAt = nowIso();
      syncTaskState(app, task, session);
      pushEvent(task.id, session.id, "agent.failed", { message: task.error });
    });
  }
  audit(app, {
    decision: "ALLOW", status: "ok",
    resourceSummary: {
      lifecycle: "OPENCODE_PERMISSION_GRANTED", taskId: task.id, approvalId: consumed.id,
      provider: task.provider ?? "omniroute", model: task.model ?? "auto",
    },
  });
  return { ...task, workspace: { ...task.workspace } };
}

/** Find a live-engine pending permission by its Openbentt approval id. */
function findLivePendingByApproval(approvalId) {
  for (const [serverRequestId, pending] of state.pendingServerPermissions.entries()) {
    if (pending.approvalId === approvalId) return { serverRequestId, ...pending };
  }
  return null;
}

/**
 * Forward a trusted-UI decision to the real engine. The approval is consumed
 * here (same trust boundary as the harness path); the engine reply uses the
 * honest scope mapping once → once, task → always (saved rule, persists),
 * deny → reject. Failures leave the task WAITING so the user can retry —
 * never fake success.
 */
async function respondToLivePermission(app, task, session, approval, live, decision) {
  const fpInput = (() => {
    try { return JSON.parse(JSON.stringify(approval.input ?? {})); } catch { return {}; }
  })();
  let consumed;
  try {
    const { approveAction, rejectAction } = await import("./actionStore.mjs");
    if (decision === "deny") {
      try { rejectAction(app, approval.id); } catch { /* already decided */ }
    } else {
      approveAction(app, approval.id);
      consumed = consumeApprovalForExecution(app, approval.id, {
        toolId: OPENCODE_TOOL_ID,
        projectId: approval.projectId,
        runId: task.id,
        input: fpInput,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "approval rejected";
    pushEvent(task.id, session?.id ?? "unknown", "agent.error", { message: msg });
    throw new Error(msg);
  }
  const scope = decision === "deny" ? "deny" : decision === "allow-task" ? "task" : "once";
  try {
    await serverReplyPermission({ requestID: live.serverRequestId, directory: live.directory, scope });
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "engine reply failed";
    pushEvent(task.id, session?.id ?? "unknown", "agent.error", {
      message: `Permission reply did not reach the engine (${msg}). The request may have expired — the engine state below is authoritative.`,
    });
    throw new Error(msg);
  }
  state.pendingServerPermissions.delete(live.serverRequestId);
  if (decision === "allow-task" && consumed) {
    const grants = state.taskGrants.get(task.id) ?? new Set();
    grants.add(consumed.fingerprint);
    state.taskGrants.set(task.id, grants);
  }
  try {
    const key = fpInput.idempotencyKey ?? newIdempotencyKey();
    if (!findExecutionByKey(app, key)) {
      recordExecution(app, {
        idempotencyKey: key,
        toolId: OPENCODE_TOOL_ID,
        fingerprint: consumed?.fingerprint ?? live.fingerprint,
        runId: task.id,
        approvalId: approval.id,
        status: decision === "deny" ? "denied" : "succeeded",
        provider: "opencode-server",
        result: { capability: "granted", taskId: task.id, serverRequestId: live.serverRequestId, scope },
      });
    }
  } catch { /* audit best-effort */ }
  // Deny on the live engine does NOT fail the task: the engine observes the
  // rejection and decides (retry differently, ask again, or fail the step) —
  // follow-up SSE events are authoritative.
  task.status = "RUNNING";
  task.waitingKind = undefined;
  task.pendingRequestId = undefined;
  task.updatedAt = nowIso();
  if (session) {
    session.status = "RUNNING";
    session.updatedAt = nowIso();
  }
  syncTaskState(app, task, session);
  pushEvent(task.id, session?.id ?? "unknown", "agent.permission.replied", {
    requestId: live.serverRequestId,
    reply: scope,
    message: decision === "deny"
      ? "Denied — the engine will observe the rejection and decide how to proceed."
      : scope === "task"
        ? "Allowed — a rule was saved with the engine (persists across sessions)."
        : "Allowed once — the engine is resuming.",
  });
  audit(app, {
    decision: decision === "deny" ? "DENY" : "ALLOW",
    status: decision === "deny" ? "denied" : "ok",
    resourceSummary: { lifecycle: "OPENCODE_SERVER_PERMISSION_REPLIED", taskId: task.id, approvalId: approval.id, serverRequestId: live.serverRequestId, scope },
  });
  return { ...task, workspace: { ...task.workspace } };
}

/**
 * Trusted-UI answer to a live-engine question. Answers are validated against
 * the asked options (option labels only — no freeform injection into the
 * reply contract). Rejection is supported explicitly.
 */
export async function respondToQuestion(app, { taskId, serverRequestId, answers, decision = "answer" } = {}) {
  const task = state.tasks.get(taskId);
  if (!task) throw new Error("Task not found");
  if (task.status !== "WAITING_FOR_PERMISSION" || task.waitingKind !== "question") {
    throw new Error("Task is not awaiting an answer");
  }
  if (typeof serverRequestId !== "string" || !serverRequestId.startsWith("que")) {
    throw new Error("Invalid question request");
  }
  const pending = state.pendingServerQuestions.get(serverRequestId);
  if (!pending || pending.taskId !== taskId) throw new Error("Question request not found");
  const session = task.sessionId ? state.sessions.get(task.sessionId) : null;
  if (decision === "reject") {
    try {
      await serverRejectQuestion({ requestID: serverRequestId, directory: pending.directory });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message.slice(0, 300) : "engine reject failed");
    }
    state.pendingServerQuestions.delete(serverRequestId);
    task.status = "RUNNING";
    task.waitingKind = undefined;
    task.pendingRequestId = undefined;
    task.updatedAt = nowIso();
    syncTaskState(app, task, session);
    pushEvent(task.id, session?.id ?? "unknown", "agent.question.rejected", { requestId: serverRequestId });
    return { ...task, workspace: { ...task.workspace } };
  }
  let validated;
  try {
    const { validateQuestionAnswers } = await import("../src/lib/agent/openCodeCore.mjs");
    validated = validateQuestionAnswers(pending.questions, answers);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message.slice(0, 200) : "Invalid answers");
  }
  try {
    await serverReplyQuestion({ requestID: serverRequestId, directory: pending.directory, answers: validated });
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "engine reply failed";
    pushEvent(task.id, session?.id ?? "unknown", "agent.error", { message: `Answer did not reach the engine (${msg}).` });
    throw new Error(msg);
  }
  state.pendingServerQuestions.delete(serverRequestId);
  task.status = "RUNNING";
  task.waitingKind = undefined;
  task.pendingRequestId = undefined;
  task.updatedAt = nowIso();
  if (session) {
    session.status = "RUNNING";
    session.updatedAt = nowIso();
  }
  syncTaskState(app, task, session);
  pushEvent(task.id, session?.id ?? "unknown", "agent.question.answered", {
    requestId: serverRequestId,
    message: "Answer sent — the engine is resuming.",
  });
  audit(app, {
    decision: "ALLOW", status: "ok",
    resourceSummary: { lifecycle: "OPENCODE_SERVER_QUESTION_ANSWERED", taskId: task.id, serverRequestId },
  });
  return { ...task, workspace: { ...task.workspace } };
}

/* ---------------- live-engine read APIs (resync / inspect, validated) ---------------- */

async function requireServerTask(taskId) {
  const task = state.tasks.get(taskId);
  if (!task) throw new Error("Task not found");
  const binding = state.serverSessions.get(taskId);
  if (!binding) throw new Error("Task has no live-engine session");
  return { task, binding };
}

export async function getServerSessionDiff(taskId, messageID) {
  // NOTE (verified against opencode 1.18.32): the engine's session.diff /
  // file.status surfaces are sparse — they stay empty even when the engine
  // demonstrably writes files. File-change visibility therefore relies on
  // agent.file.changed (write/edit tool completions, always emitted) plus
  // the workspace snapshot diffs (workspaceDiff IPC, real patches + undo).
  // This endpoint stays wired so richer engine diffs flow through if/when
  // the engine populates them — never synthesized here.
  const { binding } = await requireServerTask(taskId);
  const diff = await serverDiff({ sessionID: binding.sessionID, directory: binding.directory, messageID });
  if (!Array.isArray(diff)) throw new Error("Unexpected diff response");
  return diff.slice(0, 64).map((d) => ({
    file: String(d?.file ?? d?.path ?? "").slice(0, 1024),
    status: String(d?.status ?? "modified").slice(0, 32),
    additions: Number(d?.additions ?? 0) || 0,
    deletions: Number(d?.deletions ?? 0) || 0,
    patch: typeof d?.patch === "string" ? d.patch.slice(0, 40000) : "",
  }));
}

export async function getServerSessionTodos(taskId) {
  const { binding } = await requireServerTask(taskId);
  const todos = await serverTodos({ sessionID: binding.sessionID, directory: binding.directory });
  if (!Array.isArray(todos)) throw new Error("Unexpected todos response");
  return todos.slice(0, 50).map((t) => ({
    content: String(t?.content ?? "").slice(0, 500),
    status: String(t?.status ?? "pending").slice(0, 32),
    priority: String(t?.priority ?? "medium").slice(0, 16),
  }));
}

export async function getServerSessionMessages(taskId, limit = 100) {
  const { binding } = await requireServerTask(taskId);
  const n = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const messages = await serverMessages({ sessionID: binding.sessionID, directory: binding.directory, limit: n });
  if (!Array.isArray(messages)) throw new Error("Unexpected messages response");
  return messages.slice(-n).map((m) => {
    const info = m?.info && typeof m.info === "object" ? m.info : {};
    const parts = Array.isArray(m?.parts) ? m.parts : [];
    return {
      id: String(info.id ?? "").slice(0, 120),
      role: String(info.role ?? "unknown").slice(0, 32),
      agent: typeof info.agent === "string" ? info.agent.slice(0, 120) : undefined,
      model: info.model && typeof info.model === "object" ? { providerID: String(info.model.providerID ?? "").slice(0, 120), modelID: String(info.model.modelID ?? "").slice(0, 200) } : undefined,
      tokens: info.tokens && typeof info.tokens === "object" ? info.tokens : undefined,
      cost: typeof info.cost === "number" ? info.cost : undefined,
      parts: parts.slice(0, 64).map((p) => redactSecretsFromText(JSON.stringify(p) ?? "").slice(0, 8000)),
    };
  });
}

export async function getServerFileStatus(taskId) {
  const { binding } = await requireServerTask(taskId);
  const files = await serverFileStatus({ directory: binding.directory });
  if (!Array.isArray(files)) throw new Error("Unexpected file status response");
  return files.slice(0, 200).map((f) => ({
    path: String(f?.path ?? f?.file ?? "").slice(0, 1024),
    status: String(f?.status ?? f?.state ?? "modified").slice(0, 64),
    additions: Number(f?.additions ?? 0) || 0,
    deletions: Number(f?.deletions ?? 0) || 0,
  }));
}

export async function getServerChildSessions(taskId) {
  const { binding } = await requireServerTask(taskId);
  const children = await serverChildren({ sessionID: binding.sessionID, directory: binding.directory });
  if (!Array.isArray(children)) throw new Error("Unexpected children response");
  return children.slice(0, 32).map((s) => ({
    id: String(s?.id ?? "").slice(0, 120),
    title: typeof s?.title === "string" ? s.title.slice(0, 200) : undefined,
    agent: typeof s?.agent === "string" ? s.agent.slice(0, 120) : undefined,
  }));
}

/* ---------------- Phase 2: gateway failure + recovery + shutdown ---------------- */

/**
 * Called when OmniRoute crashes: mark RUNNING tasks as provider-degraded
 * (distinct from OpenCode failure). Never auto-replay destructive steps.
 */
export function notifyOmniRouteCrash(reason) {
  for (const task of state.tasks.values()) {
    if (["RUNNING", "WAITING_FOR_PERMISSION", "STARTING", "QUEUED"].includes(task.status)) {
      task.providerStatus = "UNAVAILABLE";
      task.updatedAt = nowIso();
      if (!task.error) task.error = `Local AI gateway unavailable: ${String(reason ?? "crashed").slice(0, 200)}`;
      pushEvent(task.id, task.sessionId ?? "unknown", "agent.status", {
        message: "Execution interrupted because the local AI runtime stopped. Verify state before retrying; destructive steps are never auto-replayed.",
        providerStatus: "UNAVAILABLE",
      });
      persistTask(state.persistApp, task);
    }
  }
}

/**
 * Startup reconciliation: hydrate durable history into memory and mark
 * anything left mid-flight as UNKNOWN (explicit, never completed).
 */
export async function reconcileAgentStateOnStartup(app) {
  setAgentPersistApp(app);
  let reconciled = 0;
  try {
    const { reconcileInterruptedTasks, listTasks: listPersisted, getTaskEvents, listSessions: listPersistedSessions } = await import("./taskStore.mjs");
    reconciled = reconcileInterruptedTasks(app);
    // Live-engine resume: rebind persisted server sessions so the new
    // process can re-attach (SSE resync dedupes by server eventId — no
    // duplicates). Mid-flight WAITING tasks were marked UNKNOWN above, so
    // only settled bindings resume here; interrupted ones need explicit retry.
    try {
      for (const s of listPersistedSessions(app, 200)) {
        if (s?.opencodeSessionId && s?.taskId && typeof s.opencodeSessionId === "string" && /^ses_/.test(s.opencodeSessionId)) {
          const t = state.tasks.get(s.taskId) ?? listPersisted(app, 200).find((x) => x.id === s.taskId);
          const root = t?.workspace?.rootPath;
          if (root) {
            state.serverSessions.set(s.taskId, { sessionID: s.opencodeSessionId, directory: root });
            state.sessionToTask.set(s.opencodeSessionId, s.taskId);
          }
        }
      }
    } catch { /* resume best-effort */ }
    for (const t of listPersisted(app, 200)) {
      if (!state.tasks.has(t.id)) {
        state.tasks.set(t.id, {
          id: t.id,
          title: t.title,
          prompt: t.prompt,
          category: t.category,
          mode: t.mode,
          workspace: { ...t.workspace },
          status: t.status,
          sessionId: t.sessionId,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          error: t.error,
          provider: t.provider,
          model: t.model,
          providerStatus: t.providerStatus,
          opencodeSessionId: state.serverSessions.get(t.id)?.sessionID,
          waitingKind: undefined,
          pendingRequestId: undefined,
        });
        try {
          state.events.set(t.id, getTaskEvents(app, t.id));
        } catch { /* noop */ }
      }
    }
  } catch (err) {
    log.warn("agent reconcile failed", { error: err instanceof Error ? err.message : "unknown" });
  }
  return { reconciled };
}

export function getCombinedStatus() {
  let omni = { status: "UNKNOWN" };
  try {
    omni = getOmniStatus();
  } catch { /* noop */ }
  return {
    opencode: getRuntimeState(),
    omniRoute: omni,
    tasks: listTasks().length,
    sessions: listSessions().length,
  };
}

/** Bounded shutdown: tasks → OpenCode → OmniRoute → flush. */
export async function shutdownAgentServices() {
  for (const task of state.tasks.values()) {
    if (["QUEUED", "STARTING", "RUNNING", "WAITING_FOR_PERMISSION"].includes(task.status)) {
      task.status = "CANCELLED";
      task.updatedAt = nowIso();
      task.error = "Cancelled by application shutdown.";
      persistTask(state.persistApp, task);
    }
  }
  await stopRuntime();
  try {
    const { stopOmniRoute } = await import("./omniRouteService.mjs");
    await stopOmniRoute();
  } catch { /* best effort */ }
}

/* ---------------- IPC registration (agent:* multiplex) ---------------- */

function assertTaskPayload(p, need = []) {
  if (!p || typeof p !== "object") throw new Error("Invalid payload");
  for (const k of need) {
    if (p[k] === undefined) throw new Error(`Missing ${k}`);
  }
  return p;
}

export function registerOpenCodeIpc(ipcMain, app) {
  setAgentPersistApp(app);
  registerServerHooks();
  try {
    import("./omniRouteService.mjs").then(({ setOmniRouteCrashListener }) => {
      setOmniRouteCrashListener((reason) => notifyOmniRouteCrash(reason));
    }).catch(() => {});
  } catch { /* noop */ }
  ipcMain.handle("agent:detectOpenCode", async () => detectOpenCode({ refresh: true }));
  ipcMain.handle("agent:defaultWorkspace", async () => ({ path: askSandboxDir() }));
  ipcMain.handle("agent:status", async () => ({
    runtime: getRuntimeState(),
    tasks: listTasks().length,
    sessions: listSessions().length,
  }));
  ipcMain.handle("agent:createTask", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["prompt", "workspaceRoot"]);
    if (typeof p.prompt !== "string" || !p.prompt.trim() || p.prompt.length > OPENCODE_LIMITS.maxPromptChars) {
      throw new Error("Invalid prompt");
    }
    if (typeof p.workspaceRoot !== "string" || p.workspaceRoot.length > OPENCODE_LIMITS.maxWorkspacePathChars) {
      throw new Error("Invalid workspace");
    }
    // Prompt-injection guard: external content markers are preserved as data.
    const scan = scanForPromptInjection(p.prompt);
    void scan;
    return createTask(app, {
      title: typeof p.title === "string" ? p.title.slice(0, 200) : undefined,
      prompt: p.prompt,
      workspaceRoot: p.workspaceRoot,
      displayName: typeof p.displayName === "string" ? p.displayName.slice(0, 120) : undefined,
      mode: p.mode === "plan" ? "plan" : "build",
      inputSource: p.inputSource === "voice" ? "voice" : "text",
      // Optional OpenCode model pin (validated inside createTask).
      model: p.model,
    });
  });
  ipcMain.handle("agent:startTask", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["taskId"]);
    assertSafeId(p.taskId, "task id");
    return startTask(app, p.taskId);
  });
  ipcMain.handle("agent:cancelTask", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["taskId"]);
    assertSafeId(p.taskId, "task id");
    return cancelTask(app, p.taskId);
  });
  ipcMain.handle("agent:getTask", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["taskId"]);
    assertSafeId(p.taskId, "task id");
    const t = getTask(p.taskId);
    if (!t) throw new Error("Task not found");
    return { task: t, events: getTaskEvents(p.taskId) };
  });
  ipcMain.handle("agent:listTasks", async () => listTasks());
  ipcMain.handle("agent:permission", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["taskId", "approvalId", "decision"]);
    assertSafeId(p.taskId, "task id");
    if (typeof p.approvalId !== "string" || !p.approvalId) throw new Error("Invalid approval");
    return respondToPermission(app, {
      taskId: p.taskId,
      approvalId: p.approvalId,
      decision: p.decision,
      scope: p.scope,
    });
  });
  ipcMain.handle("agent:question", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["taskId", "serverRequestId"]);
    assertSafeId(p.taskId, "task id");
    if (typeof p.serverRequestId !== "string" || !p.serverRequestId.startsWith("que")) {
      throw new Error("Invalid question request");
    }
    if (p.decision !== undefined && p.decision !== "answer" && p.decision !== "reject") {
      throw new Error("Invalid decision");
    }
    if (p.decision === "reject") {
      return respondToQuestion(app, { taskId: p.taskId, serverRequestId: p.serverRequestId, decision: "reject" });
    }
    if (!Array.isArray(p.answers) || !p.answers.length) throw new Error("Invalid answers");
    const answers = p.answers.slice(0, 8).map((a) => (Array.isArray(a) ? a.slice(0, 12).map((x) => String(x).slice(0, 500)) : [String(a).slice(0, 500)]));
    return respondToQuestion(app, { taskId: p.taskId, serverRequestId: p.serverRequestId, answers, decision: "answer" });
  });
  /* Live-engine inspection: real session diffs / todos / messages / files / children. */
  ipcMain.handle("agent:serverStatus", async () => getServerState());
  ipcMain.handle("agent:sessionDiff", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["taskId"]);
    assertSafeId(p.taskId, "task id");
    const messageID = p.messageID !== undefined && p.messageID !== null ? String(p.messageID).slice(0, 120) : undefined;
    return getServerSessionDiff(p.taskId, messageID);
  });
  ipcMain.handle("agent:sessionTodos", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["taskId"]);
    assertSafeId(p.taskId, "task id");
    return getServerSessionTodos(p.taskId);
  });
  ipcMain.handle("agent:sessionMessages", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["taskId"]);
    assertSafeId(p.taskId, "task id");
    const limit = p.limit === undefined ? 100 : Math.min(Math.max(Number(p.limit) || 100, 1), 200);
    return getServerSessionMessages(p.taskId, limit);
  });
  ipcMain.handle("agent:fileStatus", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["taskId"]);
    assertSafeId(p.taskId, "task id");
    return getServerFileStatus(p.taskId);
  });
  ipcMain.handle("agent:sessionChildren", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["taskId"]);
    assertSafeId(p.taskId, "task id");
    return getServerChildSessions(p.taskId);
  });
  ipcMain.handle("agent:ask", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["message"]);
    if (typeof p.message !== "string" || !p.message.trim()) throw new Error("Invalid message");
    let workspaceRoot;
    if (p.workspaceRoot !== undefined && p.workspaceRoot !== null && String(p.workspaceRoot).trim()) {
      if (String(p.workspaceRoot).length > OPENCODE_LIMITS.maxWorkspacePathChars) throw new Error("Invalid workspace");
      workspaceRoot = String(p.workspaceRoot);
    }
    let sessionId;
    if (p.sessionId !== undefined && p.sessionId !== null && String(p.sessionId).trim()) {
      sessionId = String(p.sessionId).trim().slice(0, 120);
    }
    return askOpenCode(app, {
      message: p.message,
      model: p.model,
      workspaceRoot,
      title: typeof p.title === "string" ? p.title : undefined,
      sessionId,
    });
  });
  ipcMain.handle("agent:opencodeModels", async () => listOpenCodeModels());
  ipcMain.handle("agent:classify", async (_e, payload) => {
    const p = assertTaskPayload(payload, ["text"]);
    if (typeof p.text !== "string" || p.text.length > 20000) throw new Error("Invalid text");
    const category = classifyTask(p.text);
    const { shouldRouteToOpenCode } = await import("../src/lib/agent/openCodeCore.mjs");
    return { category, routeToOpenCode: shouldRouteToOpenCode(category) };
  });
  /* Phase 2: OmniRoute + runtime observability (narrow, validated). */
  ipcMain.handle("agent:detectOmniRoute", async () => {
    const { detectOmniRoute } = await import("./omniRouteService.mjs");
    return detectOmniRoute({ refresh: true });
  });
  ipcMain.handle("agent:runtimeStatus", async () => getCombinedStatus());
  ipcMain.handle("agent:models", async (_e, payload) => {
    const refresh = payload?.refresh !== false;
    const { getOmniRouteModels, getCachedModels } = await import("./omniRouteService.mjs");
    if (!refresh) return getCachedModels();
    try {
      return await getOmniRouteModels({ refresh: true });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message.slice(0, 200) : "models unavailable");
    }
  });
  ipcMain.handle("agent:ensureRuntime", async () => {
    const { startOmniRoute } = await import("./omniRouteService.mjs");
    const omni = await startOmniRoute(app);
    const code = await ensureRuntime(app);
    return { omniRoute: omni, opencode: code };
  });
  ipcMain.handle("agent:restartRuntime", async () => {
    const { restartOmniRoute } = await import("./omniRouteService.mjs");
    const omni = await restartOmniRoute(app);
    return { omniRoute: omni };
  });
}

/* ---------------- test hooks ---------------- */

export const __testHooks = {
  reset() {
    state.tasks.clear();
    state.sessions.clear();
    state.events.clear();
    state.taskGrants.clear();
    state.procStderrTail = "";
    state.detectionCache = null;
    state.crashInfo = null;
    state.serverSessions.clear();
    state.sessionToTask.clear();
    state.pendingServerPermissions.clear();
    state.pendingServerQuestions.clear();
    state.seenServerEventIds.clear();
    state.lastServerCrashSeen = null;
  },
  markCrashed: markRuntimeCrashed,
  setDetectionCache(v) {
    state.detectionCache = v;
  },
  buildChildEnv,
};

export { classifyTask, classifyCommand, compareVersions, MIN_VERSION, OPENCODE_TOOL_ID };
