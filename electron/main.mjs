/**
 * Openbentt desktop shell — loads the same Vite app as the web build.
 * - Dev (hot reload): set OPENBENTT_ELECTRON_DEV=1 → http://localhost:8080 (Vite must be running)
 * - Packaged / local dist: custom app:// protocol → dist/ with SPA fallback (no src/ changes)
 */
import { app, BrowserWindow, protocol, net, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  cleanupLocalGgufOnQuit,
  registerLocalGgufIpc,
  setLocalGgufProgressTarget,
} from "./localGgufService.mjs";
import { registerHfSecretIpc } from "./hfSecretStore.mjs";
import { registerSecretVaultIpc } from "./secretVault.mjs";
import { registerDesktopUpdaterIpc, setUpdaterTargetWindow } from "./updater.mjs";
import { registerDesktopWindowIpc } from "./desktopWindowIpc.mjs";
import { setupApplicationMenu } from "./appMenu.mjs";
import {
  registerResearchProjectIpc,
  shutdownResearchServices,
} from "./researchProjectService.mjs";
import {
  cleanupZoteroOnQuit,
  registerZoteroIpc,
  setZoteroProgressTarget,
} from "./zoteroService.mjs";
import { registerZoteroSecretIpc } from "./zoteroSecretStore.mjs";
import { resolveUnderDistRoot } from "./ipcValidate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** One app instance — second launch focuses the existing window. */
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

/**
 * Linux display: on **Wayland**, Chromium logs `--ozone-platform=wayland is not compatible with Vulkan`
 * and `Failed to create vulkan surface` (often alongside GBM / `driver (null)` lines), which breaks GPU
 * compositing and can destabilize WebGPU/WASM (showing up as opaque WASM traps in the chat).
 *
 * Since we *want* Vulkan for WebGPU on Linux (see flags below), default Ozone to **x11** when the
 * session is Wayland. Override with `OPENBENTT_OZONE_PLATFORM=wayland` (force Wayland) or
 * `OPENBENTT_OZONE_PLATFORM=auto` (let Chromium decide).
 */
if (process.platform === "linux") {
  const ozoneOverride = process.env.OPENBENTT_OZONE_PLATFORM?.trim();
  const isWaylandSession =
    process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY);
  if (ozoneOverride && ozoneOverride !== "auto") {
    app.commandLine.appendSwitch("ozone-platform", ozoneOverride);
  } else if (!ozoneOverride && isWaylandSession) {
    app.commandLine.appendSwitch("ozone-platform", "x11");
    console.info(
      "[electron] Wayland session detected; forcing --ozone-platform=x11 for Vulkan/WebGPU stability. Override with OPENBENTT_OZONE_PLATFORM=wayland or =auto."
    );
  }
}

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
     * Forcing Skia/ANGLE onto Vulkan (`Vulkan,VulkanFromANGLE,DefaultANGLEVulkan`) is what was
     * triggering `Failed to create vulkan surface` on Wayland and on NVIDIA + X11/XWayland here
     * (`GetGeometry failed for window 1`, `XGetWindowAttributes failed`). That breaks the GPU
     * process and surfaces in the chat as opaque WASM traps (`table index is out of bounds`,
     * `unaligned access`, etc.).
     *
     * WebGPU (Dawn) does not require those features; we leave it on with `enable-unsafe-webgpu`.
     * Set OPENBENTT_LINUX_FORCE_VULKAN_FEATURES=1 to opt back in if your driver actually likes them.
     */
    if (process.env.OPENBENTT_LINUX_FORCE_VULKAN_FEATURES === "1") {
      app.commandLine.appendSwitch(
        "enable-features",
        "Vulkan,VulkanFromANGLE,DefaultANGLEVulkan"
      );
    }
  }
}

/**
 * Last-resort escape hatch for broken Linux GPU stacks: `OPENBENTT_DISABLE_GPU=1` runs Chromium
 * fully software-rendered. WebGPU will not work in this mode, but the app window will at least open.
 */
if (process.env.OPENBENTT_DISABLE_GPU === "1") {
  app.disableHardwareAcceleration();
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
    let filePath = resolveUnderDistRoot(distRoot, pathname);
    try {
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(path.resolve(distRoot), "index.html");
      }
    } catch {
      filePath = path.join(path.resolve(distRoot), "index.html");
    }
    return net.fetch(pathToFileURL(filePath).href);
  });
}

/** App shell background — matches `.app-shell { --background: 0 0% 12% }` → #1f1f1f */
const APP_SHELL_BG = "#1f1f1f";
/** Compact caption strip (native overlay height on Windows; in-app bar elsewhere). */
const TITLE_BAR_HEIGHT = 28;

function buildBrowserWindowOptions(icon) {
  const base = {
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Openbentt",
    autoHideMenuBar: true,
    backgroundColor: APP_SHELL_BG,
    ...(icon ? { icon } : {}),
  };

  if (process.platform === "win32") {
    return {
      ...base,
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: APP_SHELL_BG,
        symbolColor: "#cccccc",
        height: TITLE_BAR_HEIGHT,
      },
    };
  }

  if (process.platform === "darwin") {
    return {
      ...base,
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 12, y: 5 },
    };
  }

  /** Linux: frameless window — renderer draws title bar + window controls. */
  return {
    ...base,
    frame: false,
  };
}

function windowIconPath() {
  const p = path.resolve(__dirname, "..", "build", "icon.png");
  return fs.existsSync(p) ? p : undefined;
}

function createWindow() {
  const icon = windowIconPath();
  const win = new BrowserWindow({
    ...buildBrowserWindowOptions(icon),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.platform === "darwin") {
    win.setTitleBarOverlay({
      color: APP_SHELL_BG,
      symbolColor: "#cccccc",
      height: TITLE_BAR_HEIGHT,
    });
  }

  win.once("ready-to-show", () => win.show());
  setLocalGgufProgressTarget(win);
  setZoteroProgressTarget(win);
  setUpdaterTargetWindow(win);

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

if (singleInstanceLock) {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

app.whenReady().then(async () => {
  setupApplicationMenu({ isDev: useViteDevServer });
  registerDesktopUpdaterIpc();
  registerDesktopWindowIpc(ipcMain);
  registerHfSecretIpc(ipcMain, app);
  registerSecretVaultIpc(ipcMain, app);
  registerLocalGgufIpc(ipcMain, app);
  registerResearchProjectIpc(ipcMain, app);
  registerZoteroSecretIpc(ipcMain, app);
  registerZoteroIpc(ipcMain, app);
  if (!useViteDevServer) {
    registerAppProtocolHandler();
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("research:beforeQuit");
    }
  }
  cleanupLocalGgufOnQuit();
  cleanupZoteroOnQuit();
  shutdownResearchServices();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
