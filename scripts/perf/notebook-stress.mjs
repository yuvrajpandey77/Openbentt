/**
 * Notebook stability probe: exercises the paths suspected of killing the app
 * (repeated navigation, PDF preview, LaTeX compile, resize, provider switch).
 * Records renderer crashes, page errors, child exits and per-process RSS.
 *
 * Usage: node scripts/perf/notebook-stress.mjs [output.json] [cycles]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { chromium } from "playwright-core";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.resolve(process.argv[2] ?? "/tmp/opencode/notebook-stress.json");
const cycles = Number(process.argv[3] ?? 6);
const port = 9422 + (process.pid % 50);
const profile = `/tmp/opencode/obt-stress-${process.pid}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(profile, { recursive: true });

function procs(pid) {
  const all = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const p = Number(entry);
      const stat = fs.readFileSync(`/proc/${p}/stat`, "utf8");
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[1]);
      const status = fs.readFileSync(`/proc/${p}/status`, "utf8");
      const cmd = fs.readFileSync(`/proc/${p}/cmdline`, "utf8").replaceAll("\0", " ");
      all.push({ p, ppid, mb: +(Number(/VmRSS:\s*(\d+)/.exec(status)?.[1] ?? 0) / 1024).toFixed(1), type: cmd.includes("--type=renderer") ? "renderer" : cmd.includes("--type=gpu-process") ? "gpu" : cmd.includes("--type=utility") ? "utility" : "main" });
    } catch { /* gone */ }
  }
  const out = [];
  const q = [pid];
  while (q.length) {
    const p = q.shift();
    const proc = all.find((x) => x.p === p);
    if (!proc) continue;
    out.push({ pid: p, type: proc.type, mb: proc.mb });
    q.push(...all.filter((x) => x.ppid === p).map((x) => x.p));
  }
  return out;
}

const t0 = Date.now();
const log = fs.openSync(`/tmp/opencode/obt-stress-${process.pid}.log`, "w");
let exit = null;
const child = spawn(electron, [".", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-dev-shm-usage"], {
  cwd: appRoot, stdio: ["ignore", log, log], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
});
child.on("exit", (code, signal) => { exit = { code, signal, atMs: Date.now() - t0 }; });
const samples = [];
const timer = setInterval(() => samples.push({ tMs: Date.now() - t0, procs: procs(child.pid) }), 1000);
const events = [];
let browser;
const report = { date: new Date().toISOString(), cycles, events, samples: [], exit: null, steps: [] };
const step = async (name, fn) => {
  const started = Date.now();
  let result;
  try { result = await fn(); } catch (e) { result = { error: String(e).slice(0, 300) }; events.push({ tMs: Date.now() - t0, kind: "step-error", name, message: String(e).slice(0, 300) }); }
  report.steps.push({ name, atMs: Date.now() - t0, durationMs: Date.now() - started, result });
};

try {
  let endpoint = null;
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) { endpoint = (await r.json()).webSocketDebuggerUrl; break; } } catch {}
    await sleep(50);
  }
  if (!endpoint) throw new Error("CDP unavailable");
  browser = await chromium.connectOverCDP(endpoint);
  const ctx = browser.contexts()[0] ?? (await browser.newContext());
  await ctx.addInitScript(() => {
    try { localStorage.setItem("openbentt-onboarding-v1", JSON.stringify({ state: "READY", completed: true, updatedAt: new Date().toISOString() })); } catch {}
  });
  const page = ctx.pages().find((p) => /^(file|app|http|https):/.test(p.url())) ?? await ctx.waitForEvent("page", { timeout: 15000 });
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  page.on("crash", () => events.push({ tMs: Date.now() - t0, kind: "page-crash" }));
  page.on("close", () => events.push({ tMs: Date.now() - t0, kind: "page-close" }));
  page.on("pageerror", (e) => events.push({ tMs: Date.now() - t0, kind: "page-error", message: String(e).slice(0, 400) }));
  page.on("console", (m) => { if (m.type() === "error") events.push({ tMs: Date.now() - t0, kind: "console-error", message: m.text().slice(0, 250) }); });
  await page.waitForSelector("button.sidebar-nav-item", { timeout: 30000 });

  const rail = (name) => page.locator(`button.sidebar-nav-item:has(svg.lucide-${name})`).first();
  const openNotebook = async () => {
    await rail("notebook-pen").click({ timeout: 8000 });
    await page.waitForURL("**/notebook", { timeout: 10000 });
    await page.waitForSelector("[data-notebook-studio]", { timeout: 10000 });
  };
  const openChat = async () => {
    await rail("message-square").click({ timeout: 8000 });
    await page.waitForURL("**/chat", { timeout: 10000 });
  };

  await step("initial-notebook", async () => {
    await openNotebook();
    return page.evaluate(() => ({ nodes: document.querySelectorAll("*").length, heap: performance.memory?.usedJSHeapSize }));
  });

  for (let c = 0; c < cycles; c++) {
    await step(`cycle-${c}-chat`, openChat);
    await step(`cycle-${c}-notebook`, async () => {
      await openNotebook();
      return page.evaluate(() => ({ nodes: document.querySelectorAll("*").length, heap: performance.memory?.usedJSHeapSize }));
    });
    if (c === 0) {
      await step("resize-small", () => page.setViewportSize({ width: 900, height: 600 }));
      await step("resize-large", () => page.setViewportSize({ width: 1600, height: 1000 }));
      await step("compile", async () => {
        const btn = page.getByRole("button", { name: /^Compile$/i }).first();
        if (!(await btn.count())) return "no compile button";
        await btn.click({ timeout: 8000 });
        await sleep(4000);
        return page.evaluate(() => document.body.innerText.includes("Compiled") ? "compiled" : "no confirmation");
      });
    }
    if (exit) break;
  }
} catch (e) {
  events.push({ tMs: Date.now() - t0, kind: "fatal", message: String(e?.stack ?? e).slice(0, 800) });
} finally {
  clearInterval(timer);
  report.samples = samples;
  if (!exit) {
    child.kill("SIGTERM");
    await Promise.race([new Promise((r) => child.once("exit", r)), sleep(3000)]);
  }
  report.exit = exit;
  if (browser) await browser.close().catch(() => {});
  fs.closeSync(log);
}
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, events: events.slice(0, 40), exit, steps: report.steps.length }, null, 2));
