/**
 * Local GGUF registry, Hugging Face downloads, and llama-server lifecycle (Electron main process).
 */
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readHfTokenMaybe } from "./hfSecretStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USER_AGENT = "Openbentt-LocalGGUF/1.0 (Electron)";
const REGISTRY_VERSION = 1;

/** @type {import('electron').BrowserWindow | null} */
let progressWindow = null;

/** @param {import('electron').BrowserWindow | null} win */
export function setLocalGgufProgressTarget(win) {
  progressWindow = win;
}

function sendProgress(payload) {
  if (progressWindow && !progressWindow.isDestroyed()) {
    progressWindow.webContents.send("localGguf:downloadProgress", payload);
  }
}

/**
 * @param {string} dir
 * @returns {number | null} free bytes approximate
 */
export function getDiskFreeBytesApprox(dir) {
  try {
    const target = path.resolve(dir);
    if (process.platform === "win32") {
      return null;
    }
    const out = execFileSync("df", ["-B1", target], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const lines = out.trim().split("\n").filter(Boolean);
    const line = lines[lines.length - 1];
    if (!line) return null;
    const parts = line.trim().split(/\s+/);
    const avail = parts.length >= 4 ? parseInt(parts[parts.length - 3], 10) : NaN;
    return Number.isFinite(avail) ? avail : null;
  } catch {
    return null;
  }
}

function assertSafeRepoId(repoId) {
  const t = String(repoId ?? "").trim();
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(t)) throw new Error("Invalid repo id.");
  return t;
}

function assertSafeFileName(name) {
  const t = String(name ?? "").trim();
  if (!t.toLowerCase().endsWith(".gguf")) throw new Error("Only .gguf files.");
  if (/[\\/]|\.\./.test(t) || t.startsWith(".")) throw new Error("Invalid file name.");
  return t;
}

function assertRevision(r) {
  const v = String(r ?? "main").trim();
  if (!v || /[\\/]|\.\./.test(v)) throw new Error("Invalid revision.");
  return v;
}

/**
 * @param {import('electron').App} app
 */
export function getGgufPaths(app) {
  const root = path.join(app.getPath("userData"), "gguf-models");
  const registryPath = path.join(root, "registry.json");
  const filesDir = path.join(root, "files");
  return { root, registryPath, filesDir };
}

async function readRegistry(registryPath) {
  try {
    const raw = await fsp.readFile(registryPath, "utf8");
    const j = JSON.parse(raw);
    if (j?.version !== REGISTRY_VERSION || !Array.isArray(j.entries)) return { version: REGISTRY_VERSION, entries: [] };
    return j;
  } catch {
    return { version: REGISTRY_VERSION, entries: [] };
  }
}

async function writeRegistry(registryPath, reg) {
  await fsp.mkdir(path.dirname(registryPath), { recursive: true });
  await fsp.writeFile(registryPath, JSON.stringify(reg, null, 2), "utf8");
}

/**
 * Resolve llama-server binary.
 * Order: OPENBENTT_LLAMA_SERVER_PATH → userData override file → bundled resources → PATH.
 * @param {import('electron').App} app
 * @param {string | undefined} configuredPath
 */
export function resolveLlamaServerBinary(app, configuredPath) {
  const exe =
    process.platform === "win32" ? "llama-server.exe" : process.platform === "darwin" ? "llama-server" : "llama-server";
  const envPath = process.env.OPENBENTT_LLAMA_SERVER_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) {
    return { path: envPath, source: "env" };
  }
  if (configuredPath && fs.existsSync(configuredPath)) {
    return { path: configuredPath, source: "settings" };
  }
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, "llama", process.platform, exe)
    : path.join(__dirname, "..", "resources", "llama", process.platform, exe);
  if (fs.existsSync(bundled)) {
    return { path: bundled, source: "bundled" };
  }
  try {
    if (process.platform === "win32") {
      const w = execFileSync("where", ["llama-server"], { encoding: "utf8" }).trim().split("\n")[0];
      if (w && fs.existsSync(w)) return { path: w.trim(), source: "path" };
    } else {
      const w = execFileSync("which", ["llama-server"], { encoding: "utf8" }).trim();
      if (w && fs.existsSync(w)) return { path: w, source: "path" };
    }
  } catch {
    /* none */
  }
  return { path: null, source: null };
}

let serverProc = null;
let serverRegistryId = null;
let serverPort = null;
let serverBaseUrl = null;
let serverChatModelId = "gpt-3.5-turbo";

/**
 * Pick a free TCP port on 127.0.0.1.
 * @returns {Promise<number>}
 */
function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      try {
        const addr = srv.address();
        const p = typeof addr === "object" && addr ? addr.port : null;
        srv.close(() => (p ? resolve(p) : reject(new Error("No port"))));
      } catch (e) {
        reject(e);
      }
    });
    srv.on("error", reject);
  });
}

