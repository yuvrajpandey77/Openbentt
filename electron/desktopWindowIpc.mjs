import { BrowserWindow, ipcMain } from "electron";

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
}
