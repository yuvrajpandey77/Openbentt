/**
 * GitHub Releases auto-update (packaged desktop builds only).
 */
import { app, ipcMain, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

/** @type {BrowserWindow | null} */
let mainWindow = null;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/**
 * @param {BrowserWindow} win
 */
export function setUpdaterTargetWindow(win) {
  mainWindow = win;
}

export function registerDesktopUpdaterIpc() {
  if (!app.isPackaged) {
    ipcMain.handle("desktop:checkForUpdates", async () => ({
      ok: false,
      message: "Updates are checked in installed builds only.",
    }));
    ipcMain.handle("desktop:downloadUpdate", async () => ({ ok: false }));
    ipcMain.handle("desktop:installUpdate", async () => ({ ok: false }));
    ipcMain.handle("desktop:getAppVersion", () => app.getVersion());
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    send("desktop:updateStatus", { phase: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    send("desktop:updateStatus", {
      phase: "available",
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    send("desktop:updateStatus", {
      phase: "not-available",
      version: info?.version,
    });
  });

  autoUpdater.on("error", (err) => {
    send("desktop:updateStatus", {
      phase: "error",
      message: err?.message ?? String(err),
    });
  });

  autoUpdater.on("download-progress", (p) => {
    send("desktop:updateStatus", {
      phase: "downloading",
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    send("desktop:updateStatus", {
      phase: "downloaded",
      version: info.version,
    });
  });

  ipcMain.handle("desktop:getAppVersion", () => app.getVersion());

  ipcMain.handle("desktop:checkForUpdates", async () => {
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, updateInfo: r?.updateInfo?.version ?? null };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("desktop:downloadUpdate", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("desktop:installUpdate", () => {
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });

  // Background check ~30s after launch (non-blocking).
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30_000);
}
