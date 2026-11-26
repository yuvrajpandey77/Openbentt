/**
 * PaperOrchestra sidecar — runs the intact Python CLI without gutting agents.
 * Spawns paper_writing_cli.py with the full flag surface; streams progress to the UI.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  findSystemPython,
  installPaperOrchestraEngine,
  paperEngineVenvPython,
} from "./paperOrchestraInstall.mjs";
import { applyPaperOrchestraCredentials } from "./paperOrchestraCredentials.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENUES = new Set(["cvpr2025", "iclr2025"]);

/** @type {import('electron').BrowserWindow | null} */
let progressWindow = null;
/** @type {import('node:child_process').ChildProcess | null} */
let activeChild = null;
/** @type {string | null} */
let activeRunId = null;
let installInFlight = false;

const LOG_BUFFER_MAX = 300;
/** @type {string[]} */
let logBuffer = [];
/** @type {string} */
let currentStage = "idle";
/** @type {string | null} */
let lastOutputDir = null;
/** @type {{ done: boolean, ok: boolean | null, message: string | null } | null} */
let lastFinish = null;

/** @param {import('electron').BrowserWindow | null} win */
export function setPaperOrchestraProgressTarget(win) {
  progressWindow = win;
}

function pushLogLine(message) {
  const line = String(message ?? "").slice(0, 800);
  if (!line.trim()) return;
  logBuffer.push(line);
  if (logBuffer.length > LOG_BUFFER_MAX) {
    logBuffer = logBuffer.slice(-LOG_BUFFER_MAX);
  }
}

function resetRunBuffer() {
  logBuffer = [];
  currentStage = "starting";
  lastOutputDir = null;
  lastFinish = null;
}

function send(payload) {
  try {
    if (payload?.message) pushLogLine(payload.message);
    if (payload?.stage && payload.stage !== "log" && payload.stage !== "install") {
      currentStage = String(payload.stage);
    }
    if (payload?.outputDir) lastOutputDir = String(payload.outputDir);
    if (payload?.done) {
      lastFinish = {
        done: true,
        ok: payload.ok !== false,
        message: payload.message ? String(payload.message).slice(0, 500) : null,
      };
      if (payload.stage) currentStage = String(payload.stage);
    }
    if (progressWindow && !progressWindow.isDestroyed()) {
      progressWindow.webContents.send("paperOrchestra:progress", payload);
    }
  } catch { /* window gone */ }
}

export function resolveOrchestraRoot(app) {
  const env = process.env.OPENBENTT_PAPER_ORCHESTRA_ROOT?.trim();
  if (env && fs.existsSync(path.join(env, "paper_writing_cli.py"))) return env;
  if (app?.isPackaged && process.resourcesPath) {
    const packaged = path.join(process.resourcesPath, "paper-orchestra");
    if (fs.existsSync(path.join(packaged, "paper_writing_cli.py"))) return packaged;
  }
  const repo = path.join(__dirname, "..", "paper-orchestra-main");
  if (fs.existsSync(path.join(repo, "paper_writing_cli.py"))) return repo;
  return null;
}

/** Prefer env → userData engine venv → tree .venv → bare system python (not ideal for deps). */
function resolvePython(root, app) {
  const envPy = process.env.OPENBENTT_PAPER_ORCHESTRA_PYTHON?.trim();
  if (envPy && fs.existsSync(envPy)) return envPy;
  if (app) {
    const enginePy = paperEngineVenvPython(app);
    if (enginePy) return enginePy;
  }
  const venvUnix = path.join(root, ".venv", "bin", "python");
  const venvWin = path.join(root, ".venv", "Scripts", "python.exe");
  if (process.platform === "win32" && fs.existsSync(venvWin)) return venvWin;
  if (fs.existsSync(venvUnix)) return venvUnix;
  return null;
}

function engineReadyPython(root, app) {
  const py = resolvePython(root, app);
  // Bare system python without a venv is not "ready" — deps won't be there.
  if (!py) return null;
  if (py === "python" || py === "python3") return null;
  return py;
}

