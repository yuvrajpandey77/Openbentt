/**
 * Openbentt desktop shell — loads the same Vite app as the web build.
 * - Dev (hot reload): set OPENBENTT_ELECTRON_DEV=1 → http://localhost:8080 (Vite must be running)
 * - Packaged / local dist: custom app:// protocol → dist/ with SPA fallback (no src/ changes)
 */
import { app, BrowserWindow, protocol, net } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VITE_DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:8080";
/** When true, load the Vite dev server (use `npm run electron:dev`). Otherwise load built `dist/` via app:// */
const useViteDevServer = process.env.OPENBENTT_ELECTRON_DEV === "1";

/** Must run before app.ready (Electron requirement). */
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

function getDistRoot() {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), "dist");
  }
  return path.resolve(__dirname, "..", "dist");
}

function registerAppProtocolHandler() {
  protocol.handle("app", (request) => {
    const distRoot = getDistRoot();
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || pathname === "") {
      pathname = "/index.html";
    }
    let filePath = path.join(distRoot, pathname);
    try {
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distRoot, "index.html");
      }
    } catch {
      filePath = path.join(distRoot, "index.html");
    }
    return net.fetch(pathToFileURL(filePath).href);
  });
}

/** Near app light background (210 20% 99%) so the native title bar area matches the shell before paint. */
const WINDOW_BG = "#fafbfc";

function windowIconPath() {
  const p = path.resolve(__dirname, "..", "build", "icon.png");
  return fs.existsSync(p) ? p : undefined;
}

function createWindow() {
  const icon = windowIconPath();
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Openbentt",
    ...(icon ? { icon } : {}),
    backgroundColor: WINDOW_BG,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (useViteDevServer) {
    win.loadURL(VITE_DEV_URL).catch((err) => {
      console.error(`[electron] Failed to load ${VITE_DEV_URL}. Is Vite running? (npm run dev)`, err);
    });
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // Use a normal path `/` so React Router sees `/` (not `/index.html`, which would 404 in-app).
    win.loadURL("app://openbentt/");
  }
}

app.whenReady().then(() => {
  if (!useViteDevServer) {
    registerAppProtocolHandler();
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
