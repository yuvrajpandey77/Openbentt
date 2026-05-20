/**
 * Zotero API key storage via Electron safeStorage when available.
 */
import { safeStorage } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const FILE_NAME_ENCRYPTED = "zotero_api_key.blob";
const FILE_NAME_FALLBACK = "zotero_api_key.secret";

/**
 * @param {import('electron').App} app
 */
export function zoteroSecretPaths(app) {
  const dir = path.join(app.getPath("userData"), ".secrets");
  return {
    dir,
    encrypted: path.join(dir, FILE_NAME_ENCRYPTED),
    fallback: path.join(dir, FILE_NAME_FALLBACK),
  };
}

async function ensureSecretsDir(paths) {
  await fsp.mkdir(paths.dir, { recursive: true, mode: 0o700 });
}

/**
 * @param {import('electron').App} app
 */
export async function readZoteroApiKeyMaybe(app) {
  const paths = zoteroSecretPaths(app);
  try {
    if (fs.existsSync(paths.encrypted) && safeStorage.isEncryptionAvailable()) {
      const buf = await fsp.readFile(paths.encrypted);
      return safeStorage.decryptString(buf);
    }
  } catch (e) {
    console.warn("[zoteroSecret] decrypt failed:", e);
  }
  try {
    if (fs.existsSync(paths.fallback)) {
      const t = (await fsp.readFile(paths.fallback, "utf8")).trim();
      return t || "";
    }
  } catch {
    /* empty */
  }
  return "";
}

/**
 * @param {import('electron').App} app
 */
export async function writeZoteroApiKey(app, raw) {
  const paths = zoteroSecretPaths(app);
  await ensureSecretsDir(paths);
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  await fsp.unlink(paths.encrypted).catch(() => {});
  await fsp.unlink(paths.fallback).catch(() => {});
  if (!trimmed) {
    return { ok: true, mode: "cleared" };
  }
  if (safeStorage.isEncryptionAvailable()) {
    const blob = safeStorage.encryptString(trimmed);
    await fsp.writeFile(paths.encrypted, blob, { mode: 0o600 });
    return { ok: true, mode: "encrypted" };
  }
  console.warn("[zoteroSecret] safeStorage unavailable; writing restricted-permission plaintext fallback.");
  await fsp.writeFile(paths.fallback, trimmed, { mode: 0o600 });
  return { ok: true, mode: "fallback-plain" };
}

/**
 * @param {import('electron').App} app
 */
export async function zoteroHasStoredApiKey(app) {
  const t = await readZoteroApiKeyMaybe(app);
  return Boolean(t.trim());
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {import('electron').App} app
 */
export function registerZoteroSecretIpc(ipcMain, app) {
  ipcMain.handle("zoteroSecret:status", async () => {
    const stored = await zoteroHasStoredApiKey(app);
    return {
      stored,
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
    };
  });

  ipcMain.handle("zoteroSecret:set", async (_e, token) => {
    if (typeof token !== "string") {
      await writeZoteroApiKey(app, "");
      return { ok: true };
    }
    await writeZoteroApiKey(app, token);
    return { ok: true };
  });

  ipcMain.handle("zoteroSecret:clear", async () => {
    await writeZoteroApiKey(app, "");
    return { ok: true };
  });
}
