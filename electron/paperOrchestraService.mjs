/**
 * PaperOrchestra sidecar — runs the intact Python CLI without gutting agents.
 * Spawns paper_writing_cli.py with the full flag surface; streams progress to the UI.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENUES = new Set(["cvpr2025", "iclr2025"]);

/** @type {import('electron').BrowserWindow | null} */
let progressWindow = null;
/** @type {import('node:child_process').ChildProcess | null} */
let activeChild = null;
/** @type {string | null} */
let activeRunId = null;

/** @param {import('electron').BrowserWindow | null} win */
export function setPaperOrchestraProgressTarget(win) {
  progressWindow = win;
}

function send(payload) {
  try {
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

function resolvePython(root) {
  const envPy = process.env.OPENBENTT_PAPER_ORCHESTRA_PYTHON?.trim();
  if (envPy && fs.existsSync(envPy)) return envPy;
  const venvUnix = path.join(root, ".venv", "bin", "python");
  const venvWin = path.join(root, ".venv", "Scripts", "python.exe");
  if (process.platform === "win32" && fs.existsSync(venvWin)) return venvWin;
  if (fs.existsSync(venvUnix)) return venvUnix;
  for (const name of ["python3", "python"]) {
    try {
      execFileSync(name, ["--version"], { stdio: "ignore", timeout: 4000, windowsHide: true });
      return name;
    } catch { /* next */ }
  }
  return null;
}

function parseStage(line) {
  const t = String(line ?? "");
  if (/OutlineAgent|outline\.json|Starting Outline/i.test(t)) return "outline";
  if (/HybridLiterature|literature_agent|Literature/i.test(t)) return "literature";
  if (/PlottingAgent|WITH PLOTTING|plotting_results/i.test(t)) return "plotting";
  if (/SectionWriting|raw_draft_paper|Section Writing/i.test(t)) return "sections";
  if (/ContentRefinement|refined_paper|peer.?review|final_refined/i.test(t)) return "refine";
  if (/final_paper\.pdf|Paper Generation|Starting Paper/i.test(t)) return "running";
  if (/Error:|Traceback|FAILED/i.test(t)) return "error";
  return null;
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
    const python = root ? resolvePython(root) : null;
    const venues = [];
    if (root) {
      for (const v of VENUES) {
        const dir = path.join(root, "templates", v);
        if (fs.existsSync(path.join(dir, "template.tex"))) venues.push(v);
      }
    }
    return {
      root,
      python,
      ready: Boolean(root && python),
      venues,
      running: Boolean(activeChild),
      runId: activeRunId,
      hint: !root
        ? "PaperOrchestra tree missing (paper-orchestra-main)."
        : !python
          ? "Install a venv in paper-orchestra-main (.venv) or set OPENBENTT_PAPER_ORCHESTRA_PYTHON."
          : "PaperOrchestra engine ready.",
    };
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
    const python = resolvePython(root);
    if (!python) throw new Error("Python not found. Create paper-orchestra-main/.venv and pip install -r requirements.txt.");

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
    // Additive: Openbentt may pass vault keys; Orchestra .env still loads via python-dotenv.
    const inject = payload?.envInject && typeof payload.envInject === "object" ? payload.envInject : {};
    for (const [k, v] of Object.entries(inject)) {
      if (/^(GEMINI_API_KEY|OPENAI_API_KEY|SEMANTIC_SCHOLAR_API_KEY|VERTEX_AI_PROJECT|VERTEX_AI_LOCATION|SMTP_EMAIL|SMTP_PASSWORD)$/.test(k) && typeof v === "string" && v.trim()) {
        env[k] = v.trim();
      }
    }

    activeRunId = runId;
    send({ runId, stage: "starting", message: "Starting PaperOrchestra…", done: false });

    await new Promise((resolve, reject) => {
      const child = spawn(python, args, {
        cwd: root,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      activeChild = child;
      let stderrTail = "";

      const onChunk = (buf, stream) => {
        const text = String(buf);
        if (stream === "stderr") stderrTail = `${stderrTail}${text}`.slice(-4000);
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue;
          const stage = parseStage(line);
          send({
            runId,
            stage: stage ?? "log",
            message: line.slice(0, 500),
            done: false,
          });
        }
      };

      child.stdout?.on("data", (d) => onChunk(d, "stdout"));
      child.stderr?.on("data", (d) => onChunk(d, "stderr"));
      child.on("error", (err) => {
        activeChild = null;
        activeRunId = null;
        send({ runId, stage: "error", message: err.message, done: true, ok: false });
        reject(err);
      });
      child.on("exit", (code) => {
        activeChild = null;
        const ok = code === 0;
        activeRunId = null;
        send({
          runId,
          stage: ok ? "complete" : "error",
          message: ok ? "PaperOrchestra finished." : `PaperOrchestra exited ${code}${stderrTail ? `: ${stderrTail.slice(-200)}` : ""}`,
          done: true,
          ok,
          outputDir,
        });
        if (ok) resolve();
        else reject(new Error(`PaperOrchestra exited ${code}`));
      });
    });

    const artifacts = await importOrchestraArtifacts(outputDir);
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
}
