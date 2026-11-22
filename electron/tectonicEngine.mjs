/**
 * Built-in TeX engine. Users should not install tectonic or TeX Live by hand.
 * Order: tectonic already on PATH, a copy we already downloaded, pdflatex on
 * PATH, then a one-time download of the official tectonic binary into userData.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { spawnSync, execFile } from "node:child_process";

export const TECTONIC_VERSION = "0.17.0";

const MAX_BYTES = 80 * 1024 * 1024;

export function tectonicAssetName(platform = process.platform, arch = process.arch) {
  const v = TECTONIC_VERSION;
  if (platform === "linux" && arch === "x64") return `tectonic-${v}-x86_64-unknown-linux-musl.tar.gz`;
  if (platform === "linux" && arch === "arm64") return `tectonic-${v}-aarch64-unknown-linux-musl.tar.gz`;
  if (platform === "linux" && arch === "arm") return `tectonic-${v}-arm-unknown-linux-musleabihf.tar.gz`;
  if (platform === "darwin" && arch === "x64") return `tectonic-${v}-x86_64-apple-darwin.tar.gz`;
  if (platform === "darwin" && arch === "arm64") return `tectonic-${v}-aarch64-apple-darwin.tar.gz`;
  if (platform === "win32" && arch === "x64") return `tectonic-${v}-x86_64-pc-windows-msvc.zip`;
  return null;
}

function binaryName() {
  return process.platform === "win32" ? "tectonic.exe" : "tectonic";
}

function versionOk(bin) {
  try {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 8000, windowsHide: true });
    return r.status === 0;
  } catch {
    return false;
  }
}

function pathBinary(name) {
  return versionOk(name) ? name : null;
}

function downloadHttps(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "openbentt" } }, (res) => {
      const code = res.statusCode ?? 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error("Too many redirects while downloading TeX engine"));
          return;
        }
        const next = new URL(res.headers.location, url).href;
        if (!next.startsWith("https://")) {
          reject(new Error("TeX engine download redirected off HTTPS"));
          return;
        }
        downloadHttps(next, dest, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (code !== 200) {
        res.resume();
        reject(new Error(`TeX engine download failed (HTTP ${code})`));
        return;
      }
      const declared = Number(res.headers["content-length"] ?? 0);
      if (declared > MAX_BYTES) {
        res.resume();
        reject(new Error("TeX engine download is larger than expected"));
        return;
      }
      let received = 0;
      const out = fs.createWriteStream(dest);
      res.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_BYTES) {
          res.destroy();
          out.destroy();
          reject(new Error("TeX engine download is larger than expected"));
        }
      });
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve(received)));
      out.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("TeX engine download timed out")));
  });
}

async function extractArchive(archive, dest, asset) {
  await fsp.mkdir(dest, { recursive: true });
  const run = (bin, args) =>
    new Promise((resolve, reject) => {
      execFile(bin, args, { cwd: dest, timeout: 60000, windowsHide: true }, (err, _stdout, stderr) => {
        if (err) reject(new Error(String(stderr || err.message).slice(0, 300)));
        else resolve();
      });
    });
  if (asset.endsWith(".zip")) {
    await run("unzip", ["-o", archive, "-d", dest]);
  } else {
    await run("tar", ["-xzf", archive, "-C", dest]);
  }
}

async function findBinary(dir) {
  const name = binaryName();
  const direct = path.join(dir, name);
  try {
    if ((await fsp.stat(direct)).isFile()) return direct;
  } catch { /* walk */ }
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name === name) return full;
    if (e.isDirectory()) {
      const nested = await findBinary(full);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * @param {import("electron").App | { getPath: (k: string) => string }} app
 * @returns {Promise<{ bin: string, kind: "tectonic" | "pdflatex" } | null>}
 */
export async function resolveTexBinary(app) {
  const onPath = pathBinary("tectonic");
  if (onPath) return { bin: onPath, kind: "tectonic" };

  const dir = path.join(app.getPath("userData"), "engines", "tectonic");
  const cached = path.join(dir, binaryName());
  if (versionOk(cached)) return { bin: cached, kind: "tectonic" };

  const pdf = pathBinary("pdflatex");
  if (pdf) return { bin: pdf, kind: "pdflatex" };

  const asset = tectonicAssetName();
  if (!asset) return null;
  const url = `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/${asset}`;
  const tmp = path.join(os.tmpdir(), `openbentt-${asset}`);
  try {
    await downloadHttps(url, tmp);
    await extractArchive(tmp, dir, asset);
    const found = await findBinary(dir);
    if (!found) return null;
    if (found !== cached) await fsp.copyFile(found, cached);
    await fsp.chmod(cached, 0o755);
    if (!versionOk(cached)) return null;
    return { bin: cached, kind: "tectonic" };
  } catch {
    return null;
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => {});
  }
}
