/**
 * OpenCode server adapter (Electron main only).
 *
 * Owns a managed `opencode serve` child process on a loopback-only ephemeral
 * port and bridges its REST + SSE event stream into canonical Openbentt
 * execution events:
 *
 *   opencode serve (REST + GET /event SSE)
 *     → opencodeServer.mjs (this file: lifecycle, client, subscriber)
 *     → hooks registered by opencodeService.mjs (task binding, approvals,
 *       persistence, window fan-out)
 *     → renderer (chat, timeline, terminal, diffs, permissions, questions)
 *
 * This module never touches task state, approvals, or windows directly — all
 * authority stays in opencodeService.mjs via hooks. It is intentionally
 * dependency-free (node builtins + openCodeCore.mjs + log.mjs) so it can be
 * unit-tested against a mock HTTP server.
 *
 * Security invariants:
 * - Loopback only (127.0.0.1). Every URL is asserted to be loopback.
 * - Minimal child env (mirrors opencodeService.mjs); process.env is NOT
 *   inherited wholesale. No secrets are ever logged or sent to the renderer
 *   without redaction.
 * - Renderer never supplies executable paths, ports, or hosts.
 * - SSE payloads are bounded + secret-redacted by normalizeServerEvents.
 */

import { spawn } from "node:child_process";
import net from "node:net";
import { createLogger } from "./log.mjs";
import {
  normalizeServerEvents,
  redactSecretsFromText,
} from "../src/lib/agent/openCodeCore.mjs";

const log = createLogger("opencode-server");

/* ---------------- state ---------------- */

const SERVER_STATUSES = ["STOPPED", "STARTING", "READY", "DEGRADED", "STOPPING", "CRASHED"];

const state = {
  status: "STOPPED",
  port: undefined,
  pid: undefined,
  startedAt: undefined,
  lastError: undefined,
  executablePath: undefined,
  version: undefined,
  /** SSE connection state (per-directory subscribers; see below) */
  connected: false,
  /** directory -> { ctrl: AbortController, task: Promise, failures: number, firstConnect: boolean } */
  subs: new Map(),
  /** taskId -> { sessionID, directory } (bindings with live subscriptions) */
  bindings: new Map(),
  reconnects: 0,
  restarts: 0,
  proc: null,
};

let hooks = {
  /** (sessionID) => taskId | undefined */
  taskIdForSession: () => undefined,
  /** (sessionID, canonicalEvents[]) => void */
  onServerEvents: () => {},
  /** (serverEvent) => void — permission/question need approval + task context */
  onPermissionAsked: () => {},
  onQuestionAsked: () => {},
  /** (serverState) => void */
  onConnectionChange: () => {},
  /** () => void — a dropped stream reconnected; resync replace-state */
  onReconnected: () => {},
};

export function setServerHooks(next) {
  hooks = { ...hooks, ...(next ?? {}) };
}

export function getServerState() {
  return {
    status: state.status,
    port: state.port,
    pid: state.pid,
    startedAt: state.startedAt,
    lastError: state.lastError,
    executablePath: state.executablePath,
    version: state.version,
    connected: state.connected,
    reconnects: state.reconnects,
    restarts: state.restarts,
  };
}

function setStatus(status, extra = {}) {
  if (!SERVER_STATUSES.includes(status)) throw new Error("Invalid server status");
  state.status = status;
  if (extra.lastError !== undefined) state.lastError = extra.lastError;
  try {
    hooks.onConnectionChange(getServerState());
  } catch { /* hooks never break the engine */ }
}

/* ---------------- environment isolation (mirrors opencodeService) ---------------- */

export function buildServeEnv() {
  const allow = new Set([
    "PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM",
    "TMPDIR", "TEMP", "TMP", "SystemRoot", "windir",
    "NUMBER_OF_PROCESSORS", "OS",
  ]);
  const env = {};
  for (const k of allow) {
    const v = process.env[k];
    if (typeof v === "string" && v) env[k] = v;
  }
  if (process.env.OPENBENTT_OPENCODE_MODEL) env.OPENCODE_MODEL = process.env.OPENBENTT_OPENCODE_MODEL;
  env.OPENBENTT_MANAGED = "1";
  return env;
}

