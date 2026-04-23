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

/**
 * WebGPU for on-device Gemma (@huggingface/transformers): on many Linux / Mesa / hybrid setups
 * Chromium refuses `navigator.gpu.requestAdapter()` unless this switch is set. Must run before
 * app.ready (see Chromium "Failed to get GPU adapter" / "enable-unsafe-webgpu").
 * Set OPENBENTT_DISABLE_WEBGPU_FLAGS=1 to opt out for debugging.
 */
if (!process.env.OPENBENTT_DISABLE_WEBGPU_FLAGS) {
  app.commandLine.appendSwitch("enable-unsafe-webgpu");
  if (process.platform === "linux") {
    /** Many integrated / Mesa drivers are blocklisted for WebGPU until this is set. */
    app.commandLine.appendSwitch("ignore-gpu-blocklist");
    /**
     * Without Vulkan + ANGLE defaults, Chromium often logs "Device failed at creation" and WebGPU
     * sessions fail (ORT may surface an opaque numeric code). See gpuweb/gpuweb#5022.
     * Set OPENBENTT_LINUX_WEBGPU_SKIP_VULKAN_FEATURES=1 if this causes regressions on your GPU.
     */
    if (!process.env.OPENBENTT_LINUX_WEBGPU_SKIP_VULKAN_FEATURES) {
      app.commandLine.appendSwitch(
        "enable-features",
        "Vulkan,VulkanFromANGLE,DefaultANGLEVulkan"
      );
    }
  }
}

const VITE_DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:8080";
/** When true, load the Vite dev server (use `npm run electron:dev`). Otherwise load built `dist/` via app:// */
const useViteDevServer = process.env.OPENBENTT_ELECTRON_DEV === "1";

/** Open the workspace shell, not `/` (marketing landing). Same routes as the web app; desktop is product-first. */
const START_PATH = "/chat";

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
    const devBase = VITE_DEV_URL.replace(/\/$/, "");
    const devStart = `${devBase}${START_PATH}`;
    win.loadURL(devStart).catch((err) => {
      console.error(`[electron] Failed to load ${devStart}. Is Vite running? (npm run dev)`, err);
    });
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // Path must match React Router (e.g. `/chat` → workspace); `app://` has no pathname → would show `/` landing.
    win.loadURL(`app://openbentt${START_PATH}`);
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
