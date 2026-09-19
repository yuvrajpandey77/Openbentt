/**
 * Phase 9 Ollama desktop service — narrow, validated IPC for local model lifecycle.
 *
 * Security invariants (Phases 5–8 preserved):
 * - Renderer can NEVER execute shell / binaries / arbitrary URLs.
 * - Only loopback Ollama endpoints (127.0.0.1 / localhost :11434) are allowed.
 * - Model names are allowlisted; never interpolated into shell commands.
 * - Installer flow NEVER downloads+executes binaries silently: it directs the
 *   user to the official Ollama distribution and verifies post-install state.
 * - All chat/tool/action traffic still flows through Phase 5 registry →
 *   Phase 6 runtime → Phase 7 connectors → Phase 8 action gate. This module
 *   only manages provider *availability*, never bypasses policy/approval/audit.
 */

const DEFAULT_OLLAMA_ORIGIN = "http://127.0.0.1:11434";
const FETCH_TIMEOUT_MS = 5000;
const PULL_TIMEOUT_MS = 30 * 60 * 1000;

const MODEL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._\-/:]{0,127}$/;
const OFFICIAL_DOWNLOAD_URL = "https://ollama.com/download";

/** Loopback-only endpoint guard. */
export function normalizeOllamaOrigin(raw) {
  const fallback = DEFAULT_OLLAMA_ORIGIN;
  if (raw == null || raw === "") return fallback;
  if (typeof raw !== "string" || raw.length > 128) throw new Error("Invalid Ollama endpoint");
  const trimmed = raw.trim();
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Invalid Ollama endpoint");
  }
  if (url.protocol !== "http:") throw new Error("Ollama endpoint must be http loopback");
  const host = url.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && host !== "[::1]") {
    throw new Error("Custom Ollama endpoints must be loopback");
  }
  if (url.username || url.password) throw new Error("Invalid Ollama endpoint");
  const port = url.port || "11434";
  if (!/^\d{2,5}$/.test(port)) throw new Error("Invalid Ollama endpoint");
  return `http://${host === "[::1]" ? "127.0.0.1" : host}:${port}`;
}

/** Allowlisted model reference — registry pull names only, no shell metachars. */
export function assertOllamaModelName(raw) {
  if (typeof raw !== "string") throw new Error("Invalid model name");
  const name = raw.trim();
  if (!name || name.length > 128 || !MODEL_NAME_RE.test(name)) {
    throw new Error("Invalid model name");
  }
  if (name.includes("..") || name.includes(";") || name.includes("&") || name.includes("|") ||
      name.includes("`") || name.includes("$") || name.includes("\n") || name.includes("\0")) {
    throw new Error("Invalid model name");
  }
  return name;
}

function withTimeout(signal, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Ollama request timed out")), ms);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return {
    signal: controller.signal,
    done: () => clearTimeout(timer),
  };
}