function parseStage(line) {
  const t = String(line ?? "");
  if (/OutlineAgent|outline\.json|Starting Outline|OpenAI-compat bridge/i.test(t)) return "outline";
  if (/HybridLiterature|literature_agent|Literature/i.test(t)) return "literature";
  if (/PlottingAgent|WITH PLOTTING|plotting_results/i.test(t)) return "plotting";
  if (/SectionWriting|raw_draft_paper|Section Writing/i.test(t)) return "sections";
  if (/ContentRefinement|refined_paper|peer.?review|final_refined/i.test(t)) return "refine";
  if (/final_paper\.pdf|Paper Generation|Starting Paper/i.test(t)) return "running";
  if (/Fatal LLM|budget exceeded|Non-retryable|PermissionDenied|exited non-zero/i.test(t)) return "error";
  if (/Error:|Traceback|FAILED/i.test(t)) return "error";
  return null;
}

function humanizePaperFailure(stderrTail, exitCode) {
  const t = String(stderrTail ?? "");
  if (/workspace lifetime budget|budget exceeded|does not reset/i.test(t)) {
    return (
      "OpenRouter workspace budget is exhausted (paid model / credits). " +
      "Add a Gemini API key in Paper, top up OpenRouter, or re-run — Paper now defaults to a free :free model."
    );
  }
  if (/FatalLLMError|Non-retryable LLM/i.test(t)) {
    return t.match(/FatalLLMError:([^\n]+)/)?.[1]?.trim()
      || "Model provider rejected the request (auth/budget). Check Paper keys or OpenRouter.";
  }
  if (/GEMINI_API_KEY|No model credentials/i.test(t)) {
    return "No usable model credentials. Add Gemini in Paper or sign in to OpenCode/OpenRouter.";
  }
  const lastUseful = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^Traceback/i.test(l) && !/^File "/.test(l) && !/^\^+$/.test(l))
    .slice(-3)
    .join(" · ")
    .slice(0, 280);
  return lastUseful
    ? `PaperOrchestra exited ${exitCode}: ${lastUseful}`
    : `PaperOrchestra exited ${exitCode}`;
}

