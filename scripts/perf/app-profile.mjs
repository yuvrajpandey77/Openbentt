/**
 * Reproducible Electron performance + stability probe.
 *
 * Launches the built app with an isolated profile and CDP enabled, records
 * navigation/paint timings, samples per-process RSS, exercises Notebook
 * navigation, and reports everything as JSON.
 *
 * Usage: node scripts/perf/app-profile.mjs [output.json] [iterations]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { chromium } from "playwright-core";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.resolve(process.argv[2] ?? "/tmp/opencode/openbentt-profile.json");
const iterations = Number(process.argv[3] ?? 1);
const debugPort = 9333 + (process.pid % 100);
const profile = `/tmp/opencode/openbentt-profile-${process.pid}`;
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(path.dirname(output), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function procTree(rootPid) {
  const all = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[1]);
      const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
      const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      const rssKb = Number(/VmRSS:\s*(\d+)/.exec(status)?.[1] ?? 0);
      all.push({ pid, ppid, rssKb, cmdline });
    } catch {
      /* process exited during sampling */
    }
  }
  const result = [];
  const queue = [rootPid];
  while (queue.length) {
    const pid = queue.shift();
    const proc = all.find((p) => p.pid === pid);
    if (!proc) continue;
    let type = "main";
    if (proc.cmdline.includes("--type=renderer")) type = "renderer";
    else if (proc.cmdline.includes("--type=gpu-process")) type = "gpu";
    else if (proc.cmdline.includes("--type=utility")) type = "utility";
    else if (proc.cmdline.includes("--type=")) type = proc.cmdline.match(/--type=(\S+)/)[1];
    result.push({ pid: proc.pid, type, rssMb: +(proc.rssKb / 1024).toFixed(1) });
    queue.push(...all.filter((p) => p.ppid === proc.pid).map((p) => p.pid));
  }
  return result;
}

