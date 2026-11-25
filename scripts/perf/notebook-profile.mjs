/**
 * Notebook startup performance profile (Phase C).
 *
 * Launches the BUILT Electron app with an isolated --user-data-dir and CDP,
 * then measures real Notebook lifecycle marks from
 * `window.__openbenttNotebookMarks` (backed by performance.mark/measure).
 * No phase duration is inferred from wall-clock guesses: CDP only waits for
 * the marks and copies the renderer's breakdown. Harness-side wall-clock
 * values (click latency, total probe time) are reported separately.
 *
 * Scenarios (each cold in its own app process, then warm in the same process):
 *   empty      - default project with no papers
 *   existing   - moderate draft (~24k chars), no papers
 *   large      - large draft (~400k chars), no papers
 *   pdf-heavy  - moderate draft + 24-page synthetic PDF opened via ?paper=
 *
 * Usage:
 *   npm run build
 *   node scripts/perf/notebook-profile.mjs [output.json] [scenario,...]
 *
 * Defaults: /tmp/opencode/notebook-profile.json and all four scenarios.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { chromium } from "playwright-core";
import { jsPDF } from "jspdf";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.resolve(process.argv[2] ?? "/tmp/opencode/notebook-profile.json");
const requested = (process.argv[3] ?? "empty,existing,large,pdf-heavy")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const distIndex = path.join(appRoot, "dist", "index.html");

fs.mkdirSync(path.dirname(output), { recursive: true });
if (!fs.existsSync(distIndex)) {
  console.error(`No built app at ${distIndex}. Run \`npm run build\` first.`);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (n) => Math.round(n * 100) / 100;

/** Pick a currently free port so the probe never attaches to another app's CDP. */
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

function makeDraft(chars) {
  let s = "\\documentclass{article}\n\\begin{document}\n";
  let section = 0;
  const paragraph = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor. ".repeat(8);
  while (s.length < chars) {
    section += 1;
    s += `\\section{Section ${section}}\n${paragraph}\n`;
  }
  return `${s}\\end{document}\n`;
}

