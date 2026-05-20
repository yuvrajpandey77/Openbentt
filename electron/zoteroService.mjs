/**
 * Zotero connector — local detection, Web API sync, Better BibTeX file watching.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readZoteroApiKeyMaybe, writeZoteroApiKey } from "./zoteroSecretStore.mjs";
import { mapZoteroApiToSnapshot } from "../src/lib/zotero/zoteroMapper.mjs";

const ZOTERO_API = "https://api.zotero.org";

/** @type {import('electron').BrowserWindow | null} */
let progressTarget = null;

/** @type {fs.FSWatcher | null} */
let bbtWatcher = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let bbtDebounce = null;

/**
 * @param {import('electron').BrowserWindow | null} win
 */
export function setZoteroProgressTarget(win) {
  progressTarget = win;
}

function emitProgress(payload) {
  if (progressTarget && !progressTarget.isDestroyed()) {
    progressTarget.webContents.send("zotero:syncProgress", payload);
  }
}

function emitLibraryChanged(payload) {
  if (progressTarget && !progressTarget.isDestroyed()) {
    progressTarget.webContents.send("zotero:libraryChanged", payload);
  }
}

function zoteroRoot(app) {
  return path.join(app.getPath("userData"), "zotero");
}

function configPath(app) {
  return path.join(zoteroRoot(app), "config.json");
}

