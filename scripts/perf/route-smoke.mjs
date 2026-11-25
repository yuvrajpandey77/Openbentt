#!/usr/bin/env node
/**
 * Packaged-app route smoke: cold launch, visit primary routes, capture pageerrors + heap.
 * Usage: node scripts/perf/route-smoke.mjs [output.json]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.resolve(process.argv[2] ?? "/tmp/opencode/route-smoke.json");
const binary = process.env.OPENBENTT_PACKAGED_BINARY
  ?? path.join(appRoot, "release/linux-unpacked/openbentt");
const profileDir = fs.mkdtempSync("/tmp/opencode/route-smoke-");
const debugPort = 9222 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = [
  "/chat",
  "/projects",
  "/notebook?mode=orchestra",
  "/notebook?mode=editor",
  "/agent",
  "/files",
  "/tasks",
  "/documents",
  "/diagnostics",
  "/labs",
  "/settings",
  "/write",
  "/benchmark",
  "/setup",
  "/welcome",
];

const report = {
  startedAt: new Date().toISOString(),
  binary,
  profileDir,
  debugPort,
  routes: [],
  startup: {},
  summary: { ok: false, failed: 0, pageErrors: 0 },
};

function log(msg) {
  console.log(`[route-smoke] ${msg}`);
}

async function waitCdp(port, timeoutMs = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const j = await res.json();
        if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
      }
    } catch { /* retry */ }
    await sleep(100);
  }
  throw new Error("CDP never ready");
}

async function main() {
  if (!fs.existsSync(binary)) throw new Error(`Binary missing: ${binary}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const logFile = path.join(profileDir, "app.log");
  const logFd = fs.openSync(logFile, "w");
  const t0 = Date.now();
  const child = spawn(
    binary,
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--enable-software-rasterizer",
      "--disable-dev-shm-usage",
    ],
    {
      cwd: path.dirname(binary),
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: "1",
        HOME: profileDir,
        XDG_CONFIG_HOME: path.join(profileDir, ".config"),
        XDG_DATA_HOME: path.join(profileDir, ".local/share"),
        TMPDIR: path.join(profileDir, "tmp"),
      },
    }
  );
  let exit = null;
  child.on("exit", (code, signal) => {
    exit = { code, signal, atMs: Date.now() - t0 };
  });

  try {
    const endpoint = await waitCdp(debugPort);
    report.startup.cdpReadyMs = Date.now() - t0;
    log(`CDP ready in ${report.startup.cdpReadyMs}ms`);

    const browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    await context.addInitScript(() => {
      try {
        localStorage.setItem(
          "openbentt-onboarding-v1",
          JSON.stringify({ state: "READY", completed: true, updatedAt: new Date().toISOString() })
        );
      } catch { /* ignore */ }
    });

    let page = context.pages().find((p) => /^(file|app|http|https):/.test(p.url()));
    if (!page) page = await context.waitForEvent("page", { timeout: 20000 });

    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 400)));
    page.on("console", (msg) => {
      if (msg.type() === "error") pageErrors.push(`console: ${msg.text()}`.slice(0, 400));
    });

    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForSelector("button.sidebar-nav-item, [data-sidebar], nav, body", { timeout: 45000 });
    report.startup.shellReadyMs = Date.now() - t0;
    log(`Shell ready in ${report.startup.shellReadyMs}ms`);

    for (const route of ROUTES) {
      const entry = { route, ok: false, ms: 0, errors: [], heapUsedMB: null, url: null };
      const r0 = Date.now();
      try {
        pageErrors.length = 0;
        await page.goto(`app://openbentt${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForSelector("body", { timeout: 15000 });
        await sleep(700);
        entry.url = page.url();
        await page.waitForFunction(() => {
          const body = document.body?.innerText ?? "";
          return body.length > 20;
        }, { timeout: 15000 }).catch(() => {});

        const bodyText = await page.evaluate(() => (document.body?.innerText ?? "").slice(0, 800));
        const crashed = /Something went wrong|Cannot access '| is not defined|out of memory|Maximum call stack|ReferenceError/i.test(bodyText);
        const routeErrors = [...pageErrors];
        entry.errors = routeErrors.filter(
          (e) => !/ServiceWorker|Favicon|net::ERR|Download the React DevTools|DevTools failed/i.test(e)
        );
        entry.heapUsedMB = await page.evaluate(() => {
          try {
            // Chromium exposes performance.memory in Electron
            const mem = performance.memory;
            return mem ? Math.round(mem.usedJSHeapSize / 1048576) : null;
          } catch {
            return null;
          }
        });
        entry.ms = Date.now() - r0;
        entry.ok = !crashed && entry.errors.length === 0;
        if (crashed) entry.errors.push(`crash-text: ${bodyText.slice(0, 160)}`);
        log(`${entry.ok ? "OK" : "FAIL"} ${route} ${entry.ms}ms heap=${entry.heapUsedMB ?? "?"}MB errors=${entry.errors.length}`);
      } catch (e) {
        entry.ms = Date.now() - r0;
        entry.errors.push(String(e).slice(0, 300));
        log(`FAIL ${route}: ${e}`);
      }
      report.routes.push(entry);
      if (!entry.ok) report.summary.failed += 1;
      report.summary.pageErrors += entry.errors.length;
    }

    report.startup.marks = await page.evaluate(() => window.__openbenttStartupMarks?.dump?.() ?? null);
    report.summary.ok = report.summary.failed === 0;
    await browser.close().catch(() => {});
  } finally {
    try {
      child.kill("SIGTERM");
    } catch { /* ignore */ }
    await sleep(1500);
    if (exit == null) {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
    }
    report.exit = exit;
    report.finishedAt = new Date().toISOString();
    report.logTail = (() => {
      try {
        const t = fs.readFileSync(logFile, "utf8");
        return t.slice(-6000);
      } catch {
        return "";
      }
    })();
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    log(`Wrote ${output} ok=${report.summary.ok}`);
  }

  if (!report.summary.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
