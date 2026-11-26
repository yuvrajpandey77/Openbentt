#!/usr/bin/env node
/**
 * Capture dark-mode Notebook Editor hero with compiled PDF preview.
 * Usage: node scripts/capture-marketing-hero.mjs [cdpPort]
 * Default: spawns built Electron on a free port (no existing app required).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { chromium } from "playwright-core";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(appRoot, "public", "marketing");
const distIndex = path.join(appRoot, "dist", "index.html");
const packagedBinary =
  process.env.OPENBENTT_PACKAGED_BINARY ?? path.join(appRoot, "release", "linux-unpacked", "openbentt");
const useExistingPort = process.argv[2] ? Number(process.argv[2]) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      server.close(() => resolve(addr.port));
    });
  });
}

const MAIN_TEX = String.raw`\documentclass[11pt]{article}
\usepackage{amsmath,amssymb,graphicx}
\usepackage[margin=1in]{geometry}
\title{Scaling Local-First Research Workflows with On-Device Compilation}
\author{Anonymous Authors}
\date{November 2026}
\begin{document}
\maketitle
\begin{abstract}
We study how researchers can author LaTeX, compile PDFs, and run local language models without shipping prompts to the cloud.
Our prototype integrates a split-pane notebook, citation libraries, and WASM or native TeX backends.
On a consumer workstation we observe sub-minute compile times for conference-length drafts while preserving full offline operation.
\end{abstract}
\section{Introduction}
Scientific writing demands tight iteration between source and PDF preview.
Cloud-centric editors sacrifice privacy; desktop tools often lack integrated AI assistance.
We argue for a \emph{local-first} workspace where compilation, retrieval, and inference share one machine-local data plane.
\section{Methods}
The system couples a CodeMirror LaTeX surface to pdf.js rendering.
Compilation routes through tectonic or BusyTeX WASM with optional host \texttt{pdflatex}.
Projects persist as SQLite records with attached PDF blobs and BibTeX corpora.
\section{Experiments}
We measure cold and warm compile latency on a 16-core Linux host.
Warm compiles of eight-page articles complete in under four seconds using tectonic.
Memory stays bounded when preview pages are virtualized.
\section{Related work}
Prior tools separate writing, reference management, and model chat across disjoint applications.
Our design unifies them behind a single Electron shell with capability-scoped IPC.
\section{Conclusion}
Local-first notebook environments can match cloud UX for LaTeX-centric research while keeping data on device.
Future work includes collaborative CRDT drafts and GPU-accelerated embedding indexes.
\begin{equation}
  \mathcal{L}(\theta) = -\sum_{i=1}^{N} \log p_\theta(y_i \mid x_i)
\end{equation}
\bibliographystyle{plain}
\begin{thebibliography}{9}
\bibitem{vaswani2017} Vaswani et al. \emph{Attention Is All You Need}. NeurIPS 2017.
\bibitem{localfirst} Ink \& Switch. \emph{Local-first software}. 2019.
\end{thebibliography}
\end{document}
`;

async function waitCdp(p, timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${p}/json/version`);
      if (res.ok) {
        const j = await res.json();
        if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
      }
    } catch {
      /* retry */
    }
    await sleep(80);
  }
  throw new Error(`CDP not available on port ${p}`);
}