/* ---------------- loopback HTTP client ---------------- */

function assertLoopbackPort(port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error("Invalid server port");
  return p;
}

function baseUrl() {
  if (!state.port) throw new Error("OpenCode server is not running");
  return `http://127.0.0.1:${assertLoopbackPort(state.port)}`;
}

async function rest(method, path, { body, query, timeoutMs = 30000 } = {}) {
  const url = new URL(baseUrl() + path);
  // Only loopback, only http. Directory scoping is a query param the caller sets.
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new Error("Non-loopback URL refused");
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("request timeout")), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      const snippet = redactSecretsFromText(raw).slice(0, 300);
      throw new Error(`OpenCode server ${res.status} on ${method} ${path}: ${snippet}`);
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } finally {
    clearTimeout(timer);
  }
}

function cleanDirectory(directory) {
  if (typeof directory !== "string" || !directory.trim() || directory.length > 4096) {
    throw new Error("Invalid directory");
  }
  if (directory.includes("\0")) throw new Error("Invalid directory");
  return directory;
}

function cleanSessionId(id) {
  if (typeof id !== "string" || !/^ses_[A-Za-z0-9]+$/.test(id.trim())) throw new Error("Invalid session");
  return id.trim();
}

function cleanRequestId(id, prefix) {
  if (typeof id !== "string" || !id.startsWith(prefix) || id.length > 160) throw new Error("Invalid request id");
  return id;
}

/* ---------------- session / execution REST ops ---------------- */

export async function serverCreateSession({ directory, title, agent, model } = {}) {
  const dir = cleanDirectory(directory);
  const body = {};
  if (typeof title === "string" && title.trim()) body.title = title.trim().slice(0, 120);
  if (agent === "build" || agent === "plan") body.agent = agent;
  const modelRef = toModelRef(model);
  if (modelRef) body.model = modelRef;
  const created = await rest("POST", "/session", { body, query: { directory: dir } });
  if (!created || typeof created.id !== "string") throw new Error("Server did not return a session");
  return created;
}

export function toModelRef(model) {
  if (model === undefined || model === null || model === "auto" || String(model).trim() === "") return undefined;
  const clean = String(model).trim().slice(0, 200);
  if (!/^[\w][\w.:/@+-]*$/.test(clean)) throw new Error("Invalid model");
  const slash = clean.indexOf("/");
  if (slash <= 0) return undefined; // server needs provider/model; bare ids use server default
  return { providerID: clean.slice(0, slash), id: clean.slice(slash + 1) };
}

/** Send a user message asynchronously — returns immediately, results arrive via SSE. */
export async function serverPrompt({ sessionID, directory, text, agent, model } = {}) {
  const sid = cleanSessionId(sessionID);
  const dir = cleanDirectory(directory);
  const clean = typeof text === "string" ? text.trim().slice(0, 20000) : "";
  if (!clean) throw new Error("Invalid prompt");
  const body = { parts: [{ type: "text", text: clean }] };
  if (agent === "build" || agent === "plan") body.agent = agent;
  const modelRef = toModelRef(model);
  if (modelRef) body.model = { providerID: modelRef.providerID, modelID: modelRef.id };
  await rest("POST", `/session/${encodeURIComponent(sid)}/prompt_async`, { body, query: { directory: dir } });
  return { ok: true, sessionID: sid };
}

export async function serverAbort({ sessionID, directory } = {}) {
  const sid = cleanSessionId(sessionID);
  const dir = directory ? cleanDirectory(directory) : undefined;
  await rest("POST", `/session/${encodeURIComponent(sid)}/abort`, { query: dir ? { directory: dir } : {} });
  return { ok: true };
}

/**
 * Reply to a permission request. Scope mapping (honest, no invention):
 * - "once"   → engine `once` (this request only)
 * - "task"   → engine `always` (saves a rule; persists across sessions —
 *              the UI must say so explicitly)
 * - "deny"   → engine `reject`
 */
