/**
 * Openbentt long-running stability / memory soak harness (Phase D).
 *
 * Launches the real built Electron app with an isolated --user-data-dir under
 * /tmp/opencode, attaches over CDP, and repeats a fixed workload: Chat <-> Notebook
 * navigation, synthetic long conversations, PDF-heavy notebook content, provider
 * switches, safe model/service status calls, safe tool executions, idle periods,
 * and finally a graceful shutdown + restart on the same profile.
 *
 * Samples /proc (RSS, CPU, process tree) and CDP Performance/Memory/Runtime
 * metrics (JS heap, DOM nodes, listeners), takes explicit GC checkpoints with
 * HeapProfiler.collectGarbage, and writes a JSON report.
 *
 * Environment:
 *   OPENBENTT_ENDURANCE_MS       total budget in ms (default 2h = 7200000)
 *   OPENBENTT_ENDURANCE_OUT      JSON output path (default /tmp/opencode/endurance.json)
 *   OPENBENTT_ENDURANCE_SAMPLE_MS sampling interval (default 30000)
 *   OPENBENTT_ENDURANCE_IDLE_MS  idle time per cycle (default 12000)
 *   OPENBENTT_ENDURANCE_PDF_DIR  directory searched for PDF fixtures (default docs/)
 *   OPENBENTT_ENDURANCE_ALLOW_ENSURE=1  opt in to runtime ensure paths (spawns helpers)
 *   OPENBENTT_ENDURANCE_IPC_TRACE=1     opt in to a short CDP IPC tracing window
 *
 * Usage:
 *   node scripts/perf/endurance.mjs
 *   OPENBENTT_ENDURANCE_MS=180000 OPENBENTT_ENDURANCE_OUT=/tmp/opencode/endurance-smoke.json \
 *     node scripts/perf/endurance.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { chromium } from "playwright-core";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tmpRoot = "/tmp/opencode";
const profile = path.join(tmpRoot, `obt-endurance-${process.pid}`);
const output = path.resolve(process.env.OPENBENTT_ENDURANCE_OUT ?? path.join(tmpRoot, "endurance.json"));
const durationMs = Number(process.env.OPENBENTT_ENDURANCE_MS ?? 7200000);
const sampleMs = Math.max(1000, Number(process.env.OPENBENTT_ENDURANCE_SAMPLE_MS ?? 30000));
const idleMs = Math.max(0, Number(process.env.OPENBENTT_ENDURANCE_IDLE_MS ?? 12000));
const pdfDir = path.resolve(process.env.OPENBENTT_ENDURANCE_PDF_DIR ?? path.join(appRoot, "docs"));
const allowEnsure = process.env.OPENBENTT_ENDURANCE_ALLOW_ENSURE === "1";
const ipcTraceEnabled = process.env.OPENBENTT_ENDURANCE_IPC_TRACE === "1";
const port = 9500 + (process.pid % 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Hard timeout for every CDP send: a hung renderer must not stall the harness. */
async function withTimeout(promise, ms, label, s = null) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms); }),
    ]);
  } catch (e) {
    if (String(e).includes("timeout after") && s) {
      event("cdp-timeout", { label, message: String(e).slice(0, 200), session: s.index });
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function cdpSend(s, method, params = {}, timeoutMs = 12000) {
  if (!s?.cdp) throw new Error("renderer CDP session unavailable");
  return withTimeout(s.cdp.send(method, params), timeoutMs, method, s);
}
const MB = 1048576;
const round = (n) => (Number.isFinite(n) ? +n.toFixed(2) : null);
const t0 = Date.now();
const now = () => Date.now() - t0;

fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(path.dirname(output), { recursive: true });

const cpuPrev = new Map();
let lastProcSampleAt = t0;
let sampling = false;

const report = {
  schema: 1,
  harness: "scripts/perf/endurance.mjs",
  startedAt: new Date(t0).toISOString(),
  config: {
    durationMs, sampleMs, idleMs, pdfDir, allowEnsure, ipcTraceEnabled,
    profile, output, port, appRoot,
  },
  environment: {
    platform: process.platform,
    node: process.version,
    linuxProcSampling: process.platform === "linux",
    cpuPercentAssumes100HzTicks: process.platform === "linux",
  },
  status: "running",
  sessions: [],
  phases: [],
  samples: [],
  checkpoints: [],
  events: [],
  ipc: {
    harnessCalls: {},
    rendererBridgeWrappers: null,
    rendererBridgeCalls: {},
    tracing: null,
    note: "harnessCalls counts explicit bridge IPC invocations made by this script. " +
      "rendererBridgeCalls counts wrapped renderer bridge methods when the contextBridge object allows patching.",
  },
  interpretation: null,
};

function event(kind, detail = {}) {
  report.events.push({ tMs: now(), kind, ...detail });
}

function phase(name, detail = {}) {
  report.phases.push({ tMs: now(), name, ...detail });
}

function countHarnessCall(name) {
  report.ipc.harnessCalls[name] = (report.ipc.harnessCalls[name] ?? 0) + 1;
}

/** Call a renderer-side bridge method through CDP, counting each IPC invoke. */
async function bridge(s, namespace, method, ...args) {
  const callName = `${namespace}.${method}`;
  countHarnessCall(callName);
  const expr = `(async () => {
    const ns = window[${JSON.stringify(namespace)}];
    if (!ns || typeof ns[${JSON.stringify(method)}] !== "function") return { ok: false, error: "bridge method unavailable" };
    try {
      const value = await ns[${JSON.stringify(method)}](...${JSON.stringify(args)});
      const summary = value && typeof value === "object"
        ? { type: "object", keys: Object.keys(value).slice(0, 12) }
        : typeof value === "string"
          ? { type: "string", stringLength: value.length, value: value.slice(0, 160) }
          : { type: typeof value, value: String(value).slice(0, 160) };
      return { ok: true, summary };
    } catch (e) { return { ok: false, error: String(e?.message ?? e).slice(0, 240) }; }
  })()`;
  const res = await cdpSend(s, "Runtime.evaluate", {
    expression: expr, awaitPromise: true, returnByValue: true, timeout: 8000,
  }, 10000).catch((e) => ({ exceptionDetails: { text: String(e).slice(0, 240) } }));
  if (res?.exceptionDetails) {
    return { ok: false, error: res.exceptionDetails.text ?? "Runtime.evaluate failed" };
  }
  return res?.result?.value ?? { ok: false, error: "no CDP result" };
}

/** Aggregate /proc RSS/CPU for the app process and all descendants. */
function procTree(rootPid) {
  if (process.platform !== "linux" || !rootPid) return null;
  const all = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
      const ppid = Number(fields[1]);
      const ticks = Number(fields[11]) + Number(fields[12]);
      const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      const rssKb = Number(/VmRSS:\s*(\d+)/.exec(status)?.[1] ?? 0);
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
      let type = "main";
      if (cmd.includes("--type=renderer")) type = "renderer";
      else if (cmd.includes("--type=gpu-process")) type = "gpu";
      else if (cmd.includes("--type=utility")) type = "utility";
      else if (cmd.includes("--type=")) type = cmd.match(/--type=(\S+)/)[1];
      all.push({ pid, ppid, ticks, rssMb: rssKb / 1024, type });
    } catch { /* process exited while sampling */ }
  }

  const previous = cpuPrev;
  const seen = new Set();
  const out = [];
  const queue = [rootPid];
  const intervalSec = Math.max(0.1, (Date.now() - lastProcSampleAt) / 1000);
  while (queue.length) {
    const pid = queue.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const p = all.find((x) => x.pid === pid);
    if (!p) continue;
    const prev = previous.get(pid);
    const cpuPct = prev ? round(((p.ticks - prev.ticks) / 100 / intervalSec) * 100) : null;
    previous.set(pid, { ticks: p.ticks });
    out.push({ pid, type: p.type, rssMb: round(p.rssMb), cpuPct });
    queue.push(...all.filter((x) => x.ppid === pid).map((x) => x.pid));
  }
  lastProcSampleAt = Date.now();
  const byType = (t) => out.filter((p) => p.type === t);
  return {
    totalRssMb: round(out.reduce((a, p) => a + p.rssMb, 0)),
    mainRssMb: round(byType("main").reduce((a, p) => a + p.rssMb, 0)),
    rendererRssMb: round(byType("renderer").reduce((a, p) => a + p.rssMb, 0)),
    gpuRssMb: round(byType("gpu").reduce((a, p) => a + p.rssMb, 0)),
    rendererCount: byType("renderer").length,
    gpuCount: byType("gpu").length,
    childCount: Math.max(0, out.length - 1),
    processCount: out.length,
    cpuPctTotal: round(out.reduce((a, p) => a + (p.cpuPct ?? 0), 0)),
    procs: out,
  };
}

