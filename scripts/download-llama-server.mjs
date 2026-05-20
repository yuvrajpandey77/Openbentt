#!/usr/bin/env node
/**
 * Downloads llama-server from official llama.cpp GitHub releases into
 * resources/llama/<platform>/ for Electron extraResources bundling.
 *
 * Usage:
 *   node scripts/download-llama-server.mjs           # current OS only
 *   node scripts/download-llama-server.mjs --all       # linux + darwin + win32 (CI)
 *   LLAMA_CPP_TAG=b9222 node scripts/download-llama-server.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(__dirname, "llama-release.json");
const OUT_ROOT = path.join(ROOT, "resources", "llama");

const PLATFORMS = ["linux", "darwin", "win32"];

function log(msg) {
  console.log(`[download-llama-server] ${msg}`);
}

async function loadManifest() {
  const raw = await fsp.readFile(MANIFEST_PATH, "utf8");
  const m = JSON.parse(raw);
  if (process.env.LLAMA_CPP_TAG?.trim()) {
    const tag = process.env.LLAMA_CPP_TAG.trim();
    m.tag = tag;
    for (const key of Object.keys(m.assets)) {
      if (typeof m.assets[key] === "string") {
        m.assets[key] = m.assets[key].replace(/^llama-b\d+-/, `llama-${tag}-`);
      }
    }
    if (m.binaryInArchive?.tar) {
      m.binaryInArchive.tar = m.binaryInArchive.tar.replace(/^llama-b\d+\//, `llama-${tag}/`);
    }
    if (m.binaryInArchive?.zip) {
      m.binaryInArchive.zip = m.binaryInArchive.zip.replace(/^llama-b\d+\//, `llama-${tag}/`);
    }
  }
  return m;
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  await fsp.rename(tmp, dest);
}

function extractTar(archivePath, destDir) {
  const r = spawnSync("tar", ["-xzf", archivePath, "-C", destDir], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`tar extract failed (${r.status})`);
}

function extractZip(archivePath, destDir) {
  const r = spawnSync("unzip", ["-q", archivePath, "-d", destDir], { stdio: "inherit" });
  if (r.status !== 0) {
    const r2 = spawnSync("7z", ["x", archivePath, `-o${destDir}`, "-y"], { stdio: "inherit" });
    if (r2.status !== 0) throw new Error(`unzip/7z extract failed`);
  }
}

async function chmodExec(filePath) {
  if (process.platform === "win32") return;
  const st = await fsp.stat(filePath);
  await fsp.chmod(filePath, st.mode | 0o755);
}

/**
 * @param {"linux"|"darwin"|"win32"} platform
 */
async function fetchForPlatform(manifest, platform) {
  const assetName = manifest.assets[platform];
  if (!assetName) {
    log(`skip ${platform}: no asset in manifest`);
    return;
  }

  const isZip = assetName.endsWith(".zip");
  const innerPath = isZip ? manifest.binaryInArchive.zip : manifest.binaryInArchive.tar;
  const outName = platform === "win32" ? "llama-server.exe" : "llama-server";
  const outPath = path.join(OUT_ROOT, platform, outName);

  if (fs.existsSync(outPath)) {
    const st = await fsp.stat(outPath);
    if (st.size > 1_000_000) {
      log(`${platform}: already present (${(st.size / 1024 / 1024).toFixed(1)} MiB) — ${outPath}`);
      return;
    }
  }

  const url = `https://github.com/${manifest.repo}/releases/download/${manifest.tag}/${assetName}`;
  const cacheDir = path.join(ROOT, ".cache", "llama-cpp", manifest.tag);
  await fsp.mkdir(cacheDir, { recursive: true });
  const archivePath = path.join(cacheDir, assetName);

  log(`${platform}: downloading ${assetName}…`);
  if (!fs.existsSync(archivePath)) {
    await downloadFile(url, archivePath);
  } else {
    log(`${platform}: using cached ${archivePath}`);
  }

  const extractDir = path.join(cacheDir, `extract-${platform}`);
  await fsp.rm(extractDir, { recursive: true, force: true });
  await fsp.mkdir(extractDir, { recursive: true });

  if (isZip) extractZip(archivePath, extractDir);
  else extractTar(archivePath, extractDir);

  const extractedBinary = path.join(extractDir, innerPath);
  if (!fs.existsSync(extractedBinary)) {
    throw new Error(`Expected binary missing: ${extractedBinary}`);
  }

  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.copyFile(extractedBinary, outPath);
  await chmodExec(outPath);

  const size = (await fsp.stat(outPath)).size;
  log(`${platform}: installed ${outPath} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
}

function targetPlatforms(argv) {
  if (argv.includes("--all")) return PLATFORMS;
  const map = { linux: "linux", darwin: "darwin", win32: "win32" };
  return [map[process.platform] ?? "linux"];
}

async function main() {
  const manifest = await loadManifest();
  const platforms = targetPlatforms(process.argv.slice(2));
  log(`tag=${manifest.tag} platforms=${platforms.join(", ")}`);

  for (const p of platforms) {
    await fetchForPlatform(manifest, p);
  }

  log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