async function runIteration(index) {
  const t0 = Date.now();
  const logFile = `/tmp/opencode/openbentt-profile-${process.pid}-${index}.log`;
  const log = fs.openSync(logFile, "w");
  let exit = null;
  const child = spawn(
    electron,
    [
      ".",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--enable-software-rasterizer",
      "--disable-dev-shm-usage",
    ],
    { cwd: appRoot, stdio: ["ignore", log, log], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" } }
  );
  child.on("exit", (code, signal) => { exit = { code, signal, atMs: Date.now() - t0 }; });

  const samples = [];
  const sampleTimer = setInterval(() => {
    samples.push({ tMs: Date.now() - t0, procs: procTree(child.pid) });
  }, 500);
  const events = [];
  let browser;
  const result = { iteration: index, events, samples: [], timings: {}, exit: null };

  try {
    let endpoint = null;
    for (let i = 0; i < 200; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        if (res.ok) { endpoint = (await res.json()).webSocketDebuggerUrl; if (endpoint) break; }
      } catch { /* not listening yet */ }
      await sleep(50);
    }
    result.timings.cdpReadyMs = Date.now() - t0;
    if (!endpoint) throw new Error("CDP endpoint never appeared");

    browser = await chromium.connectOverCDP(endpoint);
    const contexts = browser.contexts();
    const context = contexts[0] ?? (await browser.newContext());
    await context.addInitScript(() => {
      try {
        localStorage.setItem("openbentt-onboarding-v1", JSON.stringify({ state: "READY", completed: true, updatedAt: new Date().toISOString() }));
      } catch { /* file:// storage unavailable */ }
    });
    let page = context.pages().find((p) => /^(file|app|http|https):/.test(p.url()));
    if (!page) page = await context.waitForEvent("page", { timeout: 15000 });
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    result.timings.pageAttachedMs = Date.now() - t0;

    page.on("crash", () => events.push({ tMs: Date.now() - t0, kind: "page-crash" }));
    page.on("close", () => events.push({ tMs: Date.now() - t0, kind: "page-close" }));
    page.on("pageerror", (e) => events.push({ tMs: Date.now() - t0, kind: "page-error", message: String(e).slice(0, 500) }));
    page.on("console", (m) => {
      if (m.type() === "error") events.push({ tMs: Date.now() - t0, kind: "console-error", message: m.text().slice(0, 300) });
    });

    const snapshots = [];
    for (let s = 0; s < 12; s++) {
      const snap = await page.evaluate(() => ({
        url: location.href,
        text: document.body.innerText.replace(/\s+/g, " ").slice(0, 140),
        links: [...document.querySelectorAll("a[href]")].slice(0, 12).map((a) => a.getAttribute("href")),
        navButtons: document.querySelectorAll("button.sidebar-nav-item").length,
      })).catch(() => null);
      snapshots.push({ tMs: Date.now() - t0, ...snap });
      if ((snap?.navButtons ?? 0) > 0) break;
      await sleep(1000);
    }
    result.snapshots = snapshots;
    await page.waitForSelector("button.sidebar-nav-item", { timeout: 30000 });
    result.timings.sidebarReadyMs = Date.now() - t0;
    const timings = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paint = performance.getEntriesByType("paint").map((p) => ({ name: p.name, startTime: Math.round(p.startTime) }));
      const resources = performance.getEntriesByType("resource");
      return {
        navigation: nav ? {
          responseEnd: Math.round(nav.responseEnd),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
          loadEvent: Math.round(nav.loadEventEnd),
        } : null,
        paint,
        resourceCount: resources.length,
        largestResources: resources
          .map((r) => ({ name: r.name.split("/").pop(), duration: Math.round(r.duration), size: r.transferSize }))
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 8),
        jsHeapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      };
    });
    result.timings.renderer = timings;

    // Idle observation: does the renderer do work when untouched?
    const idleStart = await page.evaluate(() => performance.now());
    await sleep(5000);
    const idleEnd = await page.evaluate(() => performance.now());
    result.timings.idleWallMs = Math.round(idleEnd - idleStart);

    // Notebook navigation, measured from click to visible studio shell.
    result.navItems = await page.locator("button.sidebar-nav-item").evaluateAll((els) =>
      els.map((el, i) => ({ i, text: el.innerText.trim().slice(0, 40), html: el.outerHTML.slice(0, 300) }))
    );
    // Icon-only rail: match the icon rather than a positional index.
    const notebook = page.locator("button.sidebar-nav-item:has(svg.lucide-notebook-pen)").first();
    const navStart = Date.now();
    if (await notebook.count()) {
      await notebook.click({ timeout: 10000 }).catch((e) => events.push({ kind: "notebook-click-failed", message: String(e).slice(0, 200) }));
      result.timings.notebookClickMs = Date.now() - navStart;
      try {
        await page.waitForURL("**/notebook", { timeout: 10000 });
        await page.waitForTimeout(1500);
        result.timings.notebookReadyMs = Date.now() - navStart;
      } catch (e) {
        events.push({ kind: "notebook-not-ready", message: String(e).slice(0, 200) });
      }
      const state = await page.evaluate(() => ({
        url: location.href,
        text: document.body.innerText.slice(0, 400),
        domNodes: document.querySelectorAll("*").length,
        jsHeapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      })).catch((e) => ({ error: String(e).slice(0, 200) }));
      result.notebookState = state;
    } else {
      events.push({ kind: "notebook-link-missing" });
    }
    result.timings.totalMs = Date.now() - t0;
  } catch (e) {
    result.error = String(e?.stack ?? e).slice(0, 1000);
  } finally {
    clearInterval(sampleTimer);
    result.samples = samples;
    result.exit = exit;
    result.logFile = logFile;
    if (browser) await browser.close().catch(() => {});
    if (exit === null) {
      child.kill("SIGTERM");
      await Promise.race([new Promise((r) => child.once("exit", r)), sleep(3000)]);
      result.exit = exit ?? { signal: "SIGTERM (probe)", atMs: Date.now() - t0 };
    }
    fs.closeSync(log);
  }
  return result;
}

const report = { date: new Date().toISOString(), appRoot, iterations: [] };
for (let i = 0; i < iterations; i++) report.iterations.push(await runIteration(i));
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, iterations: report.iterations.map((i) => ({
  timings: i.timings, events: i.events?.slice(0, 20), exit: i.exit, error: i.error,
})) }, null, 2));