/** Renderer-side CDP metrics: heap, DOM, listeners, CPU task duration. */
async function rendererMetrics(s) {
  const out = { available: false };
  try {
    const metrics = await cdpSend(s, "Performance.getMetrics");
    out.metrics = Object.fromEntries(metrics.metrics.map((m) => [m.name, round(m.value)]));
    out.jsHeapUsedMb = round((out.metrics.JSHeapUsedSize ?? 0) / MB);
    out.jsHeapTotalMb = round((out.metrics.JSHeapTotalSize ?? 0) / MB);
    out.cpuTaskDurationSec = round(out.metrics.TaskDuration ?? 0);
    out.scriptDurationSec = round(out.metrics.ScriptDuration ?? 0);
  } catch (e) { out.performanceError = String(e).slice(0, 200); }
  try {
    const dom = await cdpSend(s, "Memory.getDOMCounters");
    out.domCounters = dom;
    out.domNodes = dom.nodes ?? null;
    out.eventListeners = dom.jsEventListeners ?? out.metrics?.JSEventListeners ?? null;
    out.documents = dom.documents ?? null;
  } catch (e) { out.domError = String(e).slice(0, 200); }
  try {
    const heap = await cdpSend(s, "Runtime.getHeapUsage");
    out.heapUsageMb = round(heap.usedSize / MB);
    out.heapCapacityMb = round(heap.totalSize / MB);
  } catch (e) { out.heapError = String(e).slice(0, 200); }
  try {
    const res = await cdpSend(s, "Runtime.evaluate", {
      expression: `performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      } : null`,
      returnByValue: true,
    });
    out.performanceMemory = res?.result?.value ?? null;
  } catch { /* optional */ }
  out.available = Boolean(out.metrics || out.domCounters || out.heapUsageMb);
  return out;
}

/** Browser-wide process info from CDP when supported (used for external/native memory). */
async function browserProcessInfo(s) {
  if (!s?.browserCdp) return null;
  try {
    const info = await withTimeout(s.browserCdp.send("SystemInfo.getProcessInfo"), 8000, "SystemInfo.getProcessInfo", s);
    return {
      available: true,
      processes: (info.processInfo ?? []).map((p) => ({
        id: p.id, type: p.type, cpuTimeSec: round(p.cpuTime ?? 0),
        instantaneousCpuUsage: p.instantaneousCpuUsage ?? null,
        memory: p.memory ?? null,
      })),
    };
  } catch (e) {
    return { available: false, error: String(e).slice(0, 200) };
  }
}

