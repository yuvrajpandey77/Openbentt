/**
 * Local pdflatex HTTP service for Notebook “Compile” when Source is full LaTeX.
 *
 * Requires TeX Live / MacTeX (`pdflatex` on PATH).
 *
 *   npm run latex-compile
 *   # default PORT=8788 — Vite dev proxies /api/latex-compile → here
 *
 * POST /compile  Content-Type: text/plain  body = .tex source
 * Response: application/pdf on success; text/plain log on error.
 */

import http from "node:http";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "127.0.0.1";

function pdflatexAvailable() {
  const r = spawnSync("pdflatex", ["--version"], { encoding: "utf8" });
  return r.status === 0;
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

function runPdflatex(dir) {
  const opts = {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 48 * 1024 * 1024,
  };
  const args = ["-interaction=nonstopmode", "-halt-on-error", "main.tex"];
  const first = spawnSync("pdflatex", args, opts);
  let log = (first.stdout || "") + (first.stderr || "");
  const second = spawnSync("pdflatex", args, opts);
  log += (second.stdout || "") + (second.stderr || "");
  return { log, status: second.status ?? first.status };
}

const server = http.createServer((req, res) => {
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
      "pdflatex not found on PATH. Install TeX Live or MacTeX and ensure `pdflatex` is available.\n",
      "text/plain; charset=utf-8"
    );
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let dir = null;
    try {
      const tex = Buffer.concat(chunks).toString("utf8");
      if (!tex.trim()) {
        send(res, 400, "Empty body\n", "text/plain; charset=utf-8");
        return;
      }
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-tex-"));
      const mainPath = path.join(dir, "main.tex");
      fs.writeFileSync(mainPath, tex, "utf8");
      const { log, status } = runPdflatex(dir);
      const pdfPath = path.join(dir, "main.pdf");
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      send(res, 500, msg + "\n", "text/plain; charset=utf-8");
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
});

server.listen(PORT, HOST, () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  console.log(
    `[latex-compile] listening http://${HOST}:${PORT}  POST /compile  (cwd ${dir})  pdflatex=${HAVE_PDFLATEX ? "yes" : "NO"}`
  );
});
