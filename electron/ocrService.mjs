/**
 * Local OCR via system `tesseract` (Electron main). No bundled OCR engine.
 * Accepts PNG/JPEG bytes (base64) or an on-disk image path; returns per-page text.
 */
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, execSync } from "node:child_process";
import { createLogger } from "./log.mjs";

const log = createLogger("ocr");

const OCR_TIMEOUT_MS = 120000;
const MAX_OCR_PAGES = 100;
const MAX_IMAGE_BYTES = 24 * 1024 * 1024;

export const __ocrTestHooks = { execFileImpl: null, forceAvailable: false };

function hasBinary(name) {
  if (__ocrTestHooks.forceAvailable && name === "tesseract") return true;
  try {
    execSync(process.platform === "win32" ? `where ${name}` : `command -v ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function getOcrStatus() {
  const available = hasBinary("tesseract");
  return {
    available,
    binary: "tesseract",
    ...(available ? {} : { error: "tesseract-not-installed" }),
  };
}

function extForMime(mime) {
  const m = String(mime ?? "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  return "png";
}

function decodeBase64(dataBase64) {
  if (typeof dataBase64 !== "string" || !dataBase64) throw new Error("Invalid image data");
  const buf = Buffer.from(dataBase64, "base64");
  if (!buf.length) throw new Error("Empty image data");
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("image-too-large");
  return buf;
}

function runTesseractOnFile(imgPath) {
  if (__ocrTestHooks.execFileImpl) return __ocrTestHooks.execFileImpl(imgPath);
  return new Promise((resolve, reject) => {
    execFile(
      "tesseract",
      [imgPath, "stdout", "-l", "eng"],
      { timeout: OCR_TIMEOUT_MS, maxBuffer: 6 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        const text = String(stdout ?? "").trim();
        if (err && !text) return reject(err);
        resolve({ text, confidence: undefined });
      },
    );
  });
}

async function ocrImageFile(imgPath) {
  const st = await fsp.stat(imgPath).catch(() => null);
  if (!st?.isFile()) throw new Error("image-not-found");
  return runTesseractOnFile(imgPath);
}

async function ocrImageBuffer(buf, mimeType) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "openbentt-ocr-"));
  const ext = extForMime(mimeType);
  const imgPath = path.join(dir, `page.${ext}`);
  try {
    await fsp.writeFile(imgPath, buf);
    return await ocrImageFile(imgPath);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * @param {{ pages?: Array<{ pageNumber?: number; dataBase64: string; mimeType?: string }>; dataBase64?: string; mimeType?: string; imagePath?: string }} payload
 */
export async function runOcr(payload) {
  const status = getOcrStatus();
  if (!status.available) {
    const err = new Error("tesseract-not-installed");
    err.code = "tesseract-not-installed";
    throw err;
  }
  if (!payload || typeof payload !== "object") throw new Error("Invalid payload");

  const pagesOut = [];

  if (Array.isArray(payload.pages) && payload.pages.length) {
    const slice = payload.pages.slice(0, MAX_OCR_PAGES);
    for (let i = 0; i < slice.length; i++) {
      const p = slice[i];
      const buf = decodeBase64(p.dataBase64);
      const { text } = await ocrImageBuffer(buf, p.mimeType ?? "image/png");
      pagesOut.push({ pageNumber: Number(p.pageNumber) > 0 ? Number(p.pageNumber) : i + 1, text });
    }
  } else if (typeof payload.imagePath === "string" && payload.imagePath) {
    const abs = path.resolve(payload.imagePath);
    const allowed = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".gif"]);
    if (!allowed.has(path.extname(abs).toLowerCase())) throw new Error("unsupported-image-type");
    const { text } = await ocrImageFile(abs);
    pagesOut.push({ pageNumber: 1, text });
  } else if (typeof payload.dataBase64 === "string") {
    const buf = decodeBase64(payload.dataBase64);
    const { text } = await ocrImageBuffer(buf, payload.mimeType ?? "image/png");
    pagesOut.push({ pageNumber: 1, text });
  } else {
    throw new Error("No OCR input");
  }

  const text = pagesOut.map((p) => p.text).filter(Boolean).join("\n\n");
  log.info("ocr finished", { pages: pagesOut.length, chars: text.length });
  return { text, pages: pagesOut, confidence: undefined };
}

export function registerOcrIpc(ipcMain, app) {
  void app;
  ipcMain.handle("documents:ocrStatus", async () => getOcrStatus());
  ipcMain.handle("documents:ocr", async (_e, payload) => {
    if (!payload || typeof payload !== "object") throw new Error("Invalid payload");
    return runOcr(payload);
  });
}