async function takeSample(s, label) {
  if (!s || sampling) return null;
  sampling = true;
  try {
    const procs = procTree(s.child?.pid);
    const renderer = s.page && !s.page.isClosed() && !s.broken ? await rendererMetrics(s) : null;
    const browserInfo = await browserProcessInfo(s);
    const jsHeapUsedMb = renderer?.jsHeapUsedMb ?? null;
    const rendererRssMb = procs?.rendererRssMb ?? null;
    const sample = {
      tMs: now(), label,
      procs, renderer,
      browserProcessInfo: browserInfo,
      // Honest proxy: renderer RSS minus V8 used heap. Includes native bindings,
      // PDF/worker memory and caches; NOT V8's external memory statistic.
      externalMemoryProxyMb:
        jsHeapUsedMb !== null && rendererRssMb !== null ? round(Math.max(0, rendererRssMb - jsHeapUsedMb)) : null,
      ipcHarnessCalls: { ...report.ipc.harnessCalls },
    };
    report.samples.push(sample);
    return sample;
  } catch (e) {
    event("sample-error", { label, message: String(e).slice(0, 300) });
    return null;
  } finally {
    sampling = false;
  }
}

/** Best-effort wrapping of renderer bridge methods to count IPC traffic. */
async function instrumentRendererBridge(s) {
  try {
    const res = await cdpSend(s, "Runtime.evaluate", {
      expression: `(() => {
        const names = ["openbenttDesktop", "openbenttAgent", "openbenttOllama", "openbenttResearch",
          "openbenttZotero", "openbenttLocalGguf", "openbenttNarration", "openbenttSecrets"];
        const out = { wrapped: [], unwrappable: [], frozen: [], counts: {} };
        window.__enduranceIpcCounts = out.counts;
        for (const nsName of names) {
          const ns = window[nsName];
          if (!ns) continue;
          if (Object.isFrozen(ns)) { out.frozen.push(nsName); continue; }
          for (const key of Object.keys(ns)) {
            if (typeof ns[key] !== "function") continue;
            const desc = Object.getOwnPropertyDescriptor(ns, key);
            if (!desc || desc.writable === false || !("value" in desc)) {
              out.unwrappable.push(nsName + "." + key);
              continue;
            }
            const name = nsName + "." + key;
            const original = ns[key];
            try {
              Object.defineProperty(ns, key, { ...desc, value: function (...args) {
                out.counts[name] = (out.counts[name] ?? 0) + 1;
                return original.apply(this, args);
              } });
              out.wrapped.push(name);
            } catch { out.unwrappable.push(name); }
          }
        }
        return { wrapped: out.wrapped.length, unwrapped: out.unwrappable.length, frozen: out.frozen, names: out.wrapped };
      })()`,
      returnByValue: true,
    });
    report.ipc.rendererBridgeWrappers = res?.result?.value ?? null;
  } catch (e) {
    report.ipc.rendererBridgeWrappers = { error: String(e).slice(0, 240) };
  }
}

async function collectRendererBridgeCounts(s) {
  if (!report.ipc.rendererBridgeWrappers?.wrapped) return;
  try {
    const res = await cdpSend(s, "Runtime.evaluate", {
      expression: `JSON.parse(JSON.stringify(window.__enduranceIpcCounts ?? {}))`,
      returnByValue: true,
    });
    if (res?.result?.value) report.ipc.rendererBridgeCalls = res.result.value;
  } catch { /* optional */ }
}

/** One short CDP tracing window, counting IPC trace events by name. */
async function traceIpcWindow(s, durationMsTrace = 4000) {
  if (!ipcTraceEnabled || !s.browserCdp || report.ipc.tracing) return;
  const counts = {};
  let total = 0;
  let done = false;
  const onData = ({ value }) => {
    for (const ev of value ?? []) {
      if (typeof ev.name !== "string" || !/ipc|mojo/i.test(ev.name)) continue;
      total += 1;
      counts[ev.name] = (counts[ev.name] ?? 0) + 1;
    }
  };
  try {
    s.browserCdp.on("Tracing.dataCollected", onData);
    s.browserCdp.on("Tracing.tracingComplete", () => { done = true; });
    await withTimeout(s.browserCdp.send("Tracing.start", {
      categories: "ipc,disabled-by-default-ipc.call,toplevel",
      options: "record-as-much-as-possible",
      transferMode: "ReportEvents",
    }), 8000, "Tracing.start", s);
    await sleep(durationMsTrace);
    await withTimeout(s.browserCdp.send("Tracing.end"), 8000, "Tracing.end", s);
    for (let i = 0; i < 40 && !done; i++) await sleep(100);
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
    report.ipc.tracing = { enabled: true, durationMs: durationMsTrace, totalIpcEvents: total, topEvents: top };
  } catch (e) {
    report.ipc.tracing = { enabled: true, error: String(e).slice(0, 240), totalIpcEvents: total };
  } finally {
    s.browserCdp.off("Tracing.dataCollected", onData);
  }
}