/**
 * @param {() => string} [getStderrTail] last llama-server stderr for error context
 */
async function waitForServerModels(port, timeoutMs = 120_000, getStderrTail) {
  const base = `http://127.0.0.1:${port}`;
  const t0 = Date.now();
  let lastErr = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`${base}/v1/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const id = j?.data?.[0]?.id;
      return typeof id === "string" ? id : "gpt-3.5-turbo";
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  const msg = lastErr ? String(lastErr?.message ?? lastErr) : "Server did not respond in time.";
  const tail = getStderrTail?.() ?? "";
  throw new Error(msg + (tail.trim() ? `\n--- llama-server stderr (tail) ---\n${tail.slice(-2000)}` : ""));
}

function stopLlamaServer() {
  if (serverProc && !serverProc.killed) {
    try {
      serverProc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  serverProc = null;
  serverRegistryId = null;
  serverPort = null;
  serverBaseUrl = null;
}

/**
 * Ensure llama-server is running for the given registry entry id.
 * @param {object} opts
 * @param {string} opts.registryId
 * @param {string} opts.ggufAbsolutePath
 * @param {import('electron').App} opts.app
 * @param {string | undefined} opts.binaryOverride
 */
export async function ensureLlamaServer(opts) {
  const { registryId, ggufAbsolutePath, app, binaryOverride } = opts;
  if (!fs.existsSync(ggufAbsolutePath)) {
    throw new Error("GGUF file is missing on disk. Re-download or remove the entry.");
  }

  if (serverProc && serverRegistryId === registryId && serverPort) {
    try {
      const res = await fetch(`http://127.0.0.1:${serverPort}/v1/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return {
        baseUrl: serverBaseUrl,
        port: serverPort,
        chatModelId: serverChatModelId,
      };
    } catch {
      stopLlamaServer();
    }
  }

  stopLlamaServer();

  const resolved = resolveLlamaServerBinary(app, binaryOverride);
  if (!resolved.path) {
    throw new Error(
      "llama-server not found. Install llama.cpp, add llama-server to PATH, set OPENBENTT_LLAMA_SERVER_PATH, " +
        "or place binaries under resources/llama/<platform>/."
    );
  }

  const port = await pickFreePort();
  const host = "127.0.0.1";
  const args = ["-m", ggufAbsolutePath, "--host", host, "--port", String(port), "-c", "8192"];

  let stderrAcc = "";
  const proc = spawn(resolved.path, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  proc.stderr?.on("data", (chunk) => {
    const s = String(chunk);
    stderrAcc = (stderrAcc + s).slice(-8000);
    const line = s.trim();
    if (line.length < 500) console.info("[llama-server]", line);
  });
  proc.on("error", (err) => {
    console.error("[llama-server] spawn error:", err);
  });
  proc.on("exit", (code, signal) => {
    if (serverProc === proc) {
      console.warn("[llama-server] exited", code, signal);
      serverProc = null;
      serverRegistryId = null;
      serverPort = null;
      serverBaseUrl = null;
    }
  });

  serverProc = proc;
  serverRegistryId = registryId;
  serverPort = port;
  serverBaseUrl = `http://${host}:${port}/v1`;
  try {
    serverChatModelId = await waitForServerModels(port, 120_000, () => stderrAcc);
  } catch (e) {
    stopLlamaServer();
    throw e;
  }
  return { baseUrl: serverBaseUrl, port, chatModelId: serverChatModelId };
}

/**
 * Hugging Face: search models (public API).
 */
export async function hfSearchModels(query, limit = 15) {
  const q = encodeURIComponent(query.trim());
  const url = `https://huggingface.co/api/models?search=${q}&limit=${limit}&sort=downloads&direction=-1`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Hugging Face search failed (${res.status})`);
  return await res.json();
}

/**
 * @param {string} repoId
 */
export async function hfGetModelFiles(repoId) {
  const id = encodeURIComponent(assertSafeRepoId(repoId));
  const url = `https://huggingface.co/api/models/${id}?blobs=true`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HF model lookup failed (${res.status})`);
  const j = await res.json();
  const siblings = j?.siblings;
  if (!Array.isArray(siblings)) return { gguf: [], gated: Boolean(j?.gated), cardData: j?.cardData, fileSizes: {} };
  /** @type {Record<string, number>} */
  const fileSizes = {};
  const gguf = [];
  for (const s of siblings) {
    if (!s || typeof s !== "object") continue;
    const rf = s.rfilename;
    if (typeof rf !== "string" || !rf.toLowerCase().endsWith(".gguf")) continue;
    gguf.push(rf);
    const sz =
      typeof s.size === "number"
        ? s.size
        : typeof s.size_in_bytes === "number"
          ? s.size_in_bytes
          : null;
    if (sz != null && sz > 0) fileSizes[rf] = sz;
  }
  return {
    gguf,
    gated: Boolean(j?.gated),
    cardData: j?.cardData,
    fileSizes,
  };
}

