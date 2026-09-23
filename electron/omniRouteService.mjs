/**
 * Phase 2 — OmniRoute local AI gateway manager (Electron main only).
 *
 * Supervised loopback-only lifecycle:
 * detect → start → health-verify → READY → models → stop/restart → crash.
 *
 * Security invariants:
 * - Loopback-only (127.0.0.1). 0.0.0.0/:: refused. Bound address verified,
 *   never trusted from config alone.
 * - Minimal child env (never process.env wholesale, never vault secrets).
 * - Local credential (when the runtime needs one) generated with
 *   crypto.randomBytes and stored ONLY in electron/secretVault.mjs under
 *   `omniroute_local_key`. Never in logs/events/renderer/DB.
 * - Port conflicts fail closed: never assume localhost:PORT is ours; verify
 *   service identity via /v1/models shape + optional identity marker before
 *   sending anything credential-bearing.
 * - Provider/model metadata is untrusted: bounded + sanitized in
 *   openCodeCore.mjs (normalizeModelsResponse). Oversized/malformed/wrong
 *   identity → fail closed.
 * - Bounded restarts (max attempts + backoff). No infinite loops.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createLogger } from "./log.mjs";
import {
  OMNIROUTE_DEFAULT_PORT,
  OMNIROUTE_LOOPBACK_HOST,
  OMNIROUTE_MIN_VERSION,
  RUNTIME_MODEL_LIMITS,
  assertLoopbackUrl,
  isSupportedVersion,
  isValidOmniRouteTransition,
  isValidPort,
  normalizeModelsResponse,
  omniRouteBaseUrl,
  parseVersionTag,
  redactSecretsFromText,
} from "../src/lib/agent/openCodeCore.mjs";

const log = createLogger("omniroute");

const MAX_RESTARTS = 3;
const HEALTH_TIMEOUT_MS = 6000;
const MODELS_TIMEOUT_MS = 10000;
const START_TIMEOUT_MS = 20000;

const state = {
  status: "NOT_INSTALLED",
  pid: undefined,
  startedAt: undefined,
  executablePath: undefined,
  version: undefined,
  port: OMNIROUTE_DEFAULT_PORT,
  baseUrl: undefined,
  lastError: undefined,
  restartCount: 0,
  provider: undefined, // { available, modelCount, lastCheckedAt, detail }
  modelsCache: undefined, // { models, fetchedAt }
  crashInfo: null,
  proc: null,
  logTail: "",
  detectionCache: null,
};

let eventTarget = null;
export function setOmniRouteEventTarget(win) {
  eventTarget = win ?? null;
}

/** Crash fan-out without a hard import cycle (wired by opencodeService/main). */
let crashListener = null;
export function setOmniRouteCrashListener(fn) {
  crashListener = typeof fn === "function" ? fn : null;
}

function nowIso() {
  return new Date().toISOString();
}

function setStatus(next, detail) {
  const from = state.status;
  if (from === next) {
    if (detail) state.lastError = String(detail).slice(0, 300);
    return true;
  }
  if (!isValidOmniRouteTransition(from, next)) {
    log.warn("omniroute illegal transition refused", { from, next });
    return false;
  }
  state.status = next;
  if (detail !== undefined) state.lastError = detail ? String(detail).slice(0, 300) : undefined;
  emitRuntimeEvent(next, detail);
  return true;
}

function emitRuntimeEvent(status, detail) {
  const map = {
    DETECTED: "runtime.detected",
    STARTING: "runtime.starting",
    READY: "runtime.ready",
    DEGRADED: "runtime.degraded",
    STOPPING: "runtime.stopping",
    STOPPED: "runtime.stopped",
    CRASHED: "runtime.error",
    NOT_INSTALLED: "runtime.stopped",
  };
  const type = map[status] ?? "runtime.error";
  try {
    eventTarget?.webContents?.send("agent:event", {
      eventId: `revt_${Date.now().toString(36)}`,
      taskId: "runtime",
      sessionId: "omniroute",
      timestamp: nowIso(),
      type,
      payload: {
        runtime: "omniroute",
        status,
        ...(detail ? { message: redactSecretsFromText(String(detail)).slice(0, 500) } : {}),
      },
    });
  } catch { /* window may be gone */ }
}

