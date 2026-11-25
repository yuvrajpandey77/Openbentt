/**
 * Startup critical-path profiler (Phase 3/F).
 *
 * Cold = fresh isolated user-data-dir; warm = same profile relaunched.
 * Collects main-process service registration timings from the app log and
 * renderer marks from window.__openbenttStartupMarks. No artificial delays.
 *
 * Usage: node scripts/perf/startup-profile.mjs [output.json] [iterationsPerMode]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { chromium } from "playwright-core";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.resolve(process.argv[2] ?? "/tmp/opencode/startup-profile.json");
const iterations = Number(process.argv[3] ?? 2);
const baseDir = "/tmp/opencode/openbentt-startup-profile";
fs.mkdirSync(baseDir, { recursive: true });
fs.mkdirSync(path.dirname(output), { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runOnce(mode, profileDir, index, debugPort) {
  const t0 = Date.now();
  const logFile = path.join(baseDir, `${mode}-${index}-${process.pid}.log`);
  const log = fs.openSync(logFile, "w");
  let browser;
  let exit = null;
  const result = { mode, index, profileDir, logFile, timings: {}, renderer: null, main: null, events: [], exit: null };
  const child = spawn(
    electron,
    [".", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`,
      "--no-first-run", "--disable-gpu", "--disable-gpu-compositing",
      "--enable-software-rasterizer", "--disable-dev-shm-usage"],
    { cwd: appRoot, stdio: ["ignore", log, log], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" } }
  );
  child.on("exit", (code, signal) => { exit = { code, signal, atMs: Date.now() - t0 }; });

  try {
    let endpoint = null;
    for (let i = 0; i < 200; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        if (res.ok) {
          endpoint = (await res.json()).webSocketDebuggerUrl;
          if (endpoint) break;
        }
      } catch { /* not listening yet */ }
      await sleep(50);
    }
    result.timings.cdpReadyMs = Date.now() - t0;
    if (!endpoint) throw new Error("CDP endpoint never appeared");
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    await context.addInitScript(() => {
      try {
        localStorage.setItem("openbentt-onboarding-v1", JSON.stringify({ state: "READY", completed: true, updatedAt: new Date().toISOString() }));
      } catch { /* storage unavailable */ }
    });
    let page = context.pages().find((p) => /^(file|app|http|https):/.test(p.url()));
    if (!page) page = await context.waitForEvent("page", { timeout: 15000 });
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    result.timings.pageAttachedMs = Date.now() - t0;
    page.on("pageerror", (e) => result.events.push({ kind: "page-error", message: String(e).slice(0, 300) }));
    await page.waitForSelector("button.sidebar-nav-item", { timeout: 30000 });
    result.timings.sidebarReadyMs = Date.now() - t0;
    result.renderer = await page.evaluate(() => {
      const dump = window.__openbenttStartupMarks?.dump?.() ?? null;
      const nav = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      return {
        marks: dump?.marks ?? [],
        navigation: nav ? {
          responseEnd: Math.round(nav.responseEnd),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
          loadEvent: Math.round(nav.loadEventEnd),
        } : null,
        resourceCount: resources.length,
        largestResources: resources
          .map((r) => ({ name: r.name.split("/").pop(), size: r.transferSize }))
          .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
          .slice(0, 6),
        jsHeapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      };
    });
    result.timings.totalMs = Date.now() - t0;
  } catch (error) {
    result.error = String(error?.stack ?? error).slice(0, 1000);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (exit === null) {
      child.kill("SIGTERM");
      await Promise.race([new Promise((r) => child.once("exit", r)), sleep(3000)]);
    }
    result.exit = exit;
    fs.closeSync(log);
  }
  const logText = fs.readFileSync(logFile, "utf8");
  const mainLine = logText.split("\n").find((line) => line.includes("[startup][main]"));
  if (mainLine) {
    try {
      result.main = JSON.parse(mainLine.slice(mainLine.indexOf("{")));
    } catch {
      result.main = { raw: mainLine.slice(0, 2000) };
    }
  }
  return result;
}

const report = { date: new Date().toISOString(), appRoot, iterations, cold: [], warm: [] };
for (let i = 0; i < iterations; i++) {
  const profile = path.join(baseDir, `cold-${i}-${process.pid}`);
  fs.mkdirSync(profile, { recursive: true });
  report.cold.push(await runOnce("cold", profile, i, 9400 + (process.pid % 50)));
}
const warmProfile = path.join(baseDir, `warm-${process.pid}`);
fs.mkdirSync(warmProfile, { recursive: true });
for (let i = 0; i < iterations; i++) {
  // First warm launch seeds the profile; subsequent launches reuse it.
  report.warm.push(await runOnce("warm", warmProfile, i, 9500 + (process.pid % 50)));
}
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  output,
  cold: report.cold.map((r) => ({ timings: r.timings, renderer: r.renderer, main: r.main, error: r.error })),
  warm: report.warm.map((r) => ({ timings: r.timings, renderer: r.renderer, main: r.main, error: r.error })),
}, null, 2));
