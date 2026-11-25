#!/usr/bin/env node
/**
 * Packaged-app Notebook compile smoke via research:compileProjectLatex IPC.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const binary = process.env.OPENBENTT_PACKAGED_BINARY ?? path.join(appRoot, "release/linux-unpacked/openbentt");
const output = path.resolve(process.argv[2] ?? "/tmp/opencode/notebook-compile-smoke.json");
const profileDir = fs.mkdtempSync("/tmp/opencode/notebook-compile-");
const debugPort = 9333 + Math.floor(Math.random() * 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TEX = String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\title{Openbentt Notebook Compile Smoke}
\author{Verifier}
\maketitle
\section{Intro}
Lightweight tectonic path should finish quickly after cache warm.
\begin{equation}
  e^{i\pi} + 1 = 0
\end{equation}
\end{document}
`;

const report = { startedAt: new Date().toISOString(), binary, profileDir, runs: [], summary: { ok: false } };

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
  if (!fs.existsSync(binary)) throw new Error(`missing ${binary}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const logFile = path.join(profileDir, "app.log");
  const logFd = fs.openSync(logFile, "w");
  const child = spawn(
    binary,
    [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--disable-gpu", "--disable-dev-shm-usage"],
    {
      cwd: path.dirname(binary),
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1", HOME: profileDir, TMPDIR: path.join(profileDir, "tmp") },
    }
  );

  try {
    const endpoint = await waitCdp(debugPort);
    const browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    await context.addInitScript(() => {
      try {
        localStorage.setItem("openbentt-onboarding-v1", JSON.stringify({ state: "READY", completed: true, updatedAt: new Date().toISOString() }));
        localStorage.setItem("openbentt-notebook-compile-settings", JSON.stringify({ backend: "local", applyDocumentStyle: true }));
      } catch { /* ignore */ }
    });
    let page = context.pages().find((p) => /^(file|app|http|https):/.test(p.url()));
    if (!page) page = await context.waitForEvent("page", { timeout: 20000 });
    await page.goto("app://openbentt/notebook?mode=editor", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("body", { timeout: 30000 });
    await sleep(1200);

    const hasApi = await page.evaluate(() => Boolean(window.openbenttResearch?.compileProjectLatex));
    report.hasCompileApi = hasApi;
    if (!hasApi) throw new Error("openbenttResearch.compileProjectLatex missing");

    for (const label of ["cold", "warm"]) {
      const t0 = Date.now();
      const result = await page.evaluate(async (tex) => {
        const r = await window.openbenttResearch.compileProjectLatex({
          mainTex: tex,
          mainPath: "main.tex",
          files: [],
          bibtex: false,
        });
        return {
          ok: Boolean(r?.ok),
          pdfBytes: r?.base64 ? Math.floor((r.base64.length * 3) / 4) : 0,
          message: r?.ok ? null : String(r?.message ?? "").slice(0, 500),
        };
      }, TEX);
      report.runs.push({ label, ms: Date.now() - t0, ...result });
      console.log(`[notebook-compile] ${label}: ok=${result.ok} ${Date.now() - t0}ms pdf≈${result.pdfBytes}B`);
    }

    report.summary.ok = report.runs.every((r) => r.ok) && (report.runs.find((r) => r.label === "warm")?.ms ?? 999999) < 20000;
    await browser.close().catch(() => {});
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    await sleep(1200);
    try { child.kill("SIGKILL"); } catch { /* ignore */ }
    report.finishedAt = new Date().toISOString();
    report.logTail = (() => {
      try { return fs.readFileSync(logFile, "utf8").slice(-4000); } catch { return ""; }
    })();
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(`[notebook-compile] wrote ${output} ok=${report.summary.ok}`);
  }
  if (!report.summary.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