function libraryCachePath(app) {
  return path.join(zoteroRoot(app), "library.json");
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function apiHeaders(apiKey) {
  return {
    "Zotero-API-Key": apiKey,
    "Zotero-API-Version": "3",
  };
}

/** Detect local Zotero data directory per platform. */
export function detectLocalZotero() {
  const home = os.homedir();
  const platform = process.platform;
  const candidates = [];

  if (platform === "linux") {
    candidates.push(path.join(home, ".zotero", "zotero"));
    candidates.push(path.join(home, "Zotero"));
  } else if (platform === "darwin") {
    candidates.push(path.join(home, "Zotero"));
  } else if (platform === "win32") {
    candidates.push(path.join(home, "Zotero"));
    const appData = process.env.APPDATA;
    if (appData) candidates.push(path.join(appData, "Zotero"));
  }

  for (const dataDir of candidates) {
    try {
      if (!fs.existsSync(dataDir)) continue;
      const profilesIni = path.join(dataDir, "profiles.ini");
      if (!fs.existsSync(profilesIni)) continue;

      const ini = fs.readFileSync(profilesIni, "utf8");
      const defaultMatch = ini.match(/Path=(.+)/);
      const profileRel = defaultMatch?.[1]?.trim();
      if (!profileRel) continue;

      const profileDir = path.join(dataDir, profileRel);
      const sqlitePath = path.join(profileDir, "zotero.sqlite");
      const storageDir = path.join(profileDir, "storage");

      return {
        found: true,
        dataDir,
        profileDir,
        sqlitePath: fs.existsSync(sqlitePath) ? sqlitePath : undefined,
        storageDir: fs.existsSync(storageDir) ? storageDir : undefined,
        platform,
      };
    } catch {
      /* try next */
    }
  }

  return { found: false, platform };
}

/** Check for Better BibTeX plugin in Zotero extensions. */
export function detectBetterBibTeXPlugin(profileDir) {
  if (!profileDir) return { detected: false, watching: false, citekeyField: "key" };
  try {
    const extPath = path.join(profileDir, "extensions.json");
    if (!fs.existsSync(extPath)) {
      return { detected: false, watching: false, citekeyField: "key" };
    }
    const raw = fs.readFileSync(extPath, "utf8");
    const detected = /better-bibtex|retorquere\.zotero\.better-bibtex/i.test(raw);
    return {
      detected,
      watching: false,
      citekeyField: detected ? "citationKey" : "key",
      autoExportPath: undefined,
    };
  } catch {
    return { detected: false, watching: false, citekeyField: "key" };
  }
}

function detectBbtInBib(bibText) {
  return (
    /\bcitationkey\s*=/i.test(bibText) ||
    /\bbetter\s*bib\s*tex\b/i.test(bibText)
  );
}

async function fetchAllItems(userId, apiKey, onProgress) {
  const out = [];
  let start = 0;
  const limit = 100;
  let total = 1;

  while (start < total) {
    const url = `${ZOTERO_API}/users/${userId}/items?limit=${limit}&start=${start}&include=data`;
    const res = await fetch(url, { headers: apiHeaders(apiKey) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Zotero items fetch failed (${res.status}): ${body || res.statusText}`);
    }
    total = Number(res.headers.get("Total-Results") ?? out.length + limit);
    const json = await res.json();
    for (const row of json) {
      if (row.data) out.push(row.data);
    }
    start += limit;
    onProgress?.(Math.min(start, total), total);
  }
  return out;
}

async function syncFromWebApi(app, userId, apiKey) {
  emitProgress({ phase: "fetching", message: "Authenticating with Zotero…" });

  const whoRes = await fetch(`${ZOTERO_API}/keys/current`, { headers: apiHeaders(apiKey) });
  if (!whoRes.ok) {
    const body = await whoRes.text().catch(() => "");
    throw new Error(`Zotero auth failed (${whoRes.status}): ${body || whoRes.statusText}`);
  }
  const who = await whoRes.json();

  emitProgress({ phase: "fetching", message: "Fetching collections…", current: 0, total: 4 });
  const colRes = await fetch(`${ZOTERO_API}/users/${userId}/collections?limit=100`, {
    headers: apiHeaders(apiKey),
  });
  if (!colRes.ok) throw new Error(`Collections fetch failed (${colRes.status})`);
  const collections = await colRes.json();

  emitProgress({ phase: "fetching", message: "Fetching tags…", current: 1, total: 4 });
  const tagRes = await fetch(`${ZOTERO_API}/users/${userId}/tags?limit=1000`, {
    headers: apiHeaders(apiKey),
  });
  const tags = tagRes.ok ? await tagRes.json() : [];

  emitProgress({ phase: "fetching", message: "Fetching library items…", current: 2, total: 4 });
  const items = await fetchAllItems(userId, apiKey, (cur, tot) => {
    emitProgress({
      phase: "fetching",
      message: `Fetching items ${cur}/${tot}…`,
      current: cur,
      total: tot,
      percent: Math.round((cur / tot) * 100),
    });
  });

  const libraryVersion = Number(
    (await fetch(`${ZOTERO_API}/users/${userId}/items?limit=1`, { headers: apiHeaders(apiKey) }))
      .headers.get("Last-Modified-Version") ?? 0
  );

  emitProgress({ phase: "merging", message: "Building library snapshot…" });
  const mapped = mapZoteroApiToSnapshot(items, collections, tags, String(userId), {
    mode: "web",
    libraryVersion,
  });
  const snapshot = {
    syncedAt: new Date().toISOString(),
    mode: "web",
    userId: String(userId),
    itemCount: mapped.items.length,
    warnings: [],
    ...mapped,
    libraryVersion,
  };

  await writeJson(libraryCachePath(app), snapshot);
  const cfg = await readJson(configPath(app), {});
  await writeJson(configPath(app), {
    ...cfg,
    userId: String(userId),
    userName: who.username,
    lastSyncAt: snapshot.syncedAt,
    lastSyncMode: "web",
    lastError: undefined,
  });

  emitProgress({ phase: "complete", message: `Synced ${snapshot.itemCount} items` });
  emitLibraryChanged({ snapshot });
  return snapshot;
}

async function syncFromBbtFile(app, exportPath) {
  emitProgress({ phase: "fetching", message: "Reading Better BibTeX export…" });
  if (!exportPath || !fs.existsSync(exportPath)) {
    throw new Error(`Better BibTeX export file not found: ${exportPath || "(not configured)"}`);
  }
  const bibliography = await fsp.readFile(exportPath, "utf8");
  const warnings = [];
  const bbt = detectBbtInBib(bibliography);
  if (!bbt) warnings.push("File does not appear to be a Better BibTeX export (no citationKey fields).");

  const local = detectLocalZotero();
  const bbtInfo = detectBetterBibTeXPlugin(local.profileDir);

  const snapshot = {
    syncedAt: new Date().toISOString(),
    mode: "better-bibtex",
    itemCount: (bibliography.match(/@\w+\{/g) ?? []).length,
    collections: [],
    tags: [],
    items: [],
    notes: [],
    attachments: [],
    annotations: [],
    bibliography,
    warnings,
  };

  await writeJson(libraryCachePath(app), snapshot);
  const cfg = await readJson(configPath(app), {});
  await writeJson(configPath(app), {
    ...cfg,
    bbtExportPath: exportPath,
    lastSyncAt: snapshot.syncedAt,
    lastSyncMode: "better-bibtex",
    lastError: undefined,
    betterBibTeX: { ...bbtInfo, detected: bbt || bbtInfo.detected, autoExportPath: exportPath },
  });

  emitProgress({ phase: "complete", message: `Imported ${snapshot.itemCount} BibTeX entries` });
  emitLibraryChanged({ snapshot });
  return snapshot;
}

function stopBbtWatch() {
  if (bbtWatcher) {
    bbtWatcher.close();
    bbtWatcher = null;
  }
  if (bbtDebounce) {
    clearTimeout(bbtDebounce);
    bbtDebounce = null;
  }
}

/**
 * @param {import('electron').App} app
 * @param {string} exportPath
 * @param {(snapshot: unknown) => void} onUpdate
 */
function startBbtWatch(app, exportPath, onUpdate) {
  stopBbtWatch();
  if (!exportPath || !fs.existsSync(exportPath)) return { ok: false, error: "Export path missing" };

  bbtWatcher = fs.watch(exportPath, { persistent: false }, () => {
    if (bbtDebounce) clearTimeout(bbtDebounce);
    bbtDebounce = setTimeout(async () => {
      try {
        emitProgress({ phase: "watching", message: "Better BibTeX export changed — syncing…" });
        const snapshot = await syncFromBbtFile(app, exportPath);
        onUpdate?.(snapshot);
      } catch (e) {
        console.warn("[zotero] BBT watch sync failed:", e);
        emitProgress({
          phase: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }, 400);
  });

  return { ok: true };
}

/**
 * @param {import('electron').App} app
 * @param {Record<string, unknown>} [opts]
 */
async function performZoteroSync(app, opts = {}) {
  const cfg = await readJson(configPath(app), {});
  const apiKey = await readZoteroApiKeyMaybe(app);
  const mode = opts.mode ?? cfg.lastSyncMode ?? (cfg.bbtExportPath ? "better-bibtex" : "web");

  try {
    emitProgress({ phase: "detecting", message: "Starting Zotero sync…" });

    if (mode === "better-bibtex" || opts.useBbt) {
      const exportPath = opts.bbtExportPath ?? cfg.bbtExportPath;
      return { ok: true, snapshot: await syncFromBbtFile(app, exportPath) };
    }

    if (!cfg.userId || !apiKey.trim()) {
      throw new Error("Zotero Web API credentials missing. Set user ID and API key.");
    }

    const snapshot = await syncFromWebApi(app, cfg.userId, apiKey.trim());
    return { ok: true, snapshot };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeJson(configPath(app), { ...cfg, lastError: msg });
    emitProgress({ phase: "error", message: msg });
    return { ok: false, error: msg, partial: false, warnings: [msg] };
  }
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {import('electron').App} app
 */
export function registerZoteroIpc(ipcMain, app) {
  ipcMain.handle("zotero:detectLocal", async () => {
    const local = detectLocalZotero();
    const bbt = detectBetterBibTeXPlugin(local.profileDir);
    const cfg = await readJson(configPath(app), {});
    if (cfg.bbtExportPath) bbt.autoExportPath = cfg.bbtExportPath;
    return { local, betterBibTeX: bbt };
  });

  ipcMain.handle("zotero:status", async () => {
    const local = detectLocalZotero();
    const cfg = await readJson(configPath(app), {});
    const bbt = { ...detectBetterBibTeXPlugin(local.profileDir), ...(cfg.betterBibTeX ?? {}) };
    const hasKey = Boolean((await readZoteroApiKeyMaybe(app)).trim());
    const userId = cfg.userId;
    const mode = cfg.lastSyncMode ?? (hasKey && userId ? "web" : local.found ? "local" : "disconnected");
    return {
      mode,
      connected: mode !== "disconnected" && Boolean(cfg.lastSyncAt),
      userId: cfg.userId,
      userName: cfg.userName,
      local,
      betterBibTeX: bbt,
      lastSyncAt: cfg.lastSyncAt,
      lastError: cfg.lastError,
      syncing: false,
      hasApiKey: hasKey,
      bbtExportPath: cfg.bbtExportPath,
    };
  });

  ipcMain.handle("zotero:setCredentials", async (_e, userId, apiKey) => {
    if (!userId || !apiKey) throw new Error("userId and apiKey required");
    await writeZoteroApiKey(app, apiKey);
    const cfg = await readJson(configPath(app), {});
    await writeJson(configPath(app), { ...cfg, userId: String(userId) });
    return { ok: true };
  });

  ipcMain.handle("zotero:clearCredentials", async () => {
    await writeZoteroApiKey(app, "");
    const cfg = await readJson(configPath(app), {});
    await writeJson(configPath(app), { ...cfg, userId: undefined, userName: undefined });
    return { ok: true };
  });

  ipcMain.handle("zotero:setBbtExportPath", async (_e, exportPath) => {
    const cfg = await readJson(configPath(app), {});
    await writeJson(configPath(app), { ...cfg, bbtExportPath: exportPath });
    return { ok: true };
  });

  ipcMain.handle("zotero:sync", async (_e, opts = {}) => performZoteroSync(app, opts));

  ipcMain.handle("zotero:getLibrarySnapshot", async () => {
    return readJson(libraryCachePath(app), null);
  });

  ipcMain.handle("zotero:watchBetterBibTeX", async (_e, exportPath) => {
    const p = exportPath ?? (await readJson(configPath(app), {})).bbtExportPath;
    const result = startBbtWatch(app, p, (snapshot) => emitLibraryChanged({ snapshot }));
    const cfg = await readJson(configPath(app), {});
    await writeJson(configPath(app), {
      ...cfg,
      bbtExportPath: p,
      betterBibTeX: {
        ...detectBetterBibTeXPlugin(detectLocalZotero().profileDir),
        watching: result.ok,
        autoExportPath: p,
      },
    });
    return result;
  });

  ipcMain.handle("zotero:stopWatch", async () => {
    stopBbtWatch();
    return { ok: true };
  });

  ipcMain.handle("zotero:refreshLibrary", async (_e, opts = {}) => performZoteroSync(app, opts));
}

export function cleanupZoteroOnQuit() {
  stopBbtWatch();
}