async function hfHeadSize(repoId, revision, fileName) {
  const id = encodeURIComponent(repoId);
  const rev = encodeURIComponent(revision);
  const fn = fileName.split("/").map((p) => encodeURIComponent(p)).join("/");
  const url = `https://huggingface.co/${id}/resolve/${rev}/${fn}`;
  const headers = { "User-Agent": USER_AGENT, Range: "bytes=0-0" };
  const res = await fetch(url, { method: "GET", headers, redirect: "follow" });
  if (!res.ok) throw new Error(`HEAD/GET failed (${res.status})`);
  const len = res.headers.get("content-range") || res.headers.get("Content-Length");
  const m = len && String(len).match(/\/(\d+)/);
  if (m) return parseInt(m[1], 10);
  const cl = res.headers.get("Content-Length");
  return cl ? parseInt(cl, 10) : 0;
}

/**
 * Streaming download via fetch reader → file.
 */
/**
 * @param {number} expectedTotal from HEAD — for progress bar and resume completeness
 */
async function downloadGguf(repoId, revision, fileName, destAbsolute, token, expectedTotal, registryIdTag) {
  const id = encodeURIComponent(repoId);
  const rev = encodeURIComponent(revision);
  const fn = fileName.split("/").map((p) => encodeURIComponent(p)).join("/");
  const url = `https://huggingface.co/${id}/resolve/${rev}/${fn}`;

  let byteOffset = 0;
  try {
    byteOffset = (await fsp.stat(destAbsolute)).size;
  } catch {
    byteOffset = 0;
  }
  if (expectedTotal > 0 && byteOffset >= expectedTotal) {
    return;
  }

  await fsp.mkdir(path.dirname(destAbsolute), { recursive: true });

  const headers = {
    "User-Agent": USER_AGENT,
  };
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  if (byteOffset > 0) {
    headers.Range = `bytes=${byteOffset}-`;
  }

  let res = await fetch(url, { headers, redirect: "follow" });

  /** CDNs occasionally ignore Range — if we get 200 with offset, restart from scratch */
  if (byteOffset > 0 && res.status === 200) {
    await fsp.unlink(destAbsolute).catch(() => {});
    byteOffset = 0;
    delete headers.Range;
    res = await fetch(url, { headers, redirect: "follow" });
  }

  if (res.status === 416 && byteOffset > 0) {
    await fsp.unlink(destAbsolute).catch(() => {});
    byteOffset = 0;
    delete headers.Range;
    res = await fetch(url, { headers, redirect: "follow" });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Download denied (token or license required)."
        : `HTTP ${res.status} ${errText.slice(0, 200)}`
    );
  }

  const contentLen = Number(res.headers.get("content-length") || 0);
  const totalBytes =
    expectedTotal > 0
      ? expectedTotal
      : res.status === 206 && byteOffset > 0
        ? byteOffset + contentLen
        : contentLen || byteOffset;

  const file = fs.createWriteStream(destAbsolute, { flags: byteOffset > 0 ? "a" : "w" });
  /** @type {ReadableStreamDefaultReader<Uint8Array> | undefined} */
  const reader = res.body?.getReader?.();
  if (!reader) {
    file.destroy();
    throw new Error("Download body not readable.");
  }
  let receivedThisRun = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedThisRun += value.length;
      await new Promise((resolve, reject) => {
        file.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()));
      });
      const doneBytes = byteOffset + receivedThisRun;
      sendProgress({
        repoId,
        fileName,
        registryId: registryIdTag,
        received: doneBytes,
        total: totalBytes > 0 ? totalBytes : doneBytes,
      });
    }
    await new Promise((resolve, reject) => file.end((err) => (err ? reject(err) : resolve())));
  } finally {
    reader.releaseLock();
  }

  const st = await fsp.stat(destAbsolute);
  if (st.size === 0) throw new Error("Downloaded file is empty.");
}

/**
 * Register IPC handlers.
 * @param {import('electron').IpcMain} ipcMain
 * @param {import('electron').App} app
 */