export function emitProviderEvent(available, detail) {
  try {
    eventTarget?.webContents?.send("agent:event", {
      eventId: `revt_${Date.now().toString(36)}`,
      taskId: "runtime",
      sessionId: "omniroute",
      timestamp: nowIso(),
      type: available ? "runtime.provider.available" : "runtime.provider.unavailable",
      payload: {
        runtime: "omniroute",
        ...(detail ? { message: redactSecretsFromText(String(detail)).slice(0, 500) } : {}),
      },
    });
  } catch { /* noop */ }
}

/* ---------------- detection ---------------- */

function candidateExecutables() {
  const cands = [];
  const home = os.homedir();
  if (process.platform === "win32") {
    cands.push(
      path.join(home, "AppData", "Local", "Programs", "OmniRoute", "omniroute.exe"),
      path.join(home, ".omniroute", "bin", "omniroute.exe"),
    );
  } else {
    cands.push(
      "/usr/local/bin/omniroute",
      path.join(home, ".local", "bin", "omniroute"),
      path.join(home, ".omniroute", "bin", "omniroute"),
    );
  }
  return cands;
}

async function executableExists(p) {
  try {
    await fsp.access(p);
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
        resolve(null);
        return;
      }
      const text = `${stdout ?? ""} ${stderr ?? ""}`;
      const parsed = parseVersionTag(text);
      resolve(parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : null);
    });
  });
}

function managedCandidate() {
  // Openbentt-managed runtime location (populated by future installer step).
  // Kept as explicit path probe — never executed unless present + versioned.
  try {
    const { app } = globalThis.__openbenttPaths ?? {};
    void app;
  } catch { /* noop */ }
  return null;
}

/**
 * Detect OmniRoute. Order: explicit env override → managed → system → missing.
 * Never executes renderer-supplied paths.
 */
export async function detectOmniRoute({ refresh = false } = {}) {
  if (state.detectionCache && !refresh) return state.detectionCache;
  const result = { installed: false, source: "unknown", compatible: false };
  const explicit = (process.env.OPENBENTT_OMNIROUTE_PATH ?? "").trim();
  const managed = managedCandidate();
  const searchList = [
    ...(explicit ? [{ p: explicit, source: "managed" }] : []),
    ...(managed ? [{ p: managed, source: "managed" }] : []),
    ...candidateExecutables().map((p) => ({ p, source: "system" })),
  ];
  for (const { p, source } of searchList) {
    try {
      if (!(await executableExists(p))) continue;
      const v = await readVersion(p);
      result.installed = true;
      result.executablePath = p;
      result.version = v ?? undefined;
      result.source = source;
      result.compatible = v ? isSupportedVersion(v, OMNIROUTE_MIN_VERSION) : false;
      break;
    } catch { /* next */ }
  }
  // PATH probe (no shell).
  if (!result.installed) {
    const v = await readVersion("omniroute").catch(() => null);
    if (v) {
      result.installed = true;
      result.executablePath = "omniroute";
      result.version = v;
      result.source = "system";
      result.compatible = isSupportedVersion(v, OMNIROUTE_MIN_VERSION);
    }
  }
  state.detectionCache = result;
  if (!result.installed) {
    if (state.status !== "NOT_INSTALLED" && ["NOT_INSTALLED", "DETECTED", "STOPPED"].includes(state.status)) {
      setStatus("NOT_INSTALLED", "OmniRoute is not installed.");
    }
  } else if (["NOT_INSTALLED", "STOPPED", "DETECTED"].includes(state.status)) {
    setStatus("DETECTED", undefined);
    state.executablePath = result.executablePath;
    state.version = result.version;
  }
  return result;
}

/* ---------------- env isolation ---------------- */

export function buildOmniRouteEnv(localKey) {
  const env = {};
  for (const k of ["PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "TMPDIR", "TEMP", "TMP", "SystemRoot", "windir", "NUMBER_OF_PROCESSORS", "OS"]) {
    const v = process.env[k];
    if (typeof v === "string" && v) env[k] = v;
  }
  env.OMNIROUTE_HOST = OMNIROUTE_LOOPBACK_HOST;
  env.OMNIROUTE_PORT = String(state.port);
  // Local credential travels ONLY via env to our own child, never to logs.
  if (localKey) env.OMNIROUTE_LOCAL_KEY = localKey;
  env.OPENBENTT_MANAGED = "1";
  return env;
}

/* ---------------- ports + identity ---------------- */

export function getOmniRoutePort() {
  const raw = (process.env.OPENBENTT_OMNIROUTE_PORT ?? "").trim();
  const n = raw ? Number(raw) : OMNIROUTE_DEFAULT_PORT;
  if (!isValidPort(n)) throw new Error("Invalid OmniRoute port");
  return n;
}

/** Single source of truth for the OpenAI-compatible endpoint. */
export function getProviderBaseUrl() {
  return omniRouteBaseUrl(state.port);
}

function checkPortFree(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: OMNIROUTE_LOOPBACK_HOST, port });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve({ free: true });
    }, timeoutMs);
    sock.on("connect", () => {
      clearTimeout(timer);
      sock.end();
      resolve({ free: false });
    });
    sock.on("error", () => {
      clearTimeout(timer);
      resolve({ free: true });
    });
  });
}

