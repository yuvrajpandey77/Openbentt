import { app, BrowserWindow, dialog, shell } from "electron";

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
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });
}
