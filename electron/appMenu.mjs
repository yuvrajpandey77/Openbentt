import { app, BrowserWindow, Menu, shell, dialog } from "electron";

const DOCS_URL = process.env.VITE_PUBLIC_SITE_URL?.trim() || "https://openbentt.vercel.app";

function focusedWebContents() {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  return win?.isDestroyed() ? null : win?.webContents ?? null;
}

function menuNavigate(path) {
  const wc = focusedWebContents();
  if (wc && !wc.isDestroyed()) {
    wc.send("desktop:menuNavigate", path);
  }
}

async function showAboutDialog() {
  await dialog.showMessageBox({
    type: "info",
    title: "About Openbentt",
    message: "Openbentt",
    detail: `Version ${app.getVersion()}\nSecure research chat and notebook studio.`,
    buttons: ["OK"],
  });
}

/**
 * Native application menu (macOS menu bar, Linux/Windows menu bar when visible).
 * Frameless Linux uses duplicate menus in the in-app title bar; framed safe mode uses this only.
 * @param {{ isDev?: boolean }} opts
 */
export function setupApplicationMenu(opts = {}) {
  const { isDev = false } = opts;
  const isMac = process.platform === "darwin";
  const isLinux = process.platform === "linux";

  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const template = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        {
          label: "About Openbentt",
          click: () => void showAboutDialog(),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push(
    {
      label: "File",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: () => menuNavigate("/chat"),
        },
        {
          label: "Projects",
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => menuNavigate("/projects"),
        },
        {
          label: "Notebook Studio",
          click: () => menuNavigate("/notebook"),
        },
        { type: "separator" },
        isMac
          ? { role: "close", label: "Close Window" }
          : { label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload", visible: isDev },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Openbentt",
          click: () => void showAboutDialog(),
        },
        {
          label: "Openbentt Website",
          click: () => void shell.openExternal(DOCS_URL),
        },
      ],
    }
  );

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  /** Keep File/Edit/View/Help visible below the title bar on framed Linux (safe mode). */
  if (isLinux) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.setMenuBarVisibility(true);
      }
    }
  }
}