async function readTextIfExists(filePath, max = 2_000_000) {
  try {
    const st = await fsp.stat(filePath);
    if (!st.isFile() || st.size > max) return null;
    return await fsp.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export async function importOrchestraArtifacts(outputDir) {
  const latexDir = path.join(outputDir, "latex_writeup");
  const refineDir = path.join(outputDir, "content_refinement_workdir");
  const litDir = path.join(outputDir, "literature_agent_output");

  const draftCandidates = [
    path.join(refineDir, "final_refined_paper.tex"),
    path.join(latexDir, "raw_draft_paper.tex"),
    path.join(litDir, "updated_template.tex"),
    path.join(latexDir, "template.tex"),
  ];
  let draftTex = null;
  for (const p of draftCandidates) {
    draftTex = await readTextIfExists(p);
    if (draftTex) break;
  }

  const bibCandidates = [
    path.join(latexDir, "references.bib"),
    path.join(litDir, "references.bib"),
    path.join(refineDir, "references.bib"),
  ];
  let bibliography = null;
  for (const p of bibCandidates) {
    bibliography = await readTextIfExists(p);
    if (bibliography) break;
  }

  const outline =
    (await readTextIfExists(path.join(outputDir, "outline.json"))) ??
    (await readTextIfExists(path.join(litDir, "outline_v1.json")));

  const citationMap = await readTextIfExists(path.join(litDir, "citation_map.json"));

  const pdfCandidates = [
    path.join(outputDir, "final_paper.pdf"),
    path.join(refineDir, "final_refined_paper.pdf"),
  ];
  let pdfPath = null;
  for (const p of pdfCandidates) {
    if (fs.existsSync(p)) {
      pdfPath = p;
      break;
    }
  }

  const figuresDir = path.join(latexDir, "figures");
  /** @type {string[]} */
  const figureFiles = [];
  try {
    const names = await fsp.readdir(figuresDir);
    for (const n of names) {
      if (/\.(png|jpe?g|pdf|svg)$/i.test(n)) figureFiles.push(path.join(figuresDir, n));
    }
  } catch { /* none */ }

  return {
    draftTex,
    bibliography,
    outline,
    citationMap,
    pdfPath,
    figureFiles,
    latexDir,
    outputDir,
  };
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {import('electron').App} app
 */
export function registerPaperOrchestraIpc(ipcMain, app) {
  ipcMain.handle("paperOrchestra:status", async () => {
    const root = resolveOrchestraRoot(app);
    const python = root ? engineReadyPython(root, app) : null;
    const venues = [];
    if (root) {
      for (const v of VENUES) {
        const dir = path.join(root, "templates", v);
        if (fs.existsSync(path.join(dir, "template.tex"))) venues.push(v);
      }
    }
    const canInstall = Boolean(root && fs.existsSync(path.join(root, "requirements.txt")));
    return {
      root,
      python,
      ready: Boolean(root && python),
      canInstall,
      installing: installInFlight,
      hasSystemPython: Boolean(findSystemPython()),
      venues,
      running: Boolean(activeChild),
      runId: activeRunId,
      stage: currentStage,
      logLines: logBuffer.slice(),
      outputDir: lastOutputDir,
      lastFinish,
      hint: !root
        ? "PaperOrchestra files missing from this install."
        : !python
          ? "Paper engine not installed"
          : "Paper engine ready",
    };
  });

  ipcMain.handle("paperOrchestra:installEngine", async () => {
    if (installInFlight) throw new Error("Paper engine install is already running.");
    const root = resolveOrchestraRoot(app);
    if (!root) throw new Error("PaperOrchestra files are missing from this install.");
    installInFlight = true;
    try {
      const result = await installPaperOrchestraEngine({
        app,
        orchestraRoot: root,
        onProgress: (p) => send({ ...p, runId: null }),
      });
      return { ok: true, python: result.python };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send({ stage: "error", message, done: true, ok: false });
      throw err;
    } finally {
      installInFlight = false;
    }
  });

  ipcMain.handle("paperOrchestra:listVenues", async () => {
    const root = resolveOrchestraRoot(app);
    if (!root) return [];
    const out = [];
    for (const v of VENUES) {
      const dir = path.join(root, "templates", v);
      if (fs.existsSync(path.join(dir, "template.tex"))) {
        out.push({ id: v, path: dir, label: v === "cvpr2025" ? "CVPR 2025" : "ICLR 2025" });
      }
    }
    return out;
  });

  ipcMain.handle("paperOrchestra:cancel", async () => {
    if (activeChild && !activeChild.killed) {
      try {
        activeChild.kill("SIGTERM");
      } catch { /* noop */ }
      send({ runId: activeRunId, stage: "cancelled", message: "Run cancelled.", done: true, ok: false });
    }
    activeChild = null;
    activeRunId = null;
    currentStage = "cancelled";
    return { ok: true };
  });

  ipcMain.handle("paperOrchestra:importArtifacts", async (_e, outputDir) => {
    const dir = String(outputDir ?? "").trim();
    if (!dir || !fs.existsSync(dir)) throw new Error("Output directory not found.");
    return importOrchestraArtifacts(dir);
  });

  ipcMain.handle("paperOrchestra:start", async (_e, payload) => {
    if (activeChild) throw new Error("A PaperOrchestra run is already in progress.");
    const root = resolveOrchestraRoot(app);
    if (!root) throw new Error("PaperOrchestra engine not found.");
    const python = engineReadyPython(root, app);
    if (!python) {
      throw new Error("Paper engine not installed. Click Install Paper engine in Notebook → Paper (one-time setup).");
    }

    const idea = String(payload?.idea ?? "").trim();
    const experimentalLog = String(payload?.experimentalLog ?? "").trim();
    if (idea.length < 20) throw new Error("Idea is too short — describe the contribution.");
    if (experimentalLog.length < 10) throw new Error("Experimental log is too short.");

    const venue = String(payload?.venue ?? "cvpr2025");
    if (!VENUES.has(venue)) throw new Error("Unknown venue template.");
    const templateDir = path.join(root, "templates", venue);
    if (!fs.existsSync(path.join(templateDir, "template.tex"))) {
      throw new Error(`Template missing: ${venue}`);
    }

    const runId = randomUUID();
    const workRoot = path.join(app.getPath("userData"), "paper-orchestra-runs", runId);
    const materialsDir = path.join(workRoot, "raw_materials");
    const figuresDir = path.join(materialsDir, "figures");
    const outputDir = path.join(workRoot, "output");
    await fsp.mkdir(figuresDir, { recursive: true });
    await fsp.mkdir(outputDir, { recursive: true });

    const ideaName = String(payload?.ideaFilename ?? "idea_sparse.md").replace(/[\\/]/g, "");
    const logName = String(payload?.experimentalLogFilename ?? "experimental_log.md").replace(/[\\/]/g, "");
    await fsp.writeFile(path.join(materialsDir, ideaName), idea, "utf8");
    await fsp.writeFile(path.join(materialsDir, logName), experimentalLog, "utf8");

    // Library PDF text extracts / extra notes (additive evidence for materials).
    const extras = Array.isArray(payload?.extraMaterialFiles) ? payload.extraMaterialFiles : [];
    for (const item of extras.slice(0, 24)) {
      const name = String(item?.name ?? "").replace(/[\\/]/g, "").slice(0, 120);
      const text = String(item?.text ?? "");
      if (!name || !text) continue;
      await fsp.writeFile(path.join(materialsDir, name), text.slice(0, 400_000), "utf8");
    }

    const figurePaths = Array.isArray(payload?.figurePaths) ? payload.figurePaths : [];
    for (const src of figurePaths.slice(0, 40)) {
      const abs = String(src ?? "");
      if (!abs || !fs.existsSync(abs)) continue;
      const base = path.basename(abs).replace(/[\\/]/g, "");
      if (!/\.(png|jpe?g|pdf|svg)$/i.test(base)) continue;
      await fsp.copyFile(abs, path.join(figuresDir, base)).catch(() => {});
    }

    const usePlotting = Boolean(payload?.usePlotting);
    const args = [
      path.join(root, "paper_writing_cli.py"),
      "--raw_materials_dir",
      materialsDir,
      "--latex_template_dir",
      templateDir,
      "--output_dir",
      outputDir,
      "--idea_filename",
      ideaName,
      "--experimental_log_filename",
      logName,
      "--use_plotting",
      usePlotting ? "true" : "false",
    ];
    if (payload?.writerModelName) args.push("--writer_model_name", String(payload.writerModelName).slice(0, 120));
    if (payload?.reflectionModelName) args.push("--reflection_model_name", String(payload.reflectionModelName).slice(0, 120));
    if (payload?.plottingModelName) args.push("--plotting_model_name", String(payload.plottingModelName).slice(0, 120));
    if (payload?.imageModelName) args.push("--image_model_name", String(payload.imageModelName).slice(0, 120));
    if (payload?.researchCutoff) args.push("--research_cutoff", String(payload.researchCutoff).slice(0, 16));
    if (payload?.plottingMaxCriticRounds != null) {
      args.push("--plotting_max_critic_rounds", String(Number(payload.plottingMaxCriticRounds) || 3));
    }

    const env = { ...process.env };
    const inject = payload?.envInject && typeof payload.envInject === "object" ? payload.envInject : {};
    const creds = await applyPaperOrchestraCredentials(app, env, inject);

    if (!creds.hasGemini && !creds.hasOpenAiCompat) {
      throw new Error(
        "No model runtime for PaperOrchestra. Install OpenCode (same as chat), or add an optional Gemini key in Paper for higher quality."
      );
    }

    activeRunId = runId;
    resetRunBuffer();
    lastOutputDir = outputDir;
    const bridgeNote = creds.bridgeModel ? ` · ${creds.bridgeModel}` : "";
    const startMsg =
      creds.source === "opencode-bridge"
        ? `Starting PaperOrchestra via OpenCode${bridgeNote}…`
        : creds.hasGemini
          ? "Starting PaperOrchestra (Gemini)…"
          : creds.source === "omniroute"
            ? `Starting PaperOrchestra via local OmniRoute${bridgeNote}…`
            : `Starting PaperOrchestra via agent bridge${bridgeNote}…`;
    send({ runId, stage: "starting", message: startMsg, done: false, outputDir });

    // Unbuffered Python so live logs stream to the UI (TTY-less pipes buffer otherwise).
    env.PYTHONUNBUFFERED = "1";
    env.PYTHONIOENCODING = env.PYTHONIOENCODING || "utf-8";

    await new Promise((resolve, reject) => {
      const child = spawn(python, ["-u", ...args], {
        cwd: root,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      activeChild = child;
      let stderrTail = "";
      let stdoutCarry = "";
      let stderrCarry = "";

      const flushLines = (carry, chunk, stream) => {
        const merged = `${carry}${String(chunk)}`;
        const parts = merged.split(/\r?\n/);
        const rest = parts.pop() ?? "";
        if (stream === "stderr") stderrTail = `${stderrTail}${String(chunk)}`.slice(-8000);
        for (const line of parts) {
          if (!line.trim()) continue;
          const stage = parseStage(line);
          send({
            runId,
            stage: stage || undefined,
            message: line.slice(0, 800),
            done: false,
          });
        }
        return rest;
      };

      child.stdout?.on("data", (d) => {
        stdoutCarry = flushLines(stdoutCarry, d, "stdout");
      });
      child.stderr?.on("data", (d) => {
        stderrCarry = flushLines(stderrCarry, d, "stderr");
      });
      child.on("error", (err) => {
        activeChild = null;
        activeRunId = null;
        send({ runId, stage: "error", message: err.message, done: true, ok: false });
        reject(err);
      });
      child.on("exit", (code) => {
        if (stdoutCarry.trim()) {
          send({ runId, message: stdoutCarry.trim().slice(0, 800), done: false });
        }
        if (stderrCarry.trim()) {
          send({ runId, stage: parseStage(stderrCarry) || undefined, message: stderrCarry.trim().slice(0, 800), done: false });
          stderrTail = `${stderrTail}${stderrCarry}`.slice(-8000);
        }
        activeChild = null;
        const ok = code === 0;
        activeRunId = null;
        const failMsg = ok ? "PaperOrchestra finished." : humanizePaperFailure(stderrTail, code);
        send({
          runId,
          stage: ok ? "complete" : "error",
          message: failMsg,
          done: true,
          ok,
          outputDir,
        });
        if (ok) resolve();
        else reject(new Error(failMsg));
      });
    });

    const artifacts = await importOrchestraArtifacts(outputDir);
    const hasPdf = Boolean(artifacts?.pdfPath && fs.existsSync(artifacts.pdfPath));
    const hasDraft = Boolean(artifacts?.draftTex?.trim());
    if (!hasPdf && !hasDraft) {
      throw new Error(
        "PaperOrchestra exited without a manuscript. Check the live log — usually a missing GEMINI_API_KEY or model error."
      );
    }
    return { runId, outputDir, artifacts };
  });
}

export function cleanupPaperOrchestra() {
  if (activeChild && !activeChild.killed) {
    try {
      activeChild.kill("SIGTERM");
    } catch { /* noop */ }
  }
  activeChild = null;
  activeRunId = null;
  import("./paperLlmBridge.mjs")
    .then(({ stopPaperLlmBridge }) => stopPaperLlmBridge())
    .catch(() => {});
}
