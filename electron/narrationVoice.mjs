/**
 * Free local narration voice: Piper + the Lessac medium voice (clear, female,
 * explanatory). Downloaded once into the data volume. No API key.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { getGgufPaths } from "./localGgufService.mjs";

const PIPER_TAG = "2023.11.14-2";
const VOICE_ID = "en_US-lessac-medium";
const VOICE_BASE = `https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/${VOICE_ID}`;
const MAX_ARCHIVE = 80 * 1024 * 1024;
const MAX_VOICE = 90 * 1024 * 1024;
const MAX_TEXT = 480;

let child = null;
let ready = null;

export function piperAssetName(platform = process.platform, arch = process.arch) {
  if (platform === "linux" && arch === "x64") return "piper_linux_x86_64.tar.gz";
  if (platform === "linux" && arch === "arm64") return "piper_linux_aarch64.tar.gz";
  if (platform === "darwin" && arch === "x64") return "piper_macos_x64.tar.gz";
  if (platform === "darwin" && arch === "arm64") return "piper_macos_aarch64.tar.gz";
  if (platform === "win32" && arch === "x64") return "piper_windows_amd64.zip";
  return null;
}

function narrationDir(app) {
  try {
    return path.join(path.dirname(getGgufPaths(app).root), "narration");
  } catch {
    return path.join(app.getPath("userData"), "narration");
  }
}

function downloadHttps(url, dest, maxBytes, onProgress, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "openbentt-narration" } }, (res) => {
      const code = res.statusCode ?? 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error("Too many redirects"));
          return;
        }
        const next = new URL(res.headers.location, url).href;
        if (!next.startsWith("https://")) {
          reject(new Error("Voice download redirected off HTTPS"));
          return;
        }
        downloadHttps(next, dest, maxBytes, onProgress, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (code !== 200) {
        res.resume();
        reject(new Error(`Voice download failed (HTTP ${code})`));
        return;
      }
      const total = Number(res.headers["content-length"] ?? 0);
      if (total > maxBytes) {
        res.resume();
        reject(new Error("Voice download is larger than expected"));
        return;
      }
      let received = 0;
      const out = fs.createWriteStream(dest);
      res.on("data", (chunk) => {
        received += chunk.length;
        if (received > maxBytes) {
          res.destroy();
          out.destroy();
          reject(new Error("Voice download exceeded the size cap"));
          return;
        }
        onProgress?.(received, total || received);
      });
      res.pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(120_000, () => req.destroy(new Error("Voice download timed out")));
  });
}

async function findBinary(dir, depth = 0) {
  if (depth > 3) return null;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findBinary(full, depth + 1);
      if (nested) return nested;
    } else if (entry.name === "piper" || entry.name === "piper.exe") {
      return full;
    }
  }
  return null;
}

async function ensureVoice(app, sender) {
  if (ready) return ready;
  const dir = narrationDir(app);
  await fsp.mkdir(dir, { recursive: true });
  const asset = piperAssetName();
  if (!asset) throw new Error("No Piper build for this system.");
  const engineDir = path.join(dir, "piper");
  let bin = await findBinary(engineDir).catch(() => null);
  const send = (payload) => {
    try {
      sender?.send("narration:progress", payload);
    } catch { /* window gone */ }
  };
  if (!bin) {
    const archive = path.join(dir, asset);
    send({ label: "Downloading the voice engine…", received: 0, total: 0 });
    await downloadHttps(
      `https://github.com/rhasspy/piper/releases/download/${PIPER_TAG}/${asset}`,
      archive,
      MAX_ARCHIVE,
      (received, total) => send({ label: "Downloading the voice engine…", received, total }),
    );
    await fsp.mkdir(engineDir, { recursive: true });
    await new Promise((resolve, reject) => {
      const extractor = spawn("tar", ["-xf", archive, "-C", engineDir], { stdio: "ignore" });
      extractor.on("error", reject);
      extractor.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("Could not unpack the voice engine"))));
    });
    await fsp.unlink(archive).catch(() => {});
    bin = await findBinary(engineDir);
    if (!bin) throw new Error("Voice engine unpacked without a piper binary.");
    await fsp.chmod(bin, 0o755).catch(() => {});
  }
  const model = path.join(dir, `${VOICE_ID}.onnx`);
  const modelJson = path.join(dir, `${VOICE_ID}.onnx.json`);
  if (!fs.existsSync(model)) {
    send({ label: "Downloading the Lessac voice…", received: 0, total: 0 });
    await downloadHttps(`${VOICE_BASE}.onnx`, model, MAX_VOICE, (received, total) =>
      send({ label: "Downloading the Lessac voice…", received, total }),
    );
  }
  if (!fs.existsSync(modelJson)) {
    await downloadHttps(`${VOICE_BASE}.onnx.json`, modelJson, 1024 * 1024, () => {});
  }
  ready = { bin, model, cwd: path.dirname(bin), voice: "Lessac" };
  send({ label: "Voice ready", received: 1, total: 1 });
  return ready;
}

function stopChild() {
  const current = child;
  child = null;
  if (current && !current.killed) {
    try { current.kill("SIGTERM"); } catch { /* already gone */ }
  }
}

export function cleanupNarration() {
  stopChild();
}

export function registerNarrationIpc(ipcMain, app) {
  ipcMain.handle("narration:status", async () => {
    const dir = narrationDir(app);
    const model = path.join(dir, `${VOICE_ID}.onnx`);
    return {
      voice: "Lessac",
      description: "Free local female voice",
      ready: fs.existsSync(model),
    };
  });

  ipcMain.handle("narration:ensure", async (event) => {
    const installed = await ensureVoice(app, event.sender);
    return { ok: true, voice: installed.voice };
  });

  ipcMain.handle("narration:synthesize", async (event, text) => {
    const clean = String(text ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (clean.length < 2) throw new Error("Nothing to say.");
    const installed = await ensureVoice(app, event.sender);
    stopChild();
    const wavPath = path.join(os.tmpdir(), `openbentt-say-${Date.now().toString(36)}.wav`);
    await new Promise((resolve, reject) => {
      const proc = spawn(
        installed.bin,
        ["--model", installed.model, "--output_file", wavPath, "--length_scale", "1.05"],
        {
          cwd: installed.cwd,
          env: {
            ...process.env,
            LD_LIBRARY_PATH: installed.cwd,
            ESPEAK_DATA_PATH: path.join(installed.cwd, "espeak-ng-data"),
          },
          stdio: ["pipe", "ignore", "pipe"],
        },
      );
      child = proc;
      let stderr = "";
      proc.stderr?.on("data", (d) => {
        stderr = `${stderr}${String(d)}`.slice(-500);
      });
      proc.on("error", (err) => {
        if (child === proc) child = null;
        reject(err);
      });
      proc.on("exit", (code) => {
        if (child === proc) child = null;
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `Voice engine exited ${code}`));
      });
      proc.stdin.write(clean);
      proc.stdin.end();
    });
    const wav = await fsp.readFile(wavPath);
    await fsp.unlink(wavPath).catch(() => {});
    if (wav.length < 44 || wav.length > 8 * 1024 * 1024) throw new Error("Voice engine returned an unexpected audio file.");
    return { voice: "Lessac", wavBase64: wav.toString("base64") };
  });
}
