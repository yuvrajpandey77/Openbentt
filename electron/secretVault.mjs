/**
 * Desktop credential vault — Electron safeStorage when available.
 * Keys: provider_api_key, brave_search_api_key (never in renderer localStorage).
 */
import { safeStorage } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/** @type {ReadonlySet<string>} */
export const SECRET_VAULT_KEYS = new Set(["provider_api_key", "brave_search_api_key"]);

/**
 * @param {import('electron').App} app
 * @param {string} key
 */
export function vaultPaths(app, key) {
  if (!SECRET_VAULT_KEYS.has(key)) {
    throw new Error(`Invalid vault key: ${key}`);
  }
  const dir = path.join(app.getPath("userData"), ".secrets");
  const fileStem = key.replace(/_/g, "-");
  return {
    dir,
    encrypted: path.join(dir, `${fileStem}.blob`),
    fallback: path.join(dir, `${fileStem}.secret`),
  };
}

/**
 * @param {{ dir: string }} paths
 */
async function ensureSecretsDir(paths) {
  await fsp.mkdir(paths.dir, { recursive: true, mode: 0o700 });
}

/**
 * @param {import('electron').App} app
 * @param {string} key
 */
export async function readVaultSecret(app, key) {
  const paths = vaultPaths(app, key);
  try {
    if (fs.existsSync(paths.encrypted) && safeStorage.isEncryptionAvailable()) {
      const buf = await fsp.readFile(paths.encrypted);
      return safeStorage.decryptString(buf);
    }
  } catch (e) {
    console.warn(`[secretVault] decrypt failed (${key}):`, e);
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
 * @param {string} key
 * @param {unknown} raw
 */
export async function writeVaultSecret(app, key, raw) {
  const paths = vaultPaths(app, key);
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
  console.warn(`[secretVault] safeStorage unavailable for ${key}; restricted-permission fallback.`);
  await fsp.writeFile(paths.fallback, trimmed, { mode: 0o600 });
  return { ok: true, mode: "fallback-plain" };
}

/**
 * @param {import('electron').App} app
 */
export async function vaultStatus(app) {
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  const stored = {};
  for (const key of SECRET_VAULT_KEYS) {
    const v = await readVaultSecret(app, key);
    stored[key] = Boolean(v.trim());
  }
  return { stored, encryptionAvailable };
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {import('electron').App} app
 */
export function registerSecretVaultIpc(ipcMain, app) {
  ipcMain.handle("secretVault:status", async () => vaultStatus(app));

  ipcMain.handle("secretVault:load", async () => {
    const providerApiKey = await readVaultSecret(app, "provider_api_key");
    const braveSearchApiKey = await readVaultSecret(app, "brave_search_api_key");
    return { providerApiKey, braveSearchApiKey };
  });

  ipcMain.handle("secretVault:set", async (_e, key, value) => {
    if (!SECRET_VAULT_KEYS.has(key)) {
      throw new Error("Invalid vault key");
    }
    if (typeof value !== "string") {
      await writeVaultSecret(app, key, "");
      return { ok: true };
    }
    await writeVaultSecret(app, key, value);
    return { ok: true };
  });

  ipcMain.handle("secretVault:clear", async (_e, key) => {
    if (!SECRET_VAULT_KEYS.has(key)) {
      throw new Error("Invalid vault key");
    }
    await writeVaultSecret(app, key, "");
    return { ok: true };
  });
}
