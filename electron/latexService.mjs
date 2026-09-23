/**
 * Real LaTeX execution (Electron main only).
 *
 * Detect → compile (latexmk when present, else pdflatex+bibtex passes) →
 * parse diagnostics → verify PDF. No fake builds: completion requires the
 * PDF artifact on disk. All paths resolve through the workspace authority.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile, execSync } from "node:child_process";
import { createLogger } from "./log.mjs";
import { resolveWorkspaceRoot, resolveInWorkspace } from "./workspaceService.mjs";

const log = createLogger("latex");

const COMPILE_TIMEOUT_MS = 300000;
const MAX_LOG_CHARS = 60000;

function hasBinary(name) {
  try {
    execSync(process.platform === "win32" ? `where ${name}` : `command -v ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runBin(bin, args, cwd) {
  return new Promise((resolve) => {
    execFile(bin, args, { cwd, timeout: COMPILE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        code: err && !err.killed ? (err.code ?? 1) : err?.killed ? null : 0,
        timedOut: Boolean(err?.killed),
        log: `${stdout ?? ""}\n${stderr ?? ""}`.slice(0, MAX_LOG_CHARS),
      });
    });
  });
}

export async function detectLatex(root) {
  const rootReal = await resolveWorkspaceRoot(root);
  let entries = [];
  try {
    entries = await fsp.readdir(rootReal);
  } catch {
    return { isLatex: false };
  }
  const texFiles = entries.filter((f) => f.toLowerCase().endsWith(".tex"));
  const bibFiles = entries.filter((f) => f.toLowerCase().endsWith(".bib"));
  let mainTex = null;
  for (const cand of ["main.tex", "thesis.tex", "book.tex", "paper.tex", ...texFiles]) {
    if (!texFiles.includes(cand)) continue;
    try {
      const head = (await fsp.readFile(path.join(rootReal, cand), "utf8")).slice(0, 8000);
      if (/\\documentclass/.test(head)) {
        mainTex = cand;
        break;
      }
    } catch { /* next */ }
  }
  if (!mainTex && texFiles.length === 0) return { isLatex: false };
  return {
    isLatex: Boolean(mainTex),
    mainTex,
    chapters: texFiles.filter((f) => f !== mainTex).slice(0, 100),
    bibliography: bibFiles.slice(0, 20),
    buildDir: "build",
    engines: {
      latexmk: hasBinary("latexmk"),
      pdflatex: hasBinary("pdflatex"),
      bibtex: hasBinary("bibtex"),
    },
  };
}

/** Parse pdflatex/latexmk output into structured diagnostics. */
export function parseLatexLog(logText) {
  const errors = [];
  const warnings = [];
  for (const line of String(logText ?? "").split("\n").slice(0, 3000)) {
    let m = line.match(/^(.+\.tex):(\d+):\s*(.+)$/);
    if (m) {
      errors.push({ file: m[1].slice(-120), line: Number(m[2]), message: m[3].slice(0, 300) });
      continue;
    }
    if (line.startsWith("! ")) {
      errors.push({ file: "", line: 0, message: line.slice(2, 302) });
      continue;
    }
    m = line.match(/LaTeX Warning:\s*(.+)/);
    if (m) {
      warnings.push(m[1].slice(0, 300));
      continue;
    }
    if (/^! Emergency stop/.test(line)) {
      errors.push({ file: "", line: 0, message: "Emergency stop." });
    }
  }
  return { errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) };
}

export async function compileLatex(root, opts = {}) {
  const rootReal = await resolveWorkspaceRoot(root);
  const det = await detectLatex(rootReal);
  if (!det.isLatex || !det.mainTex) throw new Error("No LaTeX main file detected");
  const buildDir = path.join(rootReal, det.buildDir);
  await fsp.mkdir(buildDir, { recursive: true });
  const useLatexmk = opts.engine === "latexmk" ? det.engines.latexmk : det.engines.latexmk && opts.engine !== "pdflatex";
  const combined = [];
  if (useLatexmk && det.engines.latexmk) {
    const r = await runBin("latexmk", ["-pdf", "-interaction=nonstopmode", `-output-directory=${det.buildDir}`, det.mainTex], rootReal);
    combined.push(r.log);
  } else {
    if (!det.engines.pdflatex) throw new Error("No LaTeX engine available (need latexmk or pdflatex)");
    const base = det.mainTex.replace(/\.tex$/i, "");
    const needsBib = det.bibliography.length > 0;
    const pass = async (args) => {
      const r = await runBin("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", `-output-directory=${det.buildDir}`, ...args, det.mainTex], rootReal);
      combined.push(r.log);
      return r;
    };
    let r = await pass([]);
    if (r.code !== 0 && needsBib) {
      // Missing .bbl on first pass is normal; continue to bibtex.
    }
    if (needsBib && det.engines.bibtex) {
      const b = await new Promise((resolve) => {
        execFile("bibtex", [`${det.buildDir}/${base}`], { cwd: rootReal, timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
          resolve({ log: `${stdout ?? ""}\n${stderr ?? ""}`.slice(0, 10000) });
        });
      });
      combined.push(b.log);
      r = await pass([]);
      r = await pass([]);
    } else {
      r = await pass([]);
    }
    void r;
  }
  const fullLog = combined.join("\n").slice(0, MAX_LOG_CHARS);
  const { errors, warnings } = parseLatexLog(fullLog);
  // Verify the artifact: PDF must exist on disk with nonzero size.
  const pdfName = det.mainTex.replace(/\.tex$/i, ".pdf");
  const pdfAbs = path.join(buildDir, pdfName);
  const st = await fsp.stat(pdfAbs).catch(() => null);
  const ok = Boolean(st?.isFile() && st.size > 0);
  const result = {
    ok,
    mainTex: det.mainTex,
    pdf: ok ? `${det.buildDir}/${pdfName}` : null,
    pdfSize: st?.size ?? 0,
    errors,
    warnings,
    logTail: fullLog.slice(-4000),
  };
  log.info("latex compile finished", { main: det.mainTex, ok, errors: errors.length });
  return result;
}

export async function openProjectPdf(root, rel) {
  const { abs, rel: relPath } = await resolveInWorkspace(root, rel);
  if (!/\.pdf$/i.test(relPath)) throw new Error("Not a PDF");
  const st = await fsp.stat(abs).catch(() => null);
  if (!st?.isFile()) throw new Error("PDF not found");
  // Lazy electron import keeps this module testable under plain node.
  const { shell } = await import("electron");
  const err = await shell.openPath(abs);
  if (err) throw new Error(`Could not open PDF: ${err.slice(0, 200)}`);
  return { opened: true, path: relPath };
}

export function registerLatexIpc(ipcMain, app) {
  void app;
  const assertPayload = (p) => {
    if (!p || typeof p !== "object") throw new Error("Invalid payload");
    return p;
  };
  ipcMain.handle("latex:detect", async (_e, payload) => {
    const p = assertPayload(payload);
    return detectLatex(p.root);
  });
  ipcMain.handle("latex:compile", async (_e, payload) => {
    const p = assertPayload(payload);
    return compileLatex(p.root, { engine: p.engine });
  });
  ipcMain.handle("latex:openPdf", async (_e, payload) => {
    const p = assertPayload(payload);
    if (typeof p.path !== "string" || !p.path) throw new Error("Invalid path");
    return openProjectPdf(p.root, p.path);
  });
}