export function registerLocalGgufIpc(ipcMain, app) {
  const paths = () => getGgufPaths(app);

  ipcMain.handle("localGguf:listRegistry", async () => {
    const { registryPath } = paths();
    const reg = await readRegistry(registryPath);
    return { entries: reg.entries };
  });

  ipcMain.handle("localGguf:diskFree", async () => {
    const { root } = paths();
    const b = getDiskFreeBytesApprox(root);
    return { bytes: b };
  });

  ipcMain.handle("localGguf:resolveBinary", async (_e, configuredPath) => {
    const r = resolveLlamaServerBinary(app, typeof configuredPath === "string" ? configuredPath.trim() || undefined : undefined);
    return r;
  });

  ipcMain.handle("localGguf:searchHf", async (_e, query) => {
    const q = String(query ?? "").trim();
    if (q.length < 2) return [];
    const arr = await hfSearchModels(q, 15);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m) => typeof m?.id === "string")
      .map((m) => ({
        id: m.id,
        downloads: m.downloads,
        pipeline_tag: m.pipeline_tag,
      }));
  });

  ipcMain.handle("localGguf:listGgufFiles", async (_e, repoId) => {
    assertSafeRepoId(repoId);
    return await hfGetModelFiles(repoId);
  });

  ipcMain.handle(
    "localGguf:addFromHf",
    async (_e, payload) => {
      const repoId = assertSafeRepoId(payload?.repoId);
      const fileName = assertSafeFileName(payload?.fileName);
      const revision = assertRevision(payload?.revision);
      let token = typeof payload?.token === "string" ? payload.token.trim() : "";
      if (!token) {
        token = (await readHfTokenMaybe(app)).trim();
      }
      const { root, registryPath, filesDir } = paths();

      await fsp.mkdir(filesDir, { recursive: true });

      const expectedSize = await hfHeadSize(repoId, revision, fileName).catch(() => 0);
      const free = getDiskFreeBytesApprox(root);
      if (expectedSize > 0 && free !== null && free < expectedSize * 1.15 + 512 * 1024 * 1024) {
        throw new Error(`Not enough free disk space (need ~${Math.ceil(expectedSize / 1024 ** 3)} GiB plus headroom).`);
      }

      const id = randomUUID();
      const safeStem = `${id}_${path.basename(fileName)}`;
      const dest = path.join(filesDir, safeStem);

      await downloadGguf(repoId, revision, fileName, dest, token, expectedSize, id);

      const st = await fsp.stat(dest);
      let sha256 = null;
      try {
        const hash = createHash("sha256");
        const fd = fs.createReadStream(dest);
        for await (const chunk of fd) {
          hash.update(chunk);
        }
        sha256 = hash.digest("hex");
      } catch {
        sha256 = null;
      }

      const displayName = `${repoId.split("/")[1] ?? repoId} · ${fileName}`;
      const entry = {
        id,
        repoId,
        revision,
        fileName,
        bytes: st.size,
        relativePath: path.relative(root, dest),
        displayName,
        sha256,
        createdAt: new Date().toISOString(),
      };

      const reg = await readRegistry(registryPath);
      reg.entries = reg.entries.filter((e) => e.id !== id);
      reg.entries.push(entry);
      await writeRegistry(registryPath, reg);

      return entry;
    }
  );

  ipcMain.handle("localGguf:deleteEntry", async (_e, entryId) => {
    const { registryPath, root } = paths();
    const reg = await readRegistry(registryPath);
    const e = reg.entries.find((x) => x.id === entryId);
    if (!e) return { ok: false };
    if (serverRegistryId === entryId) {
      stopLlamaServer();
    }
    const full = path.join(root, e.relativePath);
    try {
      await fsp.unlink(full);
    } catch {
      /* ok */
    }
    reg.entries = reg.entries.filter((x) => x.id !== entryId);
    await writeRegistry(registryPath, reg);
    return { ok: true };
  });

  ipcMain.handle("localGguf:ensureServer", async (_e, payload) => {
    const registryId = String(payload?.registryId ?? "").trim();
    const binaryOverride = typeof payload?.binaryOverride === "string" ? payload.binaryOverride.trim() || undefined : undefined;
    const { registryPath, root } = paths();
    const reg = await readRegistry(registryPath);
    const e = reg.entries.find((x) => x.id === registryId);
    if (!e) throw new Error("Model is not registered. Download it in Labs first.");
    const ggufAbsolutePath = path.join(root, e.relativePath);
    return await ensureLlamaServer({ registryId, ggufAbsolutePath, app, binaryOverride });
  });

  ipcMain.handle("localGguf:stopServer", async () => {
    stopLlamaServer();
    return { ok: true };
  });

  ipcMain.handle("localGguf:whoami", async (_e, token) => {
    let t = typeof token === "string" ? token.trim() : "";
    if (!t) {
      t = (await readHfTokenMaybe(app)).trim();
    }
    if (!t) return { valid: false, message: "No token." };
    const res = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${t}`, "User-Agent": USER_AGENT },
    });
    if (!res.ok) return { valid: false, message: `HTTP ${res.status}` };
    const j = await res.json();
    return { valid: true, name: j?.name ?? j?.preferred_username ?? "ok" };
  });
}

/** Call beforeQuit */
export function cleanupLocalGgufOnQuit() {
  stopLlamaServer();
}
