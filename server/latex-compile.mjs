/**
 * Local pdflatex HTTP service for Notebook “Compile”.
 * POST /compile — text/plain body = single .tex
 * POST /compile — application/json = multi-file bundle
 *
 * Phase 1 hardening: request body cap, strict content-type allowlist, bundle
 * shape validation, temp-dir containment for every written path, per-pass
 * compile timeout, generic 500s (details stay server-side).
 * Binds 127.0.0.1 by default; CORS stays permissive because the only callers
 * are loopback (Vite dev/preview proxy, Electron, local scripts) — the threat
 * model and rationale are documented in docs/OPENBENTT_PHASE_1_SECURITY_FOUNDATION.md.
 */

import http from "node:http";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readBodyCapped, sendJson } from "./httpPolicy.mjs";

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "127.0.0.1";
// Single .tex documents are small; bundles may carry base64 figures.
const MAX_BODY_BYTES = Number(process.env.TEX_MAX_BODY_BYTES || 8 * 1024 * 1024);
const MAX_FILES = 100;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PATH_CHARS = 500;
// Wall-clock cap per pdflatex/bibtex pass (spawnSync timeout kills the child).
const COMPILE_TIMEOUT_MS = Number(process.env.TEX_COMPILE_TIMEOUT_MS || 120_000);

function pdflatexAvailable() {
  try {
    const r = spawnSync("pdflatex", ["--version"], { encoding: "utf8", timeout: 15_000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

const HAVE_PDFLATEX = pdflatexAvailable();

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

/** Resolve `userPath` strictly inside `dir`; throw (→400) on traversal/absolute. */
function resolveInside(dir, userPath) {
  const raw = String(userPath ?? "");
  if (!raw || raw.length > MAX_PATH_CHARS) throw new Error("bad path");
  const fp = path.resolve(dir, raw);
  const rel = path.relative(dir, fp);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("path escapes bundle");
  return fp;
}

function runCompile(dir, mainPath, bibtex) {
  const opts = {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: Number.isFinite(COMPILE_TIMEOUT_MS) && COMPILE_TIMEOUT_MS > 0 ? COMPILE_TIMEOUT_MS : 120_000,
    killSignal: "SIGKILL",
  };
  const baseName = mainPath.replace(/\.tex$/i, "") || "main";
  const args = ["-interaction=nonstopmode", "-halt-on-error", mainPath];
  let log = "";
  let timedOut = false;
  const runPdf = () => {
    const r = spawnSync("pdflatex", args, opts);
    if (r.error) timedOut = true;
    log += (r.stdout || "") + (r.stderr || "");
    return r.status ?? 1;
  };
  let status = runPdf();
  if (bibtex) {
    spawnSync("bibtex", [baseName], opts);
    status = runPdf();
    status = runPdf();
  } else {
    status = runPdf();
  }
  return { log, status, timedOut, pdfPath: path.join(dir, `${baseName}.pdf`) };
}

function writeBundle(dir, payload) {
  if (!payload || typeof payload !== "object") throw new Error("bad bundle");
  const mainTex = typeof payload.mainTex === "string" ? payload.mainTex : "";
  if (!mainTex.trim()) throw new Error("Missing mainTex");
  if (mainTex.length > MAX_BODY_BYTES) throw new Error("mainTex too large");
  const mainPath = typeof payload.mainPath === "string" && payload.mainPath.trim() ? payload.mainPath : "main.tex";
  const mainFp = resolveInside(dir, mainPath);
  fs.mkdirSync(path.dirname(mainFp), { recursive: true });
  fs.writeFileSync(mainFp, mainTex, "utf8");
  const files = payload.files ?? [];
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new Error("bad files");
  for (const f of files) {
    if (!f || typeof f !== "object" || typeof f.path !== "string") throw new Error("bad file entry");
    const fp = resolveInside(dir, f.path);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    if (f.encoding === "base64") {
      const buf = Buffer.from(String(f.content ?? ""), "base64");
      if (buf.length > MAX_FILE_BYTES) throw new Error("file too large");
      fs.writeFileSync(fp, buf);
    } else {
      const text = String(f.content ?? "");
      if (text.length > MAX_FILE_BYTES) throw new Error("file too large");
      fs.writeFileSync(fp, text, "utf8");
    }
  }
  return mainPath;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, "", "text/plain");
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    send(
      res,
      200,
      JSON.stringify({ ok: true, pdflatex: HAVE_PDFLATEX, port: PORT }),
      "application/json"
    );
    return;
  }
  if (req.method !== "POST" || req.url !== "/compile") {
    send(res, 404, "Not found\n", "text/plain; charset=utf-8");
    return;
  }
  if (!HAVE_PDFLATEX) {
    send(
      res,
      503,
      "pdflatex not found on PATH. Install TeX Live or MacTeX.\n",
      "text/plain; charset=utf-8"
    );
    return;
  }

  // Phase 1: only the two content-types the real client sends (latexCompileClient).
  const contentType = String(req.headers["content-type"] ?? "");
  const isJson = contentType.includes("application/json");
  const isText = contentType.includes("text/plain");
  if (!isJson && !isText) {
    send(res, 415, "content-type must be text/plain or application/json\n", "text/plain; charset=utf-8");
    return;
  }

  let raw;
  try {
    raw = await readBodyCapped(req, MAX_BODY_BYTES);
  } catch {
    // Over-cap uploads get their socket destroyed inside readBodyCapped, so no
    // response can reach the client; any other read failure is a 400.
    if (!req.destroyed) {
      send(res, 400, "unreadable request body\n", "text/plain; charset=utf-8");
    }
    return;
  }

  let dir = null;
  try {
    let mainPath = "main.tex";
    let bibtex = false;

    dir = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-tex-"));

    if (isJson) {
      let payload;
      try {
        payload = JSON.parse(raw.toString("utf8"));
      } catch {
        send(res, 400, "invalid JSON\n", "text/plain; charset=utf-8");
        return;
      }
      try {
        mainPath = writeBundle(dir, payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "bad bundle";
        send(res, 400, `${msg}\n`, "text/plain; charset=utf-8");
        return;
      }
      bibtex = Boolean(payload.bibtex);
    } else {
      const tex = raw.toString("utf8");
      if (!tex.trim()) {
        send(res, 400, "Empty body\n", "text/plain; charset=utf-8");
        return;
      }
      fs.writeFileSync(path.join(dir, "main.tex"), tex, "utf8");
    }

    const { log, status, timedOut, pdfPath } = runCompile(dir, mainPath, bibtex);
    if (timedOut) {
      send(res, 504, "compile timed out\n", "text/plain; charset=utf-8");
      return;
    }
    if (status !== 0 || !fs.existsSync(pdfPath)) {
      send(res, 500, log.slice(-24_000) || "pdflatex failed\n", "text/plain; charset=utf-8");
      return;
    }
    const pdf = fs.readFileSync(pdfPath);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(pdf);
  } catch {
    // Generic 500 — never reflect exception text (may embed tmpdir paths).
    console.error("[latex-compile] request failed");
    send(res, 500, "compile failed\n", "text/plain; charset=utf-8");
  } finally {
    if (dir && fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
});

// Importable without side effects for node --test (Phase 1).
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMainModule = invokedPath !== "" && fileURLToPath(import.meta.url) === path.resolve(invokedPath);

if (isMainModule) {
  server.listen(PORT, HOST, () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    console.log(
      `[latex-compile] listening http://${HOST}:${PORT}  POST /compile  (cwd ${dir})  pdflatex=${HAVE_PDFLATEX ? "yes" : "NO"}`
    );
  });
}

export { server, resolveInside };
