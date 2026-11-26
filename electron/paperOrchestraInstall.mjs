/**
 * One-click PaperOrchestra Python engine for packaged installs.
 * Creates userData/paper-orchestra-engine/.venv and pip-installs requirements.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { createWriteStream } from "node:fs";

const UV_VERSION = "0.6.14";

/** @param {import('electron').App} app */
export function paperEngineDir(app) {
  return path.join(app.getPath("userData"), "paper-orchestra-engine");
}

/** @param {import('electron').App} app */
export function paperEngineVenvPython(app) {
  const base = paperEngineDir(app);
  if (process.platform === "win32") {
    const p = path.join(base, ".venv", "Scripts", "python.exe");
    return fs.existsSync(p) ? p : null;
  }
  const p = path.join(base, ".venv", "bin", "python");
  return fs.existsSync(p) ? p : null;
}

export function findSystemPython() {
  for (const name of process.platform === "win32" ? ["python", "python3"] : ["python3", "python"]) {
    try {
      execFileSync(name, ["--version"], { stdio: "ignore", timeout: 5000, windowsHide: true });
      return name;
    } catch {
      /* next */
    }
  }
  return null;
}

function uvAssetName() {
  if (process.platform === "linux") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return `uv-${arch}-unknown-linux-gnu.tar.gz`;
  }
  if (process.platform === "darwin") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return `uv-${arch}-apple-darwin.tar.gz`;
  }
  if (process.platform === "win32") {
    return "uv-x86_64-pc-windows-msvc.zip";
  }
  throw new Error(`Paper engine install is not supported on ${process.platform}.`);
}

function downloadHttps(url, dest, maxBytes, onProgress, redirectsLeft = 8) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "Openbentt-PaperOrchestra" } }, (res) => {
      const code = res.statusCode ?? 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error("Too many redirects downloading uv"));
          return;
        }
        const next = new URL(res.headers.location, url).href;
        if (!next.startsWith("https://")) {
          reject(new Error("Download redirected off HTTPS"));
          return;
        }
        downloadHttps(next, dest, maxBytes, onProgress, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (code !== 200) {
        res.resume();
        reject(new Error(`Download failed (HTTP ${code})`));
        return;
      }
      const total = Number(res.headers["content-length"] ?? 0);
      let received = 0;
      const out = createWriteStream(dest);
      res.on("data", (chunk) => {
        received += chunk.length;
        if (received > maxBytes) {
          res.destroy();
          out.destroy();
          reject(new Error("Download exceeded size cap"));
          return;
        }
        onProgress?.(received, total || received);
      });
      res.pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(180_000, () => req.destroy(new Error("Download timed out")));
  });
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, onLine?: (line: string) => void }} opts
 */
function runCaptured(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let errTail = "";
    const onData = (buf) => {
      const text = String(buf);
      errTail = `${errTail}${text}`.slice(-6000);
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) opts.onLine?.(line.slice(0, 400));
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(cmd)} exited ${code}${errTail ? `: ${errTail.slice(-300)}` : ""}`));
    });
  });
}

async function ensureUv(engineDir, onProgress) {
  const binName = process.platform === "win32" ? "uv.exe" : "uv";
  const binPath = path.join(engineDir, "bin", binName);
  if (fs.existsSync(binPath)) return binPath;

  await fsp.mkdir(path.join(engineDir, "bin"), { recursive: true });
  const asset = uvAssetName();
  const url = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${asset}`;
  const archive = path.join(engineDir, asset);
  onProgress?.({ stage: "install", message: "Downloading Python bootstrap (uv)…" });
  await downloadHttps(url, archive, 80 * 1024 * 1024, (received, total) => {
    const pct = total ? Math.round((received / total) * 100) : 0;
    onProgress?.({ stage: "install", message: `Downloading uv… ${pct}%` });
  });

  onProgress?.({ stage: "install", message: "Extracting uv…" });
  if (asset.endsWith(".zip")) {
    // Windows: use PowerShell Expand-Archive
    await runCaptured(
      "powershell.exe",
      ["-NoProfile", "-Command", `Expand-Archive -Force -Path '${archive.replace(/'/g, "''")}' -DestinationPath '${engineDir.replace(/'/g, "''")}'`],
      { onLine: (l) => onProgress?.({ stage: "install", message: l }) }
    );
    const found = await findFile(engineDir, binName, 4);
    if (!found) throw new Error("uv.exe missing after extract");
    await fsp.rename(found, binPath).catch(async () => {
      await fsp.copyFile(found, binPath);
    });
  } else {
    const extractDir = path.join(engineDir, "_uv_extract");
    await fsp.mkdir(extractDir, { recursive: true });
    await runCaptured("tar", ["-xzf", archive, "-C", extractDir], {
      onLine: (l) => onProgress?.({ stage: "install", message: l }),
    });
    const found = await findFile(extractDir, "uv", 4);
    if (!found) throw new Error("uv binary missing after extract");
    await fsp.copyFile(found, binPath);
    await fsp.chmod(binPath, 0o755);
    await fsp.rm(extractDir, { recursive: true, force: true });
  }
  await fsp.rm(archive, { force: true }).catch(() => {});
  return binPath;
}