export async function serverReplyPermission({ requestID, directory, scope } = {}) {
  const rid = cleanRequestId(requestID, "per");
  const dir = directory ? cleanDirectory(directory) : undefined;
  const reply = scope === "task" ? "always" : scope === "deny" ? "reject" : "once";
  await rest("POST", `/permission/${encodeURIComponent(rid)}/reply`, {
    body: { reply },
    query: dir ? { directory: dir } : {},
  });
  return { ok: true, reply };
}

export async function serverReplyQuestion({ requestID, directory, answers } = {}) {
  const rid = cleanRequestId(requestID, "que");
  const dir = directory ? cleanDirectory(directory) : undefined;
  if (!Array.isArray(answers) || !answers.length || answers.length > 8) throw new Error("Invalid answers");
  const clean = answers.map((a) => {
    const arr = (Array.isArray(a) ? a : [a]).map((x) => String(x).slice(0, 500));
    if (!arr.length) throw new Error("Empty answer");
    return arr.slice(0, 12);
  });
  await rest("POST", `/question/${encodeURIComponent(rid)}/reply`, {
    body: { answers: clean },
    query: dir ? { directory: dir } : {},
  });
  return { ok: true };
}

export async function serverRejectQuestion({ requestID, directory } = {}) {
  const rid = cleanRequestId(requestID, "que");
  const dir = directory ? cleanDirectory(directory) : undefined;
  await rest("POST", `/question/${encodeURIComponent(rid)}/reject`, { query: dir ? { directory: dir } : {} });
  return { ok: true };
}

export async function serverMessages({ sessionID, directory, limit = 200 } = {}) {
  const sid = cleanSessionId(sessionID);
  const dir = cleanDirectory(directory);
  const n = Math.min(Math.max(Number(limit) || 200, 1), 500);
  return rest("GET", `/session/${encodeURIComponent(sid)}/message`, { query: { directory: dir, limit: n } });
}

export async function serverDiff({ sessionID, directory, messageID } = {}) {
  const sid = cleanSessionId(sessionID);
  const dir = cleanDirectory(directory);
  const query = { directory: dir };
  if (messageID !== undefined && messageID !== null && String(messageID).trim()) {
    const mid = String(messageID).trim();
    if (!/^msg_[A-Za-z0-9]+$/.test(mid)) throw new Error("Invalid message");
    query.messageID = mid;
  }
  return rest("GET", `/session/${encodeURIComponent(sid)}/diff`, { query });
}

export async function serverTodos({ sessionID, directory } = {}) {
  const sid = cleanSessionId(sessionID);
  const dir = cleanDirectory(directory);
  return rest("GET", `/session/${encodeURIComponent(sid)}/todo`, { query: { directory: dir } });
}

export async function serverFileStatus({ directory } = {}) {
  const dir = cleanDirectory(directory);
  return rest("GET", "/file/status", { query: { directory: dir } });
}

export async function serverSessionStatus({ directory } = {}) {
  const dir = directory ? cleanDirectory(directory) : undefined;
  return rest("GET", "/session/status", { query: dir ? { directory: dir } : {} });
}

export async function serverChildren({ sessionID, directory } = {}) {
  const sid = cleanSessionId(sessionID);
  const dir = cleanDirectory(directory);
  return rest("GET", `/session/${encodeURIComponent(sid)}/children`, { query: { directory: dir } });
}

export async function serverSessionInfo({ sessionID, directory } = {}) {
  const sid = cleanSessionId(sessionID);
  const dir = directory ? cleanDirectory(directory) : undefined;
  return rest("GET", `/session/${encodeURIComponent(sid)}`, { query: dir ? { directory: dir } : {} });
}

/* ---------------- lifecycle ---------------- */

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("No free port"))));
    });
  });
}

