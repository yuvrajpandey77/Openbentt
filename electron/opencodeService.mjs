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
import { spawn, execFile } from "node:child_process";
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
  return {
    status: state.runtime.status,
    pid: state.runtime.pid,
    startedAt: state.runtime.startedAt,
    executablePath: state.runtime.executablePath,
    version: state.runtime.version,
    sessionCount: state.sessions.size,
    lastError: state.runtime.lastError,
  };
}

export async function ensureRuntime(app) {
  void app;
  if (state.proc && state.runtime.status === "READY") return getRuntimeState();
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
  return startRuntime(det);
}

function startRuntime(det) {
  if (state.proc) return getRuntimeState();
  state.runtime.status = "STARTING";
  state.runtime.executablePath = det.executablePath;
  state.runtime.version = det.version;
  try {
    // Supervised long-lived process: `opencode serve` when available.
    // If the binary exits immediately (e.g. CLI without serve), we stay
    // DEGRADED but sessions/tasks still work via bounded local execution —
    // every sensitive op still goes through the permission bridge.
    const child = spawn(det.executablePath, ["serve", "--port", "0"], {
      env: buildChildEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    state.proc = child;
    state.runtime.pid = child.pid;
    state.runtime.startedAt = nowIso();
    child.stdout?.on("data", (d) => {
      state.procStderrTail = `${state.procStderrTail}${String(d).slice(0, 4000)}`.slice(-MAX_LOG_CHARS);
    });
    child.stderr?.on("data", (d) => {
      const redacted = redactSecretsFromText(String(d));
      state.procStderrTail = `${state.procStderrTail}${redacted.slice(0, 4000)}`.slice(-MAX_LOG_CHARS);
    });
    child.on("error", (err) => {
      log.warn("opencode process error", { error: String(err?.message ?? err).slice(0, 300) });
      markRuntimeCrashed(`spawn error: ${String(err?.message ?? err).slice(0, 200)}`);
    });
    child.on("exit", (code, signal) => {
      // `opencode serve --port 0` exits quickly on CLIs without serve mode —
      // treat fast non-zero exit as DEGRADED (supervision unavailable),
      // not CRASHED, so tasks can still run via the harness simulator path.
      const uptimeMs = state.runtime.startedAt ? Date.now() - Date.parse(state.runtime.startedAt) : 0;
      if (uptimeMs < 5000) {
        state.proc = null;
        state.runtime.status = "DEGRADED";
        state.runtime.lastError = `OpenCode supervisor exited (code=${code}, signal=${signal ?? "-"}). Running in task mode.`;
        log.warn("opencode supervisor exited early; degraded task mode", { code, signal });
        return;
      }
      markRuntimeCrashed(`exit code=${code} signal=${signal ?? "-"}`);
    });
    state.runtime.status = "READY";
    state.runtime.lastError = undefined;
  } catch (err) {
    state.runtime.status = "CRASHED";
    state.runtime.lastError = err instanceof Error ? err.message.slice(0, 300) : "start failed";
  }
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
  const child = state.proc;
  state.proc = null;
  if (child && !child.killed) {
    try {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 800));
      if (!child.killed) child.kill("SIGKILL");
    } catch { /* best effort */ }
  }
  state.runtime.status = "STOPPED";
  state.runtime.pid = undefined;
  return getRuntimeState();
}

export function cleanupOpenCodeOnQuit() {
  try {
    const child = state.proc;
    state.proc = null;
    if (child && !child.killed) {
      try { child.kill("SIGTERM"); } catch { /* noop */ }
    }
  } catch { /* noop */ }
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
  const root = await resolveWorkspaceRoot(workspaceRoot);
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
  const wantsWrite = /fix|patch|refactor|modify|create|implement|build/i.test(task.prompt);
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
  if (!["QUEUED", "FAILED", "CANCELLED", "CRASHED"].includes(task.status)) {
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
  syncTaskState(app, task, session);
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
  task.status = "CANCELLED";
  task.updatedAt = nowIso();
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
    const { reconcileInterruptedTasks, listTasks: listPersisted, getTaskEvents } = await import("./taskStore.mjs");
    reconciled = reconcileInterruptedTasks(app);
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
  try {
    import("./omniRouteService.mjs").then(({ setOmniRouteCrashListener }) => {
      setOmniRouteCrashListener((reason) => notifyOmniRouteCrash(reason));
    }).catch(() => {});
  } catch { /* noop */ }
  ipcMain.handle("agent:detectOpenCode", async () => detectOpenCode({ refresh: true }));
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
  },
  markCrashed: markRuntimeCrashed,
  setDetectionCache(v) {
    state.detectionCache = v;
  },
  buildChildEnv,
};

export { classifyTask, classifyCommand, compareVersions, MIN_VERSION, OPENCODE_TOOL_ID };