async function findFile(dir, name, depth) {
  if (depth < 0) return null;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name === name) return full;
    if (e.isDirectory()) {
      const hit = await findFile(full, name, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * @param {object} opts
 * @param {import('electron').App} opts.app
 * @param {string} opts.orchestraRoot
 * @param {(p: { stage: string, message: string, done?: boolean, ok?: boolean }) => void} [opts.onProgress]
 */
export async function installPaperOrchestraEngine({ app, orchestraRoot, onProgress }) {
  if (!orchestraRoot || !fs.existsSync(path.join(orchestraRoot, "requirements.txt"))) {
    throw new Error("PaperOrchestra package is missing from this install.");
  }
  const engineDir = paperEngineDir(app);
  await fsp.mkdir(engineDir, { recursive: true });
  const venvDir = path.join(engineDir, ".venv");
  const req = path.join(orchestraRoot, "requirements.txt");
  const report = (message) => onProgress?.({ stage: "install", message, done: false });

  const existing = paperEngineVenvPython(app);
  if (existing) {
    report("Updating Paper engine packages…");
    await runCaptured(existing, ["-m", "pip", "install", "--upgrade", "pip"], {
      onLine: (l) => report(l),
    }).catch(() => {});
    await runCaptured(existing, ["-m", "pip", "install", "-r", req], {
      onLine: (l) => report(l),
    });
    onProgress?.({ stage: "install", message: "Paper engine ready.", done: true, ok: true });
    return { python: existing, engineDir };
  }

  const systemPy = findSystemPython();
  if (systemPy) {
    report("Creating Paper engine (system Python)…");
    await runCaptured(systemPy, ["-m", "venv", venvDir], { onLine: (l) => report(l) });
    const py = paperEngineVenvPython(app);
    if (!py) throw new Error("venv created but python binary missing");
    report("Installing PaperOrchestra packages (first time may take several minutes)…");
    await runCaptured(py, ["-m", "pip", "install", "--upgrade", "pip"], { onLine: (l) => report(l) });
    await runCaptured(py, ["-m", "pip", "install", "-r", req], { onLine: (l) => report(l) });
    onProgress?.({ stage: "install", message: "Paper engine ready.", done: true, ok: true });
    return { python: py, engineDir };
  }

  report("No system Python found — bootstrapping with uv…");
  const uv = await ensureUv(engineDir, onProgress);
  report("Installing Python 3.12 via uv…");
  await runCaptured(uv, ["venv", venvDir, "--python", "3.12"], {
    cwd: engineDir,
    onLine: (l) => report(l),
  });
  const py = paperEngineVenvPython(app);
  if (!py) throw new Error("uv venv created but python binary missing");
  report("Installing PaperOrchestra packages…");
  await runCaptured(uv, ["pip", "install", "-r", req, "--python", py], {
    cwd: engineDir,
    onLine: (l) => report(l),
  });
  onProgress?.({ stage: "install", message: "Paper engine ready.", done: true, ok: true });
  return { python: py, engineDir };
}