async function waitForHealth(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      await rest("GET", "/global/health", { timeoutMs: 2000 });
      return true;
    } catch (err) {
      lastErr = err instanceof Error ? err.message.slice(0, 160) : "health check failed";
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Server did not become ready: ${lastErr}`);
}

export async function ensureServer({ executablePath, version } = {}) {
  if (!executablePath || typeof executablePath !== "string") throw new Error("No OpenCode executable");
  if (state.status === "READY" && state.proc && state.connected) return getServerState();
  if (state.status === "STARTING") {
    // Another caller is starting; wait briefly for readiness.
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      if (state.status === "READY") return getServerState();
      if (["STOPPED", "CRASHED"].includes(state.status)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (state.status === "READY") return getServerState();
  }
  if (state.proc) await stopServer();
  setStatus("STARTING");
  state.executablePath = executablePath;
  state.version = version;
  state.startedAt = new Date().toISOString();
  state.lastError = undefined;
  try {
    const port = await pickFreePort();
    state.port = port;
    const child = spawn(executablePath, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
      env: buildServeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    state.proc = child;
    state.pid = child.pid;
    let stderrTail = "";
    child.stderr?.on("data", (d) => {
      stderrTail = `${stderrTail}${redactSecretsFromText(String(d)).slice(0, 2000)}`.slice(-8000);
    });
    child.stdout?.on("data", () => { /* readiness is probed via /global/health */ });
    child.on("error", (err) => {
      log.warn("serve process error", { error: String(err?.message ?? err).slice(0, 200) });
      if (state.proc === child) markCrashed(`spawn error: ${String(err?.message ?? err).slice(0, 160)}`);
    });
    child.on("exit", (code, signal) => {
      if (state.proc !== child) return; // stale child after stop/restart
      markCrashed(`exit code=${code} signal=${signal ?? "-"} ${stderrTail.slice(-200)}`);
    });
    await waitForHealth();
    setStatus("READY");
    state.restarts = 0;
    syncSubscriptions();
    return getServerState();
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "start failed";
    try { state.proc?.kill("SIGKILL"); } catch { /* noop */ }
    state.proc = null;
    setStatus("CRASHED", { lastError: msg });
    throw new Error(msg);
  }
}

function markCrashed(reason) {
  state.proc = null;
  state.connected = false;
  stopAllSubscribers();
  setStatus("CRASHED", { lastError: String(reason).slice(0, 300) });
  log.warn("opencode serve crashed", { reason: String(reason).slice(0, 200) });
}

export async function stopServer() {
  if (state.status === "STOPPING" || state.status === "STOPPED") return getServerState();
  setStatus("STOPPING");
  stopAllSubscribers();
  const child = state.proc;
  state.proc = null;
  state.connected = false;
  if (child && !child.killed) {
    try {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1500));
      if (!child.killed) child.kill("SIGKILL");
    } catch { /* best effort */ }
  }
  state.port = undefined;
  state.pid = undefined;
  setStatus("STOPPED");
  return getServerState();
}

export function cleanupServerOnQuit() {
  stopAllSubscribers();
  try {
    const child = state.proc;
    state.proc = null;
    if (child && !child.killed) child.kill("SIGTERM");
  } catch { /* noop */ }
}

/* ---------------- SSE subscribers (one per workspace directory) ---------------- */
/* Session events are partitioned by directory server-side: a subscriber only
 * receives events for sessions in its ?directory= scope. A global /event
 * subscription sees plugin/catalog noise but NO session events. */

function stopAllSubscribers() {
  for (const sub of state.subs.values()) {
    try { sub.ctrl.abort(); } catch { /* noop */ }
  }
  state.subs.clear();
  state.connected = false;
}

/**
 * Bind a task to its engine session for live streaming. Called by
 * opencodeService on the live-engine start path (and only there — resumed
 * historical bindings use REST inspection without streaming).
 */
export function bindServerSession(taskId, sessionID, directory) {
  if (typeof taskId !== "string" || !taskId) throw new Error("Invalid task");
  state.bindings.set(taskId, { sessionID: cleanSessionId(sessionID), directory: cleanDirectory(directory) });
  syncSubscriptions();
}

/** Drop a binding (terminal task state, cancel, shutdown). */
export function unbindServerSession(taskId) {
  state.bindings.delete(taskId);
  syncSubscriptions();
}

function boundDirectories() {
  const dirs = new Set();
  for (const b of state.bindings.values()) dirs.add(b.directory);
  return dirs;
}

function syncSubscriptions() {
  if (state.status !== "READY") {
    stopAllSubscribers();
    return;
  }
  const want = state.status === "READY" ? boundDirectories() : new Set();
  const toStop = [];
  for (const [dir, sub] of state.subs.entries()) {
    if (!want.has(dir)) {
      state.subs.delete(dir);
      toStop.push(sub);
    }
  }
  for (const dir of want) {
    if (!state.subs.has(dir)) startDirectorySubscriber(dir);
  }
  updateConnected();
  if (toStop.length) {
    // Abort outside the dispatch stack: a subscriber may be unwound from
    // inside its own frame handler (e.g. session.idle → unbind). Aborting
    // synchronously there rejects the in-flight read while frames are still
    // being processed — defer so the read loop unwinds naturally.
    queueMicrotask(() => {
      for (const sub of toStop) {
        try { sub.ctrl.abort(); } catch { /* noop */ }
      }
    });
  }
}

function updateConnected() {
  const any = [...state.subs.values()].some((s) => s.connected);
  if (any !== state.connected) {
    state.connected = any;
    try { hooks.onConnectionChange(getServerState()); } catch { /* noop */ }
  }
}

function startDirectorySubscriber(directory) {
  const ctrl = new AbortController();
  const sub = { ctrl, task: null, failures: 0, connected: false, firstConnect: true };
  state.subs.set(directory, sub);
  sub.task = void runDirectoryLoop(directory, sub, ctrl.signal).catch((err) => {
    if (!ctrl.signal.aborted) {
      log.warn("directory subscriber ended", { error: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    }
  });
}

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

async function runDirectoryLoop(directory, sub, signal) {
  while (!signal.aborted && state.status === "READY" && state.subs.get(directory) === sub) {
    try {
      await subscribeDirectoryOnce(directory, sub, signal);
      sub.failures = 0;
      if (!signal.aborted && state.status === "READY" && state.subs.get(directory) === sub) {
        // Unexpected EOF while READY: back off and reconnect.
        await reconnectBackoff(sub, "eof");
      }
    } catch (err) {
      if (signal.aborted) break;
      log.warn("SSE disconnected; reconnecting", {
        directory: directory.slice(-60),
        failures: sub.failures,
        error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      });
      await reconnectBackoff(sub, "error");
    }
  }
}

async function reconnectBackoff(sub, _reason) {
  const delay = RECONNECT_DELAYS[Math.min(sub.failures, RECONNECT_DELAYS.length - 1)];
  sub.failures += 1;
  state.reconnects += 1;
  sub.connected = false;
  updateConnected();
  await new Promise((r) => setTimeout(r, delay));
}

async function subscribeDirectoryOnce(directory, sub, signal) {
  const url = `${baseUrl()}/event?directory=${encodeURIComponent(directory)}`;
  const res = await fetch(url, { headers: { Accept: "text/event-stream" }, signal });
  if (!res.ok || !res.body) throw new Error(`SSE subscribe failed: ${res.status}`);
  sub.connected = true;
  updateConnected();
  if (!sub.firstConnect) {
    // A dropped stream came back: ask the owner to resync replace-state
    // (todos/diff/status) — append-type dedupe keys make replay safe.
    try { hooks.onReconnected(); } catch { /* noop */ }
  }
  sub.firstConnect = false;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) break;
      buf += decoder.decode(value, { stream: true });
      // Bound the buffer: SSE frames are small; a pathological peer must not OOM us.
      if (buf.length > 4 * 1024 * 1024) buf = buf.slice(-512 * 1024);
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        handleFrame(frame);
      }
    }
  } finally {
    // cancel() rejects when the stream already errored (e.g. our own deferred
    // abort); await it inside try/catch — a bare call leaks an unhandled
    // rejection that crashes the process under --unhandled-rejections=throw.
    try {
      await reader.cancel();
    } catch { /* already closed/errored */ }
    sub.connected = false;
    updateConnected();
  }
}

/** Parse one SSE frame and dispatch data payloads. Exported for tests. */
export function handleFrame(frame) {
  const lines = String(frame ?? "").split("\n");
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    // `event:` / `id:` / comments are transport metadata — ignored.
  }
  if (!dataLines.length) return;
  const raw = dataLines.join("\n").slice(0, 512 * 1024);
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return; // non-JSON keepalive — ignore
  }
  dispatchServerEvent(evt);
}

/** Route one parsed server event to task hooks. Exported for tests. */
export function dispatchServerEvent(evt) {
  if (!evt || typeof evt.type !== "string") return;
  const props = evt.properties && typeof evt.properties === "object" ? evt.properties : {};
  const sessionID = typeof props.sessionID === "string" ? props.sessionID : undefined;
  if (evt.type === "permission.asked" || evt.type === "permission.v2.asked") {
    try { hooks.onPermissionAsked(evt); } catch { /* hooks never break the loop */ }
    return;
  }
  if (evt.type === "question.asked" || evt.type === "question.v2.asked") {
    try { hooks.onQuestionAsked(evt); } catch { /* hooks never break the loop */ }
    return;
  }
  if (!sessionID) return; // global noise (plugins, catalog) — not task-routable
  // Track user vs assistant message ids so prompt echoes never enter the
  // agent stream (the prompt is already in chat). Bounded per session.
  if (evt.type === "message.updated") {
    const info = props.info && typeof props.info === "object" ? props.info : {};
    if (typeof info.id === "string" && (info.role === "user" || info.role === "assistant")) {
      recordMessageRole(sessionID, info.id, info.role);
    }
  }
  const taskId = hooks.taskIdForSession(sessionID);
  if (!taskId) return; // another client (e.g. user's own TUI) — ignore, never fabricate
  let canonical;
  try {
    canonical = normalizeServerEvents(evt, {
      taskId,
      sessionId: sessionID,
      messageRole: messageRoleForPart(evt),
    });
  } catch {
    return;
  }
  const real = (canonical ?? []).filter((e) => e && typeof e.type === "string");
  if (!real.length) return;
  try {
    hooks.onServerEvents(sessionID, real);
  } catch { /* hooks never break the loop */ }
}

/** sessionID -> Map<messageID, "user"|"assistant"> (bounded, insertion-ordered). */
const messageRoles = new Map();
const MAX_MSG_IDS_PER_SESSION = 200;

function recordMessageRole(sessionID, messageID, role) {
  let m = messageRoles.get(sessionID);
  if (!m) {
    m = new Map();
    messageRoles.set(sessionID, m);
  }
  m.set(messageID, role);
  while (m.size > MAX_MSG_IDS_PER_SESSION) {
    const first = m.keys().next().value;
    m.delete(first);
  }
  if (messageRoles.size > 50) {
    const first = messageRoles.keys().next().value;
    messageRoles.delete(first);
  }
}

/** Resolve the role for part-carrying events (text/reasoning echoes). */
function messageRoleForPart(evt) {
  if (evt.type !== "message.part.updated" && evt.type !== "message.part.delta") return undefined;
  const props = evt.properties && typeof evt.properties === "object" ? evt.properties : {};
  const part = props.part && typeof props.part === "object" ? props.part : null;
  const messageID =
    (part && typeof part.messageID === "string" && part.messageID) ||
    (typeof props.messageID === "string" && props.messageID) ||
    undefined;
  if (!messageID || typeof props.sessionID !== "string") return undefined;
  return messageRoles.get(props.sessionID)?.get(messageID);
}

/* ---------------- test hooks ---------------- */

export const __testHooks = {
  reset() {
    stopAllSubscribers();
    try { state.proc?.kill("SIGKILL"); } catch { /* noop */ }
    state.status = "STOPPED";
    state.port = undefined;
    state.pid = undefined;
    state.startedAt = undefined;
    state.lastError = undefined;
    state.executablePath = undefined;
    state.version = undefined;
    state.connected = false;
    state.bindings.clear();
    messageRoles.clear();
    state.reconnects = 0;
    state.restarts = 0;
    state.proc = null;
    hooks = {
      taskIdForSession: () => undefined,
      onServerEvents: () => {},
      onPermissionAsked: () => {},
      onQuestionAsked: () => {},
      onConnectionChange: () => {},
      onReconnected: () => {},
    };
  },
  setPort(p) { state.port = p; },
  setStatus(s) { state.status = s; },
  bind(taskId, sessionID, directory) { return bindServerSession(taskId, sessionID, directory); },
  subscriptionCount() { return state.subs.size; },
};