async function launchSession(index, freshProfile = false) {
  const useProfile = freshProfile ? `${profile}-restart-${index}` : profile;
  const sessionPort = port + index * 7;
  const logFile = path.join(tmpRoot, `obt-endurance-${process.pid}-s${index}.log`);
  const log = fs.openSync(logFile, "w");
  const child = spawn(
    electron,
    [
      ".",
      `--remote-debugging-port=${sessionPort}`,
      `--user-data-dir=${useProfile}`,
      "--no-first-run",
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--enable-software-rasterizer",
      "--disable-dev-shm-usage",
    ],
    { cwd: appRoot, stdio: ["ignore", log, log], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" } }
  );
  const s = {
    index, child, log, logFile, profile: useProfile, broken: false, exited: null,
    browser: null, context: null, page: null, cdp: null, browserCdp: null,
  };
  child.on("exit", (code, signal) => {
    s.exited = { code, signal, atMs: now() };
    event("app-exit", { session: index, code, signal });
  });

  try {
  let endpoint = null;
  for (let i = 0; i < 300; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${sessionPort}/json/version`);
      if (res.ok) {
        const body = await res.json();
        if (body.webSocketDebuggerUrl) { endpoint = body.webSocketDebuggerUrl; break; }
      }
    } catch { /* not listening yet */ }
    if (s.exited) break;
    await sleep(50);
  }
  if (!endpoint) throw new Error(`CDP endpoint unavailable for session ${index}`);

  s.browser = await chromium.connectOverCDP(endpoint);
  s.context = s.browser.contexts()[0] ?? (await s.browser.newContext());
  await s.context.addInitScript(() => {
    try {
      localStorage.setItem("openbentt-onboarding-v1", JSON.stringify({
        state: "READY", completed: true, updatedAt: new Date().toISOString(),
      }));
    } catch { /* file:// storage unavailable */ }
  });
  let page = s.context.pages().find((p) => /^(file|app|http|https):/.test(p.url()));
  if (!page) {
    try { page = await s.context.waitForEvent("page", { timeout: 30000 }); }
    catch (e) {
      page = s.context.pages().find((p) => /^(file|app|http|https):/.test(p.url())) ?? null;
      if (!page) throw e;
    }
  }
  s.page = page;
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});

  page.on("crash", () => {
    s.broken = true;
    event("page-crash", { session: index });
  });
  page.on("pageerror", (e) => event("page-error", { session: index, message: String(e).slice(0, 500) }));
  page.on("close", () => event("page-close", { session: index }));
  page.on("console", (m) => {
    if (m.type() === "error") event("console-error", { session: index, message: m.text().slice(0, 300) });
  });

  try {
    await page.waitForSelector("button.sidebar-nav-item", { timeout: 45000 });
  } catch (e) {
    const diag = await page.evaluate(() => ({
      url: location.href,
      text: document.body?.innerText?.replace(/\s+/g, " ").slice(0, 240) ?? null,
    })).catch(() => null);
    throw new Error(`sidebar not ready in session ${index}: ${String(e).slice(0, 160)}; page=${JSON.stringify(diag)}`);
  }
  s.cdp = await s.context.newCDPSession(page);
  await cdpSend(s, "Performance.enable").catch(() => {});
  await s.browser.newBrowserCDPSession().then((bs) => { s.browserCdp = bs; }).catch(() => { s.browserCdp = null; });
  await instrumentRendererBridge(s);
  await takeSample(s, `session-${index}-ready`);
  return s;
  } catch (e) {
    // A failed launch must not leak an Electron child or an open log fd.
    if (s.browser) await s.browser.close().catch(() => {});
    if (s.child && s.exited === null) {
      s.child.kill("SIGTERM");
      await Promise.race([new Promise((r) => s.child.once("exit", r)), sleep(3000)]);
      if (s.exited === null) s.child.kill("SIGKILL");
    }
    if (s.log) fs.closeSync(s.log);
    report.sessions.push({
      index, reason: "launch-failed", exit: s.exited, logFile: s.logFile,
      error: String(e?.message ?? e).slice(0, 300), profile: s.profile,
    });
    throw e;
  }
}

async function stopSession(s, reason) {
  if (!s) return;
  phase(`shutdown-${s.index}`, { reason });
  if (s.child && s.exited === null) {
    // Prefer the app's own graceful quit path (desktop:quit IPC).
    if (s.page && !s.page.isClosed()) {
      await bridge(s, "openbenttDesktop", "quitApp").catch(() => {});
    }
    await Promise.race([
      new Promise((r) => { if (s.exited) r(); else s.child.once("exit", r); }),
      sleep(12000),
    ]);
    if (s.exited === null) {
      event("forced-shutdown", { session: s.index, reason });
      s.child.kill("SIGTERM");
      await Promise.race([
        new Promise((r) => { if (s.exited) r(); else s.child.once("exit", r); }),
        sleep(4000),
      ]);
      if (s.exited === null) s.child.kill("SIGKILL");
    }
  }
  if (s.browser) await s.browser.close().catch(() => {});
  if (s.log) fs.closeSync(s.log);
  report.sessions.push({ index: s.index, reason, exit: s.exited, logFile: s.logFile, profile: s.profile });
}

/**
 * Recover from an app that exited or became unresponsive mid-workload. The
 * budget is wall-clock based, so a recovery must not finish the soak early:
 * relaunch on the same profile where possible, then continue the workload.
 */
async function recoverSession(current, reason) {
  event("session-recovery", {
    reason,
    exit: current?.exited ?? null,
    broken: current?.broken ?? false,
  });
  if (current) {
    if (current.browser) await current.browser.close().catch(() => {});
    if (current.child && current.exited === null) {
      current.child.kill("SIGTERM");
      await Promise.race([
        new Promise((r) => { if (current.exited) r(); else current.child.once("exit", r); }),
        sleep(3000),
      ]);
      if (current.exited === null) current.child.kill("SIGKILL");
    }
    if (current.log) fs.closeSync(current.log);
    report.sessions.push({
      index: current.index, reason: "recovered", exit: current.exited,
      logFile: current.logFile, profile: current.profile,
    });
  }
  const base = current?.index ?? 0;
  for (const attempt of [
    { index: base + 10, fresh: false },
    { index: base + 11, fresh: true },
    { index: base + 12, fresh: true },
  ]) {
    try {
      const next = await launchSession(attempt.index, attempt.fresh);
      await step(next, `recovery-${attempt.index}-chat`, () => gotoChat(next));
      return { session: next, fresh: attempt.fresh };
    } catch (e) {
      event("recovery-attach-failed", {
        session: attempt.index, freshProfile: attempt.fresh,
        message: String(e?.message ?? e).slice(0, 300),
      });
    }
  }
  event("recovery-failed", { reason });
  return null;
}

async function step(s, name, fn) {
  if (s?.broken || s?.exited !== null) {
    return { skipped: "session unavailable (crash or exit)" };
  }
  const started = Date.now();
  let result;
  try {
    result = await fn();
  } catch (e) {
    const message = String(e?.message ?? e).slice(0, 300);
    result = { error: message };
    event("step-error", { name, message });
    if (/Target page, context or browser has been closed|cdp-timeout/.test(message)) {
      s.broken = true;
      event("session-unresponsive", { name, message });
    }
  }
  report.phases.push({ tMs: now(), name, durationMs: Date.now() - started, result });
  return result;
}

const rail = (s, icon) => s.page.locator(`button.sidebar-nav-item:has(svg.lucide-${icon})`).first();
// dispatchEvent avoids tooltip overlays intercepting real mouse clicks on the icon rail.
const navClick = (s, icon) => rail(s, icon).dispatchEvent("click", { timeout: 10000 });

async function gotoChat(s) {
  await navClick(s, "message-square");
  await s.page.waitForURL("**/chat", { timeout: 10000 });
  return "chat";
}

async function gotoNotebook(s) {
  await navClick(s, "notebook-pen");
  await s.page.waitForURL("**/notebook", { timeout: 10000 });
  await s.page.waitForSelector("[data-notebook-studio]", { timeout: 10000 }).catch(() => {});
  return "notebook";
}

async function gotoSettings(s) {
  await navClick(s, "settings");
  await s.page.waitForURL("**/settings", { timeout: 10000 });
  await s.page.waitForSelector('[role="combobox"]', { timeout: 10000 });
}

/** Synthetic long conversation: labelled, hidden DOM messages injected via CDP. */
async function appendSyntheticConversation(s, count, maxMessages = 600) {
  const res = await cdpSend(s, "Runtime.evaluate", {
    expression: `(() => {
      const host = document.querySelector('[data-testid="chat-messages"]') || document.querySelector('main') || document.body;
      let root = document.getElementById('__endurance_conversation');
      if (!root) {
        root = document.createElement('div');
        root.id = '__endurance_conversation';
        root.dataset.enduranceSynthetic = 'long-conversation';
        root.style.display = 'none';
        host.appendChild(root);
      }
      const para = ('Endurance synthetic conversation message. '.repeat(48));
      for (let i = 0; i < ${count}; i++) {
        const el = document.createElement('article');
        el.className = 'endurance-synthetic-message';
        el.textContent = para + ' sequence ' + (root.children.length + 1);
        root.appendChild(el);
      }
      while (root.children.length > ${maxMessages}) root.removeChild(root.firstElementChild);
      return { appended: ${count}, retainedMessages: root.children.length, chars: root.textContent.length,
        label: 'SYNTHETIC long conversation (injected via CDP, not real model output)' };
    })()`,
    returnByValue: true,
  });
  return res?.result?.value ?? null;
}

/** Synthetic PDF-heavy notebook pages, used only when no real PDF fixture is loaded. */
async function synthNotebookContent(s, pages = 20) {
  const res = await cdpSend(s, "Runtime.evaluate", {
    expression: `(() => {
      const host = document.querySelector('[data-notebook-studio]') || document.body;
      let root = document.getElementById('__endurance_pdf_facsimile');
      if (!root) {
        root = document.createElement('div');
        root.id = '__endurance_pdf_facsimile';
        root.dataset.enduranceSynthetic = 'pdf-heavy-notebook';
        root.style.display = 'none';
        host.appendChild(root);
      }
      for (let p = 0; p < ${pages}; p++) {
        const el = document.createElement('section');
        el.className = 'endurance-synthetic-pdf-page';
        el.textContent = 'SYNTHETIC PDF page ' + (p + 1) + '. ' + ('Lorem ipsum dolor sit amet, pdf text layer, citation 42. '.repeat(36));
        root.appendChild(el);
      }
      while (root.children.length > ${pages * 3}) root.removeChild(root.firstElementChild);
      return { retainedPages: root.children.length, chars: root.textContent.length,
        label: 'SYNTHETIC representative PDF-heavy notebook content (no real PDF parsed)' };
    })()`,
    returnByValue: true,
  });
  return res?.result?.value ?? null;
}

/** Store + load real PDF fixtures through the research IPC bridge when available. */
async function loadPdfFixtures(s) {
  let files = [];
  try {
    files = fs.readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort().slice(0, 2);
  } catch { /* directory absent */ }
  if (!files.length) {
    const synthetic = await synthNotebookContent(s);
    return { mode: "synthetic", note: `No PDF fixtures in ${pdfDir}; label: SYNTHETIC`, synthetic };
  }
  const projectId = `endurance-soak-${process.pid}`;
  await bridge(s, "openbenttResearch", "init");
  await bridge(s, "openbenttResearch", "saveProject", {
    id: projectId,
    title: "Endurance soak (harness fixture)",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetVenue: "generic",
    linkedThreadIds: [],
    draftTex: "",
    bibliography: "",
    papers: [],
    chunks: [{ id: "endurance-chunk", paperId: "draft", text: "Endurance fixture project" }],
    revisionSuggestions: [],
    modelAttributions: [],
    abstractVariants: [],
    keywordSuggestions: [],
  });
  const stored = [];
  let loadedChars = 0;
  for (let i = 0; i < files.length; i++) {
    const fp = path.join(pdfDir, files[i]);
    const bytes = fs.readFileSync(fp);
    const paperId = `endurance-paper-${i + 1}`;
    const put = await bridge(s, "openbenttResearch", "storePaperPdf", projectId, paperId, bytes.toString("base64"));
    const got = await bridge(s, "openbenttResearch", "loadPaperPdf", projectId, paperId);
    stored.push({ file: files[i], bytes: bytes.length, paperId, put, loaded: got.ok, base64Chars: got.summary?.value?.length ?? null });
    if (got.summary?.type === "string") loadedChars += String(got.summary.value).length;
  }
  const active = await bridge(s, "openbenttResearch", "setActiveProjectId", projectId);
  const synthetic = await synthNotebookContent(s, 6);
  return {
    mode: "fixture",
    note: `Real PDF fixtures loaded through research:storePaperPdf/loadPaperPdf from ${pdfDir}; synthetic page markup added for volume`,
    projectId, stored, loadedBase64Chars: loadedChars, active, synthetic,
  };
}

async function switchProvider(s, provider, label) {
  await gotoSettings(s);
  const combo = s.page.getByText("AI provider", { exact: true }).locator("..").locator('[role="combobox"]').first();
  const target = (await combo.count()) ? combo : s.page.locator('[role="combobox"]').first();
  // Radix Select opens on pointerdown with a mouse pointer. dispatchEvent avoids
  // tooltip/overlay interception while still exercising the real UI handlers.
  await target.dispatchEvent("pointerdown", {
    pointerType: "mouse", button: 0, ctrlKey: false, pointerId: 1, bubbles: true,
  });
  if (!(await s.page.getByRole("option").first().isVisible().catch(() => false))) {
    await target.focus();
    await target.press("Enter");
  }
  await s.page.waitForSelector('[role="option"]', { timeout: 5000 });
  const option = s.page.getByRole("option", { name: new RegExp(label) }).first();
  // Radix SelectItem commits on click only when pointerType is not "mouse".
  await option.dispatchEvent("pointerdown", { pointerType: "keyboard", bubbles: true });
  await option.dispatchEvent("click", {}, { timeout: 5000 });
  await s.page.locator('button:has-text("Save settings")').first()
    .dispatchEvent("click", {}, { timeout: 5000 });
  await sleep(800);
  return provider;
}

async function safeStatusAndEnsure(s) {
  const calls = [
    ["openbenttAgent", "getStatus"],
    ["openbenttAgent", "serverStatus"],
    ["openbenttAgent", "getRuntimeStatus"],
    ["openbenttAgent", "detectOmniRoute"],
    ["openbenttAgent", "getModels", false],
    ["openbenttOllama", "status", "http://127.0.0.1:11434"],
    ["openbenttNarration", "status"],
    ["openbenttZotero", "status"],
    ["openbenttDesktop", "documentsOcrStatus"],
    ["openbenttDesktop", "computerCapabilities"],
    ["openbenttDesktop", "getAppVersion"],
    ["openbenttResearch", "listProjects"],
  ];
  const results = {};
  for (const [ns, method, ...args] of calls) {
    const key = `${ns}.${method}`;
    results[key] = await Promise.race([
      bridge(s, ns, method, ...args),
      sleep(6000).then(() => ({ ok: false, error: "timeout" })),
    ]);
  }
  const ensure = { skipped: [], attempted: [] };
  if (allowEnsure) {
    for (const [ns, method] of [["openbenttAgent", "ensureRuntime"], ["openbenttNarration", "ensure"]]) {
      ensure.attempted.push({ call: `${ns}.${method}`, result: await bridge(s, ns, method) });
    }
  } else {
    ensure.skipped = [
      "openbenttAgent.ensureRuntime", "openbenttNarration.ensure", "openbenttLocalGguf.ensureServer",
    ];
    ensure.reason = "Opt-in only (OPENBENTT_ENDURANCE_ALLOW_ENSURE=1); these paths can spawn helper processes.";
  }
  return { results, ensure };
}

async function safeToolExecution(s) {
  // "list" must be called with no second IPC argument (authorization rejects an object/null).
  const calls = [
    { op: "list" },
    { op: "get", payload: { toolId: "utility.calculate" } },
    { op: "execute", payload: { toolId: "knowledge.search", input: { query: "endurance soak" }, context: { userInitiated: true } } },
    { op: "execute", payload: { toolId: "document.search", input: { query: "endurance" }, context: {} } },
    { op: "audit", payload: { limit: 5 } },
  ];
  const out = [];
  for (const call of calls) {
    out.push({
      op: call.op, payload: call.payload ? Object.keys(call.payload) : null,
      result: await Promise.race([
        bridge(s, "openbenttResearch", "tools", call.op, ...(call.payload ? [call.payload] : [])),
        sleep(6000).then(() => ({ ok: false, error: "timeout" })),
      ]),
    });
  }
  return out;
}

/** GC checkpoint: pre-GC sample, explicit collection, post-GC sample. */
async function checkpoint(s, label, cycle) {
  const sampleFor = async (sampleLabel) => {
    for (let i = 0; i < 10; i++) {
      const found = await takeSample(s, sampleLabel);
      if (found) return found;
      await sleep(100);
    }
    return null;
  };
  const preSample = await sampleFor(`${label}:pre-gc`);
  if (!preSample || s.broken) {
    event("checkpoint-skipped", { label, reason: "renderer unavailable before GC" });
    return null;
  }
  let gc = "ok";
  try { await cdpSend(s, "HeapProfiler.collectGarbage", {}, 15000); }
  catch (e) { gc = String(e).slice(0, 200); event("gc-error", { label, message: gc }); }
  await sleep(700);
  const post = await sampleFor(`${label}:post-gc`);
  const pre = preSample;
  if (!post || post.renderer?.jsHeapUsedMb === undefined) {
    event("checkpoint-skipped", { label, reason: "renderer unavailable after GC" });
    return null;
  }
  const cp = {
    tMs: now(), label, cycle, gc,
    pre: pre ? {
      jsHeapUsedMb: pre.renderer?.jsHeapUsedMb ?? null,
      domNodes: pre.renderer?.domNodes ?? null,
      eventListeners: pre.renderer?.eventListeners ?? null,
      totalRssMb: pre.procs?.totalRssMb ?? null,
      rendererRssMb: pre.procs?.rendererRssMb ?? null,
      externalMemoryProxyMb: pre.externalMemoryProxyMb,
    } : null,
    post: post ? {
      jsHeapUsedMb: post.renderer?.jsHeapUsedMb ?? null,
      domNodes: post.renderer?.domNodes ?? null,
      eventListeners: post.renderer?.eventListeners ?? null,
      totalRssMb: post.procs?.totalRssMb ?? null,
      rendererRssMb: post.procs?.rendererRssMb ?? null,
      externalMemoryProxyMb: post.externalMemoryProxyMb,
    } : null,
  };
  if (cp.pre && cp.post) {
    cp.freed = {
      jsHeapMb: round(cp.pre.jsHeapUsedMb - cp.post.jsHeapUsedMb),
      domNodes: cp.pre.domNodes !== null && cp.post.domNodes !== null ? cp.pre.domNodes - cp.post.domNodes : null,
      eventListeners: cp.pre.eventListeners !== null && cp.post.eventListeners !== null
        ? cp.pre.eventListeners - cp.post.eventListeners : null,
      totalRssMb: round(cp.pre.totalRssMb - cp.post.totalRssMb),
    };
  }
  report.checkpoints.push(cp);
  return cp;
}

function interpret() {
  const postGc = report.checkpoints.filter((c) => c.post?.jsHeapUsedMb !== null && c.post?.jsHeapUsedMb !== undefined);
  const heaps = postGc.map((c) => ({ label: c.label, cycle: c.cycle, heapMb: c.post.jsHeapUsedMb }));
  const rss = postGc.map((c) => ({ label: c.label, totalRssMb: c.post.totalRssMb, rendererRssMb: c.post.rendererRssMb }));
  const listeners = postGc.map((c) => ({ label: c.label, count: c.post.eventListeners }));
  const domNodes = postGc.map((c) => ({ label: c.label, count: c.post.domNodes }));
  const freed = report.checkpoints.map((c) => ({ label: c.label, freed: c.freed }));
  const first = heaps[0]?.heapMb ?? null;
  const last = heaps.at(-1)?.heapMb ?? null;
  const delta = first !== null && last !== null ? round(last - first) : null;
  const listenerFirst = listeners.find((x) => x.count !== null)?.count ?? null;
  const listenerLast = [...listeners].reverse().find((x) => x.count !== null)?.count ?? null;
  const listenerDelta = listenerFirst !== null && listenerLast !== null ? listenerLast - listenerFirst : null;
  let conservative;
  if (heaps.length < 2) {
    conservative = "Fewer than two post-GC checkpoints: no trend can be inferred. Treat all numbers as raw observations only.";
  } else if (delta !== null && delta > 5 && listenerDelta !== null && listenerDelta > 0) {
    conservative = "Post-GC retained JS heap increased across equivalent workloads and event-listener count also rose. " +
      "This is consistent with retention (possible leak), but caches, fixtures and harness-injected synthetic DOM can " +
      "also explain part of it; confirm with a longer run before assigning root cause.";
  } else if (delta !== null && delta > 5) {
    conservative = "Post-GC JS heap grew across equivalent workloads. Some growth survived explicit GC, which is " +
      "consistent with retained objects or larger intentional caches; not proof of a leak on this short sample.";
  } else {
    conservative = "No sustained growth in post-GC JS heap across equivalent workloads. Pre-GC growth that was " +
      "reclaimed by GC is treated as cache/transient allocation, not a leak. Renderer RSS can remain above JS heap " +
      "because of native PDF/GPU bindings and allocator behaviour.";
  }
  report.interpretation = {
    method: "Each checkpoint samples the same workload before and after HeapProfiler.collectGarbage. " +
      "Pre-GC drops indicate reclaimable cache/transient allocations; growth that remains post-GC across " +
      "equivalent cycles is the only signal treated as possible retention. RSS is a coarse process-level metric.",
    postGcJsHeapMb: heaps,
    postGcRssMb: rss,
    postGcEventListeners: listeners,
    postGcDomNodes: domNodes,
    gcFreed: freed,
    firstToLastPostGcHeapDeltaMb: delta,
    firstToLastPostGcListenerDelta: listenerDelta,
    externalMemoryNote: "CDP does not expose a V8 external-memory counter here. externalMemoryProxyMb = renderer RSS " +
      "minus JS used heap (labelled proxy). SystemInfo.getProcessInfo memory fields are captured when supported.",
    confounders: [
      "The harness intentionally retains up to 600 hidden synthetic conversation messages and synthetic PDF-page markup; " +
        "DOM node growth is expected and is not, by itself, an application leak.",
      "The provider is switched every cycle, so listener counts include repeated UI framework registration/teardown.",
      "The post-restart checkpoint shows whether the retained counts reset with a fresh renderer.",
    ],
    conservative,
  };
}

function fatalEvents() {
  return report.events.filter((e) =>
    e.kind === "page-error" || e.kind === "page-crash" || e.kind === "fatal" ||
    e.kind === "unexpected-exit" || e.kind === "harness-error"
  );
}

async function run() {
  const reserveMs = Math.min(180000, Math.max(20000, Math.floor(durationMs * 0.25)));
  const workloadDeadline = Math.max(1, durationMs - reserveMs);
  phase("start", { workloadDeadlineMs: workloadDeadline, reserveMs });

  let s = null;
  let sampler = null;
  let cycle = 0;
  let fixture = null;
  let traceDone = false;
  try {
    s = await launchSession(0);
    await step(s, "warmup-goto-chat", () => gotoChat(s));
    fixture = await step(s, "pdf-fixtures", () => loadPdfFixtures(s));
    await checkpoint(s, "baseline", cycle);
    sampler = setInterval(() => {
      if (s && s.exited === null) takeSample(s, "periodic").catch(() => {});
    }, sampleMs);

    do {
      // A spontaneous exit or renderer crash is a stability finding, not a
      // reason to shorten the wall-clock budget. Record it, relaunch, and keep
      // applying the workload until the configured deadline is reached.
      if (s.exited !== null || s.broken) {
        event(s.exited !== null ? "unexpected-exit" : "workload-aborted", {
          session: s.index, cycle, exit: s.exited,
          reason: s.broken ? "renderer crash or unresponsive" : "app exited mid-workload",
        });
        const recovered = await recoverSession(s, "mid-workload");
        if (!recovered) break;
        s = recovered.session;
        if (recovered.fresh) {
          fixture = await step(s, `recovery-${s.index}-pdf-fixtures`, () => loadPdfFixtures(s));
        }
        await checkpoint(s, `recovery-${s.index}`, cycle);
      }

      cycle++;
      await step(s, `cycle-${cycle}-chat`, () => gotoChat(s));
      await step(s, `cycle-${cycle}-conversation`, () => appendSyntheticConversation(s, 30));
      await step(s, `cycle-${cycle}-status`, () => safeStatusAndEnsure(s));
      if (!traceDone) { await traceIpcWindow(s); traceDone = true; }
      await step(s, `cycle-${cycle}-tools`, () => safeToolExecution(s));
      await step(s, `cycle-${cycle}-notebook`, async () => {
        await gotoNotebook(s);
        return synthNotebookContent(s, 12);
      });
      await step(s, `cycle-${cycle}-pdf-reload`, () => bridge(s, "openbenttResearch", "listProjects"));
      // Cloud providers without keys: exercises provider-switch paths without
      // starting a loopback model server or local model download.
      const provider = cycle % 2 === 1 ? ["google", "Google Gemini"] : ["openrouter", "OpenRouter"];
      await step(s, `cycle-${cycle}-provider`, async () => {
        await switchProvider(s, provider[0], provider[1]);
        return provider[0];
      });
      await step(s, `cycle-${cycle}-idle`, async () => { await sleep(idleMs); return idleMs; });
      await takeSample(s, `cycle-${cycle}-end`);
      if (s.exited !== null || s.broken) {
        event(s.exited !== null ? "unexpected-exit" : "workload-aborted", {
          session: s.index, cycle, exit: s.exited,
          reason: s.broken ? "renderer crash or unresponsive" : "app exited mid-workload",
        });
        const recovered = await recoverSession(s, "after-idle");
        if (!recovered) break;
        s = recovered.session;
        if (recovered.fresh) {
          fixture = await step(s, `recovery-${s.index}-pdf-fixtures`, () => loadPdfFixtures(s));
        }
        await checkpoint(s, `recovery-${s.index}`, cycle);
      } else if (cycle % 5 === 0 || now() >= workloadDeadline - idleMs - 5000) {
        await checkpoint(s, `cycle-${cycle}`, cycle);
      }
      if (now() >= workloadDeadline) break;
    } while (true);

    if (sampler) { clearInterval(sampler); sampler = null; }
    await collectRendererBridgeCounts(s);
    await stopSession(s, "end-of-workload");
    s = null;

    // Restart and run a shorter verification workload. First try the same
    // isolated profile; if the app cannot come back on it, fall back to a
    // second isolated profile so the restart path is still exercised.
    phase("restart");
    let restarted = false;
    await sleep(2000);
    for (const attempt of [
      { index: 1, fresh: false }, { index: 2, fresh: true }, { index: 3, fresh: true },
    ]) {
      try {
        s = await launchSession(attempt.index, attempt.fresh);
        restarted = true;
        phase("restart-ready", { session: attempt.index, profile: s.profile, freshProfile: attempt.fresh });
        break;
      } catch (e) {
        event("restart-attach-failed", {
          session: attempt.index, freshProfile: attempt.fresh, message: String(e?.message ?? e).slice(0, 300),
        });
        s = null;
      }
    }
    if (!restarted) throw new Error("restart did not produce a ready app page");
    await step(s, "restart-chat", () => gotoChat(s));
    await step(s, "restart-conversation", () => appendSyntheticConversation(s, 30));
    await step(s, "restart-status", () => safeStatusAndEnsure(s));
    await step(s, "restart-notebook", () => gotoNotebook(s));
    await checkpoint(s, "post-restart", cycle + 1);
    await takeSample(s, "final");
    await collectRendererBridgeCounts(s);
    await stopSession(s, "final");
    s = null;
  } catch (e) {
    event("harness-error", { message: String(e?.stack ?? e).slice(0, 1200) });
    if (s) await stopSession(s, "error").catch(() => {});
  } finally {
    if (sampler) clearInterval(sampler);
    if (s) await stopSession(s, "finally").catch(() => {});
  }

  interpret();
  report.finishedAt = new Date().toISOString();
  report.durationObservedMs = now();
  report.fixtureMode = fixture ? { mode: fixture.mode, note: fixture.note, files: fixture.stored?.map((x) => x.file) ?? [] } : null;
  report.fatalCount = fatalEvents().length;
  report.warningCount = report.events.filter((e) => [
    "cdp-timeout", "session-unresponsive", "forced-shutdown", "restart-attach-failed",
    "step-error", "sample-error", "checkpoint-skipped", "session-recovery", "recovery-failed",
  ].includes(e.kind)).length;
  report.status = report.fatalCount > 0 ? "failed" : report.warningCount > 0 ? "completed-with-warnings" : "completed";
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    output, status: report.status, durationObservedMs: report.durationObservedMs,
    cycles: cycle, samples: report.samples.length, checkpoints: report.checkpoints.length,
    warningCount: report.warningCount,
    fatalEvents: fatalEvents().map((e) => ({ kind: e.kind, message: e.message ?? null })),
    interpretation: report.interpretation?.conservative,
  }, null, 2));
  if (report.fatalCount > 0) process.exitCode = 1;
}

await run();