function makePdfBase64(pages) {
  const doc = new jsPDF();
  for (let i = 0; i < pages; i += 1) {
    if (i) doc.addPage();
    doc.setFontSize(18);
    doc.text(`Phase C stress PDF - page ${i + 1} of ${pages}`, 20, 24);
    doc.setFontSize(10);
    doc.text("Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(6), 20, 40);
  }
  return Buffer.from(doc.output("arraybuffer")).toString("base64");
}

const SCENARIOS = {
  empty: { draftChars: 0, pdfPages: 0 },
  existing: { draftChars: 24_000, pdfPages: 0 },
  large: { draftChars: 400_000, pdfPages: 0 },
  "pdf-heavy": { draftChars: 24_000, pdfPages: Number(process.env.NOTEBOOK_PDF_PAGES ?? 24) },
};

function unknownScenario(name) {
  console.error(`Unknown scenario "${name}". Available: ${Object.keys(SCENARIOS).join(", ")}`);
  process.exit(1);
}
requested.forEach((name) => { if (!SCENARIOS[name]) unknownScenario(name); });

/** Seed the isolated research DB through the app's own IPC, not by guessing files. */
async function seedProject(page, name) {
  const spec = SCENARIOS[name];
  if (!spec.draftChars && !spec.pdfPages) {
    return page.evaluate(async () => {
      const api = window.openbenttResearch;
      if (!api) return { seeded: false, reason: "research IPC unavailable" };
      const list = await api.listProjects();
      return { seeded: false, reason: "empty scenario uses the default startup project", projectCount: list.length };
    });
  }

  const paperId = randomUUID();
  const pdfBase64 = spec.pdfPages ? makePdfBase64(spec.pdfPages) : null;
  const draftTex = makeDraft(spec.draftChars);
  return page.evaluate(
    async ({ draftTex, pdfBase64, paperId, pdfPages, name }) => {
      const api = window.openbenttResearch;
      if (!api) return { seeded: false, reason: "research IPC unavailable" };
      const list = await api.listProjects();
      let id = await api.getActiveProjectId().catch(() => null);
      let project = id ? await api.loadProject(id).catch(() => null) : null;
      if (!project && list.length) {
        id = list[0].id;
        project = await api.loadProject(id).catch(() => null);
      }
      const now = new Date().toISOString();
      if (!project) {
        id = crypto.randomUUID();
        project = {
          id,
          title: `Phase C ${name}`,
          createdAt: now,
          updatedAt: now,
          targetVenue: "generic",
          linkedThreadIds: [],
          knowledge: "",
          draftTex: "",
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
      }
      project.title = `Phase C ${name}`;
      project.draftTex = draftTex;
      project.updatedAt = now;
      project.papers = pdfBase64
        ? [
            {
              id: paperId,
              fileName: "phase-c-stress.pdf",
              addedAt: now,
              extractedText: `Synthetic ${pdfPages}-page PDF for Notebook performance profiling.`,
              pageCount: pdfPages,
              metadata: { title: "Phase C stress PDF" },
            },
          ]
        : [];
      if (pdfBase64) {
        const stored = await api.storePaperPdf(id, paperId, pdfBase64);
        if (!stored?.ok) return { seeded: false, reason: "storePaperPdf failed", detail: stored };
      }
      await api.saveProject(project);
      await api.setActiveProjectId(id);
      return {
        seeded: true,
        projectId: id,
        draftChars: draftTex.length,
        papers: project.papers.length,
        pdfPages: pdfBase64 ? pdfPages : 0,
      };
    },
    { draftTex, pdfBase64, paperId, pdfPages: spec.pdfPages, name }
  );
}

async function loadCollector(page) {
  return page.evaluate(() => {
    const api = window.__openbenttNotebookMarks;
    if (!api) return { error: "collector not installed" };
    const nativeMarks = performance
      .getEntriesByType("mark")
      .filter((e) => e.name.startsWith("openbentt.notebook."))
      .map((e) => ({ name: e.name, startTimeMs: Math.round(e.startTime * 100) / 100 }));
    const nativeMeasures = performance
      .getEntriesByType("measure")
      .filter((e) => e.name.startsWith("openbentt.notebook.segment."))
      .map((e) => ({ name: e.name, durationMs: Math.round(e.duration * 100) / 100 }));
    return { breakdown: api.getBreakdown(), nativeMarks, nativeMeasures };
  });
}

async function resetCollector(page) {
  await page.evaluate(() => window.__openbenttNotebookMarks?.reset?.());
}

async function waitForMark(page, name, timeoutMs, waitErrors) {
  try {
    await page.waitForFunction(
      (target) => {
        const api = window.__openbenttNotebookMarks;
        return !!api && api.getEntries().some((e) => e.name === target);
      },
      name,
      { timeout: timeoutMs }
    );
    return true;
  } catch (error) {
    waitErrors.push({ mark: name, message: String(error).slice(0, 300) });
    return false;
  }
}

async function navigateToNotebook(page, events, label) {
  const before = await page.evaluate(() => ({
    perfNow: performance.now(),
    url: location.href,
  }));
  // If AppLayout is wired, this is a no-op (markOnce); otherwise it supplies
  // the authoritative navigation timestamp from the harness itself.
  await page.evaluate((from) => {
    window.__openbenttNotebookMarks?.navigationInitiated?.({ source: from });
  }, label);
  const notebook = page.locator("button.sidebar-nav-item:has(svg.lucide-notebook-pen)").first();
  if (!(await notebook.count())) {
    events.push({ kind: "notebook-nav-missing", scenario: label });
    return { clicked: false, before };
  }
  await notebook.click({ timeout: 12000 });
  return { clicked: true, before, clickWallAt: Date.now(), clickPerfNow: await page.evaluate(() => performance.now()) };
}

async function openPaperByUrl(page, paperId) {
  return page.evaluate((id) => {
    window.__openbenttNotebookMarks?.navigationInitiated?.({ source: "CDP harness (paper open)" });
    window.dispatchEvent(new CustomEvent("navigate", { detail: `/notebook?paper=${id}` }));
    return { dispatched: true, atPerfNow: performance.now() };
  }, paperId);
}

async function runScenario(name) {
  const port = await freePort();
  const launchProfile = `/tmp/opencode/obt-nb-profile-${name}-${process.pid}`;
  fs.mkdirSync(launchProfile, { recursive: true });
  const logFile = `/tmp/opencode/obt-nb-profile-${name}-${process.pid}.log`;
  const log = fs.openSync(logFile, "w");
  const t0 = Date.now();
  const events = [];
  const waitErrors = [];
  let exit = null;
  const child = spawn(
    electron,
    [
      ".",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${launchProfile}`,
      "--no-first-run",
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--enable-software-rasterizer",
      "--disable-dev-shm-usage",
    ],
    { cwd: appRoot, stdio: ["ignore", log, log], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" } }
  );
  child.on("exit", (code, signal) => { exit = { code, signal, atMs: Date.now() - t0 }; });

  const result = {
    name,
    kind: name,
    profile: launchProfile,
    logFile,
    seed: null,
    cold: null,
    warm: null,
    pdfOpen: null,
    events,
    waitErrors,
    timings: {},
    exit: null,
  };
  let browser;
  try {
    let endpoint = null;
    for (let i = 0; i < 240; i += 1) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) {
          endpoint = (await res.json()).webSocketDebuggerUrl;
          if (endpoint) break;
        }
      } catch { /* CDP not up yet */ }
      await sleep(50);
    }
    result.timings.cdpReadyMs = Date.now() - t0;
    if (!endpoint) throw new Error("CDP endpoint never appeared");

    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    await context.addInitScript(() => {
      try {
        localStorage.setItem(
          "openbentt-onboarding-v1",
          JSON.stringify({ state: "READY", completed: true, updatedAt: new Date().toISOString() })
        );
      } catch { /* file:// storage unavailable */ }
    });
    let page = context.pages().find((p) => /^(file|app|http|https):/.test(p.url()));
    if (!page) page = await context.waitForEvent("page", { timeout: 15000 });
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    page.on("crash", () => events.push({ kind: "page-crash", scenario: name }));
    page.on("pageerror", (e) => events.push({ kind: "page-error", message: String(e).slice(0, 400) }));
    page.on("console", (m) => {
      if (m.type() === "error") events.push({ kind: "console-error", message: m.text().slice(0, 300) });
    });
    await page.waitForSelector("button.sidebar-nav-item", { timeout: 30000 });

    result.seed = await seedProject(page, name);
    // Reload so ResearchProjectContext loads the seeded active project from the
    // isolated DB; this also gives every scenario a fresh renderer timeline.
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForSelector("button.sidebar-nav-item", { timeout: 30000 });
    result.timings.seededReloadMs = Date.now() - t0;
    // Capture the seeded startup project load BEFORE measureNav() resets the
    // collector. This is where projectLoadingStarted/databaseResponseReceived
    // are emitted by ResearchProjectContext.
    result.startupLoad = await loadCollector(page);

    const measureNav = async (label) => {
      await resetCollector(page);
      const nav = await navigateToNotebook(page, events, label);
      if (!nav.clicked) return { nav, collector: await loadCollector(page) };
      await page.waitForSelector("[data-notebook-studio]", { timeout: 20000 }).catch((e) => {
        waitErrors.push({ mark: "data-notebook-studio", message: String(e).slice(0, 300) });
      });
      await waitForMark(page, "notebook interactive", 20000, waitErrors);
      return {
        nav,
        collector: await loadCollector(page),
        dom: await page.evaluate(() => ({
          url: location.href,
          studio: !!document.querySelector("[data-notebook-studio]"),
          preview: !!document.querySelector("[data-notebook-preview]"),
          domNodes: document.querySelectorAll("*").length,
          jsHeapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        })),
      };
    };

    result.cold = await measureNav(`${name}-cold`);

    // Warm: leave Notebook and come back in the same renderer process.
    const chat = page.locator("button.sidebar-nav-item:has(svg.lucide-message-square)").first();
    if (await chat.count()) {
      await chat.click({ timeout: 12000 });
      await page.waitForURL("**/chat", { timeout: 12000 }).catch((e) => {
        waitErrors.push({ step: "warm-chat", message: String(e).slice(0, 300) });
      });
      result.warm = await measureNav(`${name}-warm`);
    } else {
      events.push({ kind: "chat-nav-missing", scenario: name });
    }

    if (name === "pdf-heavy" && result.seed?.seeded && result.seed.pdfPages > 0) {
      // Reset so PDF phases are not polluted by navigation/setup work. The
      // nav-phase breakdown is preserved in result.cold / result.warm above.
      await resetCollector(page);
      const paperId = await page.evaluate(async () => {
        const api = window.openbenttResearch;
        const id = await api.getActiveProjectId();
        const project = id ? await api.loadProject(id) : null;
        return project?.papers?.[0]?.id ?? null;
      });
      if (!paperId) {
        waitErrors.push({ step: "pdf-paper-lookup", message: "seeded paper id not found in active project" });
      }
      const trigger = paperId ? await openPaperByUrl(page, paperId) : { dispatched: false };
      await waitForMark(page, "first page rendered", 30000, waitErrors);
      result.pdfOpen = {
        trigger,
        collector: await loadCollector(page),
        dom: await page.evaluate(() => ({
          url: location.href,
          canvasCount: document.querySelectorAll("canvas").length,
          preview: !!document.querySelector("[data-notebook-preview]"),
        })),
      };
    }

    result.timings.totalMs = Date.now() - t0;
  } catch (e) {
    result.error = String(e?.stack ?? e).slice(0, 1200);
  } finally {
    result.exit = exit;
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

const report = {
  schema: "openbentt.notebook.profile.v1",
  date: new Date().toISOString(),
  appRoot,
  distIndex,
  scenarios: requested,
  note: "Phase durations come from window.__openbenttNotebookMarks (performance.mark). Harness timing fields are wall-clock and labeled separately.",
  runs: [],
};
for (const name of requested) {
  process.stderr.write(`[notebook-profile] ${name}: launching isolated app\n`);
  report.runs.push(await runScenario(name));
}
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      output,
      runs: report.runs.map((r) => ({
        name: r.name,
        seed: r.seed,
        cold: r.cold?.collector?.breakdown?.segments ?? null,
        warm: r.warm?.collector?.breakdown?.segments ?? null,
        pdfOpen: r.pdfOpen?.collector?.breakdown?.segments ?? null,
        events: r.events.slice(0, 10),
        waitErrors: r.waitErrors.slice(0, 10),
        error: r.error,
      })),
    },
    null,
    2
  )
);