async function main() {
  if (!fs.existsSync(distIndex)) {
    console.error(`Build first: missing ${distIndex}`);
    process.exit(1);
  }

  let child = null;
  let profileDir = null;
  const port = useExistingPort ?? (await freePort());
  if (!useExistingPort) {
    profileDir = `/tmp/opencode/obt-hero-capture-${process.pid}`;
    fs.mkdirSync(profileDir, { recursive: true });
    const usePackaged = fs.existsSync(packagedBinary);
    const bin = usePackaged ? packagedBinary : electron;
    const args = usePackaged
      ? [
          `--remote-debugging-port=${port}`,
          `--user-data-dir=${profileDir}`,
          "--no-first-run",
          "--disable-gpu",
          "--disable-dev-shm-usage",
        ]
      : [
          ".",
          `--remote-debugging-port=${port}`,
          `--user-data-dir=${profileDir}`,
          "--no-first-run",
          "--disable-gpu",
          "--disable-gpu-compositing",
          "--enable-software-rasterizer",
          "--disable-dev-shm-usage",
        ];
    child = spawn(bin, args, {
      cwd: usePackaged ? path.dirname(packagedBinary) : appRoot,
      stdio: "ignore",
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
    });
  }

  let endpoint;
  try {
    endpoint = await waitCdp(port, useExistingPort ? 8000 : 60000);
  } catch (e) {
    child?.kill("SIGTERM");
    throw e;
  }

  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  let page = context.pages().find((pg) => /^(file|app|http|https):/.test(pg.url()));
  if (!page) page = await context.waitForEvent("page", { timeout: 15000 });

  await context.addInitScript(() => {
    try {
      localStorage.setItem("theme", "dark");
      localStorage.setItem(
        "openbentt-onboarding-v1",
        JSON.stringify({ state: "READY", completed: true, updatedAt: new Date().toISOString() })
      );
      localStorage.setItem(
        "openbentt-notebook-compile-settings",
        JSON.stringify({ backend: "auto", applyDocumentStyle: true })
      );
    } catch {
      /* ignore */
    }
  });

  await page.goto("app://openbentt/notebook?mode=editor", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.evaluate(() => {
    try {
      localStorage.setItem("theme", "dark");
      localStorage.removeItem("openbentt-notebook-explorer-open-v2");
    } catch {
      /* ignore */
    }
    document.documentElement.classList.add("dark");
  });

  const seed = await page.evaluate(async (draftTex) => {
    const api = window.openbenttResearch;
    if (!api) return { ok: false, reason: "no research api" };
    const now = new Date().toISOString();
    let id = await api.getActiveProjectId().catch(() => null);
    let project = id ? await api.loadProject(id).catch(() => null) : null;
    if (!project) {
      const list = await api.listProjects();
      if (list.length) {
        id = list[0].id;
        project = await api.loadProject(id);
      }
    }
    if (!project) {
      id = crypto.randomUUID();
      project = {
        id,
        title: "Marketing hero draft",
        createdAt: now,
        updatedAt: now,
        targetVenue: "generic",
        linkedThreadIds: [],
        knowledge: "",
        draftTex: draftTex,
        bibliography: "",
        bibEntries: [],
        papers: [],
        chunks: [],
        revisionSuggestions: [],
        modelAttributions: [],
        abstractVariants: [],
        keywordSuggestions: [],
        captionSuggestions: [],
        projectFiles: [],
      };
    } else {
      project.title = "Marketing hero draft";
      project.draftTex = draftTex;
      project.updatedAt = now;
    }
    await api.saveProject(project);
    await api.setActiveProjectId(id);
    await api.patchDraft(id, draftTex);
    return { ok: true, projectId: id, draftLen: draftTex.length };
  }, MAIN_TEX);

  if (!seed.ok) {
    throw new Error(`seed failed: ${seed.reason ?? "unknown"}`);
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.goto("app://openbentt/notebook?mode=editor", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("[data-notebook-studio]", { timeout: 45000 });
  await page.waitForSelector(".cm-editor, .cm-content", { timeout: 45000 });
  await page.waitForFunction(
    () => (document.querySelector(".cm-content")?.textContent ?? "").includes("\\documentclass"),
    { timeout: 30000 }
  );
  await sleep(800);

  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
  });

  const compileBtn = page.getByRole("button", { name: /^Compile$/ }).first();
  await compileBtn.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Compile");
      return btn && !btn.disabled;
    },
    { timeout: 30000 }
  );
  await compileBtn.click({ force: true });

  let pdfReady = false;
  try {
    await page.waitForFunction(
      () => {
        const preview = document.querySelector("[data-notebook-preview]");
        const canvasCount = (preview ?? document).querySelectorAll("canvas").length;
        return canvasCount > 0 && !/No PDF open/.test(document.body.innerText);
      },
      { timeout: 120000 }
    );
    pdfReady = true;
  } catch {
    const productPdf = path.join(appRoot, "docs", "PRODUCT_DOC.pdf");
    if (fs.existsSync(productPdf)) {
      await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(productPdf);
      await page.waitForFunction(
        () => document.querySelectorAll("[data-notebook-preview] canvas").length > 0,
        { timeout: 60000 }
      );
      pdfReady = true;
    }
  }

  if (!pdfReady) throw new Error("PDF preview never became ready");

  await sleep(1500);

  const shotPath = path.join(outDir, "openbentt-app-card.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(400);
  await page.screenshot({ path: shotPath, type: "png", fullPage: false });

  for (const name of ["openbentt-hero.png", "openbentt-launch-hero.png"]) {
    fs.copyFileSync(shotPath, path.join(outDir, name));
  }

  const verify = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    noPdfOpen: /No PDF open/.test(document.body.innerText),
    canvasCount: document.querySelectorAll("canvas").length,
    url: location.href,
  }));

  console.log(JSON.stringify({ shotPath, seed, verify, profileDir, port }, null, 2));
  await browser.close().catch(() => {});
  if (child) {
    child.kill("SIGTERM");
    await sleep(800);
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});