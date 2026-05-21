/**
 * Local pdflatex HTTP service for Notebook “Compile”.
 * POST /compile — text/plain body = single .tex
 * POST /compile — application/json = multi-file bundle
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

function runCompile(dir, mainPath, bibtex) {
  const opts = {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  };
  const baseName = mainPath.replace(/\.tex$/i, "") || "main";
  const args = ["-interaction=nonstopmode", "-halt-on-error", mainPath];
  let log = "";
  const runPdf = () => {
    const r = spawnSync("pdflatex", args, opts);
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
  return { log, status, pdfPath: path.join(dir, `${baseName}.pdf`) };
}

function writeBundle(dir, payload) {
  const mainPath = payload.mainPath || "main.tex";
  fs.writeFileSync(path.join(dir, mainPath), payload.mainTex, "utf8");
  for (const f of payload.files ?? []) {
    const safe = String(f.path).replace(/\\/g, "/").replace(/^(\.\.\/)+/, "");
    const fp = path.join(dir, safe);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    if (f.encoding === "base64") {
      fs.writeFileSync(fp, Buffer.from(f.content, "base64"));
    } else {
      fs.writeFileSync(fp, String(f.content ?? ""), "utf8");
    }
  }
  return mainPath;
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
      "pdflatex not found on PATH. Install TeX Live or MacTeX.\n",
      "text/plain; charset=utf-8"
    );
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let dir = null;
    try {
      const raw = Buffer.concat(chunks);
      const contentType = String(req.headers["content-type"] ?? "");
      let mainPath = "main.tex";
      let bibtex = false;

      dir = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-tex-"));

      if (contentType.includes("application/json")) {
        const payload = JSON.parse(raw.toString("utf8"));
        if (!payload?.mainTex?.trim()) {
          send(res, 400, "Missing mainTex\n", "text/plain; charset=utf-8");
          return;
        }
        mainPath = writeBundle(dir, payload);
        bibtex = Boolean(payload.bibtex);
      } else {
        const tex = raw.toString("utf8");
        if (!tex.trim()) {
          send(res, 400, "Empty body\n", "text/plain; charset=utf-8");
          return;
        }
        fs.writeFileSync(path.join(dir, "main.tex"), tex, "utf8");
      }

      const { log, status, pdfPath } = runCompile(dir, mainPath, bibtex);
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