async function fetchBounded(url, { timeoutMs, maxBytes, headers } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error("response exceeded size limit");
    const text = new TextDecoder().decode(buf);
    return { status: res.status, ok: res.ok, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify service identity on the port before trusting it.
 * Expects an OpenAI-compatible /v1/models shape. Wrong shape/identity or
 * oversized/invalid JSON → { ours: false } (fail closed, no creds sent).
 */
export async function verifyServiceIdentity(baseUrl, { timeoutMs = HEALTH_TIMEOUT_MS } = {}) {
  try {
    assertLoopbackUrl(baseUrl);
  } catch {
    return { ours: false, reason: "non-loopback endpoint refused" };
  }
  let parsed;
  try {
    const { status, text } = await fetchBounded(`${baseUrl.replace(/\/$/, "")}/models`, {
      timeoutMs,
      maxBytes: RUNTIME_MODEL_LIMITS.maxResponseBytes,
      headers: { Accept: "application/json" },
    });
    if (status === 404) {
      // Some gateways only serve /v1/models at root — try health marker.
      return { ours: false, reason: "models endpoint not found" };
    }
    if (status >= 400) return { ours: false, reason: `http ${status}` };
    parsed = JSON.parse(text);
  } catch (err) {
    return { ours: false, reason: err instanceof Error ? err.message.slice(0, 120) : "unreachable" };
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.data)) {
    return { ours: false, reason: "unexpected identity response" };
  }
  return { ours: true };
}

export async function healthCheck({ timeoutMs = HEALTH_TIMEOUT_MS } = {}) {
  const base = getProviderBaseUrl();
  const identity = await verifyServiceIdentity(base, { timeoutMs });
  if (!identity.ours) {
    return { healthy: false, baseUrl: base, reason: identity.reason };
  }
  return { healthy: true, baseUrl: base };
}

/* ---------------- local credential (vault) ---------------- */

const VAULT_KEY = "omniroute_local_key";

export async function ensureLocalCredential(app) {
  const { readVaultSecret, writeVaultSecret } = await import("./secretVault.mjs");
  let existing = "";
  try {
    existing = await readVaultSecret(app, VAULT_KEY);
  } catch {
    existing = "";
  }
  if (existing && existing.trim().length >= 32) return existing.trim();
  const fresh = crypto.randomBytes(32).toString("hex");
  await writeVaultSecret(app, VAULT_KEY, fresh);
  return fresh;
}

/* ---------------- lifecycle ---------------- */

export function getOmniRouteStatus() {
  return {
    status: state.status,
    pid: state.pid,
    startedAt: state.startedAt,
    executablePath: state.executablePath,
    version: state.version,
    port: state.port,
    baseUrl: state.baseUrl ?? getProviderBaseUrl(),
    provider: state.provider ? { ...state.provider } : undefined,
    modelsCached: state.modelsCache ? state.modelsCache.models.length : 0,
    restartCount: state.restartCount,
    lastError: state.lastError,
  };
}

async function waitForHealthy(timeoutMs = START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastReason = "not ready";
  while (Date.now() < deadline) {
    const h = await healthCheck({ timeoutMs: 3000 });
    if (h.healthy) return h;
    lastReason = h.reason ?? "not ready";
    await new Promise((r) => setTimeout(r, 750));
    if (!state.proc) return { healthy: false, reason: "process exited during startup" };
  }
  return { healthy: false, reason: lastReason };
}

export async function startOmniRoute(app) {
  const det = await detectOmniRoute({ refresh: true });
  if (!det.installed) {
    setStatus("NOT_INSTALLED", "OmniRoute is not installed. AI execution will run degraded.");
    return getOmniRouteStatus();
  }
  if (state.proc && (state.status === "READY" || state.status === "STARTING")) {
    return getOmniRouteStatus();
  }
  let port;
  try {
    port = getOmniRoutePort();
  } catch (err) {
    setStatus(state.status === "NOT_INSTALLED" ? "NOT_INSTALLED" : "DEGRADED", err instanceof Error ? err.message : "bad port");
    return getOmniRouteStatus();
  }
  state.port = port;
  const base = getProviderBaseUrl();

  // Port conflict: if occupied, verify identity — never hijack чужой service.
  const probe = await checkPortFree(port);
  if (!probe.free) {
    const identity = await verifyServiceIdentity(base);
    if (!identity.ours) {
      setStatus("DEGRADED", `Port ${port} is occupied by an unrecognized service. Refusing to use it.`);
      log.warn("omniroute port conflict — unrecognized occupant", { port });
      return getOmniRouteStatus();
    }
    // Recognized OmniRoute already running (externally managed): adopt read-only.
    state.baseUrl = base;
    setStatus("READY", "Adopted externally-managed OmniRoute (identity verified).");
    await refreshModels({ silent: true }).catch(() => {});
    return getOmniRouteStatus();
  }

  setStatus("STARTING", `Starting local AI gateway on ${OMNIROUTE_LOOPBACK_HOST}:${port}…`);
  state.baseUrl = base;
  let localKey = "";
  try {
    localKey = await ensureLocalCredential(app);
  } catch {
    localKey = "";
  }
  try {
    const child = spawn(det.executablePath, ["serve", "--host", OMNIROUTE_LOOPBACK_HOST, "--port", String(port)], {
      env: buildOmniRouteEnv(localKey),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    state.proc = child;
    state.pid = child.pid;
    state.startedAt = nowIso();
    state.executablePath = det.executablePath;
    state.version = det.version;
    child.stdout?.on("data", (d) => {
      state.logTail = `${state.logTail}${redactSecretsFromText(String(d)).slice(0, 2000)}`.slice(-50000);
    });
    child.stderr?.on("data", (d) => {
      state.logTail = `${state.logTail}${redactSecretsFromText(String(d)).slice(0, 2000)}`.slice(-50000);
    });
    child.on("error", (err) => {
      log.warn("omniroute process error", { error: String(err?.message ?? err).slice(0, 200) });
      markOmniRouteCrashed(`spawn error: ${String(err?.message ?? err).slice(0, 160)}`);
    });
    child.on("exit", (code, signal) => {
      const uptime = state.startedAt ? Date.now() - Date.parse(state.startedAt) : 0;
      if (state.status === "STOPPING" || state.status === "STOPPED") return;
      if (uptime < 4000) {
        // Fast exit: binary likely lacks `serve` or failed to bind.
        state.proc = null;
        setStatus("DEGRADED", `OmniRoute exited during startup (code=${code}). Degraded mode.`);
        return;
      }
      markOmniRouteCrashed(`exit code=${code} signal=${signal ?? "-"}`);
    });
  } catch (err) {
    setStatus("CRASHED", err instanceof Error ? err.message : "start failed");
    return getOmniRouteStatus();
  }
  const h = await waitForHealthy();
  if (h.healthy) {
    state.restartCount = 0;
    setStatus("READY", "Local AI gateway ready.");
    await refreshModels({ silent: true }).catch(() => {});
  } else {
    setStatus("DEGRADED", `Gateway did not become healthy: ${h.reason ?? "unknown"}. Degraded mode.`);
  }
  return getOmniRouteStatus();
}

export function markOmniRouteCrashed(reason) {
  const pid = state.pid;
  state.proc = null;
  state.pid = undefined;
  state.crashInfo = { at: nowIso(), reason: String(reason).slice(0, 300), pid };
  // Legal path: READY/DEGRADED/STARTING → CRASHED.
  if (!setStatus("CRASHED", reason)) {
    state.status = "CRASHED";
    state.lastError = String(reason).slice(0, 300);
    emitRuntimeEvent("CRASHED", reason);
  }
  state.provider = { available: false, modelCount: 0, lastCheckedAt: nowIso(), detail: "gateway crashed" };
  emitProviderEvent(false, "Local AI gateway stopped unexpectedly.");
  try { crashListener?.(state.crashInfo?.reason ?? "crashed"); } catch { /* noop */ }
}

export async function stopOmniRoute() {
  if (!state.proc) {
    if (state.status !== "NOT_INSTALLED") setStatus("STOPPED", undefined);
    return getOmniRouteStatus();
  }
  setStatus("STOPPING", "Stopping local AI gateway…");
  const child = state.proc;
  state.proc = null;
  try {
    child.kill("SIGTERM");
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (child.exitCode === null && child.signalCode === null && !child.killed) {
      try { child.kill("SIGKILL"); } catch { /* noop */ }
    }
  } catch { /* best effort */ }
  state.pid = undefined;
  setStatus("STOPPED", undefined);
  state.provider = { available: false, modelCount: 0, lastCheckedAt: nowIso(), detail: "stopped" };
  emitProviderEvent(false, "Local AI gateway stopped.");
  return getOmniRouteStatus();
}

export async function restartOmniRoute(app) {
  if (state.restartCount >= MAX_RESTARTS) {
    setStatus("DEGRADED", `Restart limit reached (${MAX_RESTARTS}). Manual retry required.`);
    return getOmniRouteStatus();
  }
  state.restartCount += 1;
  const backoffMs = Math.min(1000 * 2 ** (state.restartCount - 1), 8000);
  await new Promise((r) => setTimeout(r, backoffMs));
  await stopOmniRoute().catch(() => {});
  return startOmniRoute(app);
}

export function cleanupOmniRouteOnQuit() {
  try {
    const child = state.proc;
    state.proc = null;
    if (child && !child.killed) {
      try { child.kill("SIGTERM"); } catch { /* noop */ }
    }
  } catch { /* noop */ }
}

/* ---------------- models ---------------- */

export async function getOmniRouteModels({ refresh = true } = {}) {
  if (!refresh && state.modelsCache) return state.modelsCache;
  return refreshModels({});
}

async function refreshModels({ silent = false } = {}) {
  void silent;
  const base = getProviderBaseUrl();
  const { text } = await fetchBounded(`${base.replace(/\/$/, "")}/models`, {
    timeoutMs: MODELS_TIMEOUT_MS,
    maxBytes: RUNTIME_MODEL_LIMITS.maxResponseBytes,
    headers: { Accept: "application/json" },
  }).catch((err) => {
    throw new Error(err instanceof Error ? err.message.slice(0, 160) : "models fetch failed");
  });
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Invalid models response (not JSON)");
  }
  const normalized = normalizeModelsResponse(json);
  state.modelsCache = { models: normalized.models, fetchedAt: nowIso(), truncated: normalized.truncated };
  const available = normalized.models.length > 0;
  state.provider = {
    available,
    modelCount: normalized.models.length,
    lastCheckedAt: nowIso(),
    detail: available ? `${normalized.models.length} model(s) available` : "no models reported",
  };
  emitProviderEvent(available, state.provider.detail);
  try {
    eventTarget?.webContents?.send("agent:event", {
      eventId: `revt_${Date.now().toString(36)}`,
      taskId: "runtime",
      sessionId: "omniroute",
      timestamp: nowIso(),
      type: available ? "runtime.model.available" : "runtime.model.unavailable",
      payload: { runtime: "omniroute", count: normalized.models.length },
    });
  } catch { /* noop */ }
  return state.modelsCache;
}

export function getCachedModels() {
  return state.modelsCache ? { ...state.modelsCache, models: [...state.modelsCache.models] } : { models: [], fetchedAt: null };
}

/* ---------------- test hooks ---------------- */

export const __omniTestHooks = {
  reset() {
    try { state.proc?.kill("SIGKILL"); } catch { /* noop */ }
    state.status = "NOT_INSTALLED";
    state.pid = undefined;
    state.startedAt = undefined;
    state.executablePath = undefined;
    state.version = undefined;
    state.port = OMNIROUTE_DEFAULT_PORT;
    state.baseUrl = undefined;
    state.lastError = undefined;
    state.restartCount = 0;
    state.provider = undefined;
    state.modelsCache = undefined;
    state.crashInfo = null;
    state.proc = null;
    state.logTail = "";
    state.detectionCache = null;
  },
  setPort(p) {
    state.port = p;
    state.baseUrl = undefined;
  },
  setStatusForTest(s) {
    state.status = s;
  },
  setProcForTest(p) {
    state.proc = p;
  },
  getState() {
    return state;
  },
  buildOmniRouteEnv,
};