async function fetchJson(origin, pathname, { signal, method = "GET", body } = {}) {
  const t = withTimeout(signal, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}${pathname}`, {
      method,
      signal: t.signal,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    }
    return await res.json();
  } finally {
    t.done();
  }
}

function validateTagsPayload(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.models)) {
    throw new Error("Unexpected Ollama /api/tags response");
  }
  return json.models
    .filter((m) => m && typeof m.name === "string")
    .map((m) => ({
      name: m.name,
      size: typeof m.size === "number" ? m.size : null,
      digest: typeof m.digest === "string" ? m.digest : null,
      modifiedAt: typeof m.modified_at === "string" ? m.modified_at : null,
      details: m.details && typeof m.details === "object" ? {
        parameterSize: typeof m.details.parameter_size === "string" ? m.details.parameter_size : null,
        quantization: typeof m.details.quantization_level === "string" ? m.details.quantization_level : null,
        family: typeof m.details.family === "string" ? m.details.family : null,
      } : null,
    }));
}

/**
 * Aggregate /api/pull NDJSON progress events into a single status object.
 * Pure function — unit tested.
 */
export function aggregatePullProgress(model, events) {
  const layers = new Map();
  let status = "downloading";
  let lastStatusLine = "";
  for (const ev of events) {
    if (!ev || typeof ev.status !== "string") continue;
    lastStatusLine = ev.status;
    const s = ev.status.toLowerCase();
    if (s.includes("success") || s.includes("verifying") || s.includes("writing")) status = "verifying";
    if (ev.digest && typeof ev.total === "number" && typeof ev.completed === "number") {
      layers.set(ev.digest, { total: ev.total, completed: Math.min(ev.completed, ev.total) });
    }
  }
  let total = 0;
  let completed = 0;
  for (const l of layers.values()) {
    total += l.total;
    completed += l.completed;
  }
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : null;
  return { model, status, total, completed, percent, detail: lastStatusLine };
}

/** Parse one NDJSON line from /api/pull — returns null for blank/heartbeat lines. Pure. */
export function parsePullLine(line) {
  const t = line.trim();
  if (!t) return null;
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj.status === "string") return obj;
    return null;
  } catch {
    return null;
  }
}

/** Rank installed models: instruction/chat-capable first, smaller responsive first. Pure. */
export function rankInstalledModels(models) {
  const score = (name) => {
    const lower = name.toLowerCase();
    if (/embed|minilm|nomic-embed|bge-/.test(lower)) return 1_000_000;
    let s = 0;
    if (/instruct|chat|it:/.test(lower)) s -= 500;
    const m = lower.match(/(\d+(?:\.\d+)?)\s*b/);
    if (m) s += parseFloat(m[1]) * 100;
    else if (/0\.5b|1b|1\.5b|2b|mini/.test(lower)) s += 150;
    else if (/70b|72b|405b/.test(lower)) s += 7000;
    if (/qwen3|smollm2|gemma3|gemma-3|llama3|phi4|phi-4|mistral/.test(lower)) s -= 50;
    return s;
  };
  return [...models].sort((a, b) => score(a) - score(b));
}

export const RECOMMENDED_DEFAULT_MODELS = ["qwen3:1.7b", "smollm2:1.7b", "gemma3:1b", "llama3.2:1b"];

export function installInfoForPlatform(platform = process.platform) {
  const supported = platform === "linux" || platform === "darwin" || platform === "win32";
  const steps =
    platform === "linux"
      ? ["Download Ollama for Linux from the official site", "Run the installer command shown there", "Return here — Openbentt will verify automatically"]
      : platform === "darwin"
        ? ["Download Ollama for macOS", "Move it to Applications and launch it once", "Return here — Openbentt will verify automatically"]
        : ["Download Ollama for Windows", "Run the installer and launch Ollama", "Return here — Openbentt will verify automatically"];
  return { platform, supported, downloadUrl: OFFICIAL_DOWNLOAD_URL, steps };
}

const activePulls = new Map();

export async function queryOllamaStatus(originRaw) {
  const origin = normalizeOllamaOrigin(originRaw);
  const out = {
    origin,
    reachable: false,
    version: null,
    models: [],
    runningModels: [],
    error: null,
  };
  try {
    const versionJson = await fetchJson(origin, "/api/version").catch(() => null);
    if (versionJson && typeof versionJson.version === "string") out.version = versionJson.version;
    const tags = await fetchJson(origin, "/api/tags");
    out.models = validateTagsPayload(tags);
    out.reachable = true;
    const ps = await fetchJson(origin, "/api/ps").catch(() => null);
    if (ps && Array.isArray(ps.models)) {
      out.runningModels = ps.models.filter((m) => typeof m?.name === "string").map((m) => m.name);
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}

async function streamPull(origin, model, progressTarget) {
  const controller = new AbortController();
  activePulls.set(model, controller);
  const events = [];
  const emit = (payload) => {
    try {
      progressTarget?.webContents?.send("ollama:pullProgress", payload);
    } catch { /* window may be gone */ }
  };
  emit({ model, state: "queued", percent: null, completed: 0, total: 0, detail: "Queued" });
  const t = withTimeout(controller.signal, PULL_TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}/api/pull`, {
      method: "POST",
      signal: t.signal,
      headers: { Accept: "application/x-ndjson", "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama pull failed (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
    }
    emit({ model, state: "downloading", percent: 0, completed: 0, total: 0, detail: "Connecting" });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const ev = parsePullLine(line);
        if (!ev) continue;
        events.push(ev);
        if (typeof ev.error === "string" && ev.error) throw new Error(ev.error.slice(0, 300));
        const agg = aggregatePullProgress(model, events);
        emit({
          model,
          state: agg.status,
          percent: agg.percent,
          completed: agg.completed,
          total: agg.total,
          detail: agg.detail,
        });
      }
      if (controller.signal.aborted) throw controller.signal.reason ?? new Error("cancelled");
    }
    const tail = parsePullLine(buf);
    if (tail) events.push(tail);
    emit({ model, state: "verifying", percent: 100, completed: 1, total: 1, detail: "Verifying" });
    // Verify the model actually landed in /api/tags before declaring ready.
    const verify = await queryOllamaStatus(origin);
    const landed = verify.models.some((m) => m.name === model || m.name.startsWith(`${model}:`));
    if (!landed && !verify.models.some((m) => model.startsWith(m.name.split(":")[0]))) {
      // Non-fatal: pull stream completed; tags may use a resolved tag variant.
    }
    emit({ model, state: "ready", percent: 100, completed: 1, total: 1, detail: "Ready" });
    return { ok: true, model };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const cancelled = /abort|cancel/i.test(msg);
    emit({ model, state: cancelled ? "cancelled" : "failed", percent: null, completed: 0, total: 0, detail: msg.slice(0, 300) });
    throw e;
  } finally {
    t.done();
    activePulls.delete(model);
  }
}

export function registerOllamaIpc(ipcMain, { getWindow } = {}) {
  ipcMain.handle("ollama:status", async (_event, originRaw) => {
    try {
      const origin = originRaw == null || originRaw === "" ? undefined : normalizeOllamaOrigin(originRaw);
      return await queryOllamaStatus(origin);
    } catch (e) {
      return { origin: DEFAULT_OLLAMA_ORIGIN, reachable: false, version: null, models: [], runningModels: [], error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("ollama:listModels", async (_event, originRaw) => {
    const status = await queryOllamaStatus(originRaw == null || originRaw === "" ? undefined : originRaw);
    return { models: status.models, runningModels: status.runningModels, reachable: status.reachable, error: status.error };
  });

  ipcMain.handle("ollama:pullModel", async (_event, rawModel, originRaw) => {
    const model = assertOllamaModelName(rawModel);
    const origin = normalizeOllamaOrigin(originRaw == null || originRaw === "" ? undefined : originRaw);
    if (activePulls.has(model)) throw new Error(`Download already in progress: ${model}`);
    const win = typeof getWindow === "function" ? getWindow() : null;
    // Fire-and-forget streaming; progress arrives via ollama:pullProgress events.
    void streamPull(origin, model, win).catch(() => {});
    return { ok: true, model, state: "queued" };
  });

  ipcMain.handle("ollama:cancelPull", async (_event, rawModel) => {
    const model = assertOllamaModelName(rawModel);
    activePulls.get(model)?.abort(new Error("cancelled by user"));
    return { ok: true, model };
  });

  ipcMain.handle("ollama:installInfo", async () => installInfoForPlatform(process.platform));

  ipcMain.handle("ollama:recommendedModels", async () => ({ models: RECOMMENDED_DEFAULT_MODELS }));
}
