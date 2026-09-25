import { app, BrowserWindow, dialog, shell } from "electron";
import { isAllowedExternalUrl } from "./externalUrlPolicy.mjs";

const EDIT_ROLES = new Set(["undo", "redo", "cut", "copy", "paste", "selectAll"]);

function webContentsFromEvent(event) {
  const wc = event.sender;
  return wc?.isDestroyed?.() ? null : wc;
}

/** @param {import('electron').IpcMain} ipc */
export function registerDesktopWindowIpc(ipc) {
  ipc.handle("desktop:windowMinimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipc.handle("desktop:windowToggleMaximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });

  ipc.handle("desktop:windowClose", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipc.handle("desktop:windowIsMaximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  ipc.handle("desktop:editRole", (event, role) => {
    if (!EDIT_ROLES.has(role)) return;
    const wc = webContentsFromEvent(event);
    if (!wc) return;
    switch (role) {
      case "undo":
        wc.undo();
        break;
      case "redo":
        wc.redo();
        break;
      case "cut":
        wc.cut();
        break;
      case "copy":
        wc.copy();
        break;
      case "paste":
        wc.paste();
        break;
      case "selectAll":
        wc.selectAll();
        break;
      default:
        break;
    }
  });

  ipc.handle("desktop:reload", (event) => {
    webContentsFromEvent(event)?.reload();
  });

  ipc.handle("desktop:toggleDevTools", (event) => {
    webContentsFromEvent(event)?.toggleDevTools();
  });

  ipc.handle("desktop:quit", () => {
    app.quit();
  });

  ipc.handle("desktop:showAbout", async () => {
    await dialog.showMessageBox({
      type: "info",
      title: "About Openbentt",
      message: "Openbentt",
      detail: `Version ${app.getVersion()}\nSecure research chat and notebook studio.`,
      buttons: ["OK"],
    });
  });

  ipc.handle("desktop:openExternal", async (_event, url) => {
    // Centralized HTTPS-only policy (file://, javascript:, data:, custom schemes denied).
    if (!isAllowedExternalUrl(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipc.handle("desktop:openPath", async (_event, path) => {
    // Open a file or folder in the system file manager / associated app.
    if (typeof path !== "string" || !path.trim()) return { ok: false };
    const { shell } = await import("electron");
    await shell.openPath(path.trim());
    return { ok: true };
  });

  ipc.handle("desktop:pickWorkspaceFolder", async (event, currentPath) => {
    // Native folder picker (Cursor/VS Code style). Main-owned dialog; the
    // returned path is re-validated for containment on every task creation.
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const opts = {
      title: "Choose workspace folder",
      properties: ["openDirectory", "createDirectory"],
    };
    if (typeof currentPath === "string" && currentPath.trim()) {
      opts.defaultPath = currentPath.trim().slice(0, 1024);
    }
    const res = await dialog.showOpenDialog(win ?? null, opts);
    if (res.canceled || !res.filePaths?.[0]) return { path: null };
    return { path: String(res.filePaths[0]).slice(0, 4096) };
  });

  ipc.handle("desktop:copyText", async (_event, text) => {
    if (typeof text !== "string") return { ok: false };
    try {
      const { clipboard } = await import("electron");
      clipboard.writeText(text);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipc.handle("desktop:pasteText", async () => {
    try {
      const { clipboard } = await import("electron");
      const text = clipboard.readText();
      return { ok: true, text };
    } catch {
      return { ok: false, text: "" };
    }
  });
}
