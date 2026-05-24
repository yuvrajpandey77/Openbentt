/**
 * Openbentt desktop shell — loads the same Vite app as the web build.
 * - Dev (hot reload): set OPENBENTT_ELECTRON_DEV=1 → http://127.0.0.1:8080 (Vite must be running)
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
import { getGpuSafeMode } from "./gpuSafeMode.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const gpuSafeMode = getGpuSafeMode();
if (gpuSafeMode.enabled) {
  process.env.OPENBENTT_SOFTWARE_RENDERING = "1";
  console.info(
    `[electron] Software rendering enabled (${gpuSafeMode.reason ?? "safe-mode"}). WebGPU UI flags skipped.`
  );
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
}

/** One app instance — second launch focuses the existing window.
 *  Dev mode skips this so restarts never get blocked by a stale lock. */
const singleInstanceLock =
  process.env.OPENBENTT_ELECTRON_DEV === "1" || app.requestSingleInstanceLock();
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
  applyLinuxOzonePlatform();
}

/** Linux display backend — must run before app.ready. */
function applyLinuxOzonePlatform() {
  const ozoneOverride = process.env.OPENBENTT_OZONE_PLATFORM?.trim();
  const isWaylandSession =
    process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY);

  if (ozoneOverride && ozoneOverride !== "auto") {
    app.commandLine.appendSwitch("ozone-platform", ozoneOverride);
    return;
  }

  if (gpuSafeMode.enabled) {
    /**
     * On Wayland, native ozone=wayland + software rasterizer paints reliably.
     * ozone=x11 (XWayland) + software triggers invisible windows on many NVIDIA setups.
     */
    const platform = isWaylandSession ? "wayland" : "x11";
    app.commandLine.appendSwitch("ozone-platform", platform);
    app.commandLine.appendSwitch("disable-gpu-sandbox");
    app.commandLine.appendSwitch("enable-software-rasterizer");
    app.commandLine.appendSwitch(
      "disable-features",
      "Vulkan,VulkanFromANGLE,DefaultANGLEVulkan,UseSkiaRenderer"
    );
    console.info(
      `[electron] Software rendering: ozone-platform=${platform} (native, not XWayland). Override with OPENBENTT_OZONE_PLATFORM=x11|wayland.`
    );
    return;
  }

  if (isWaylandSession) {
    app.commandLine.appendSwitch("ozone-platform", "x11");
    console.info(
      "[electron] Wayland session detected; forcing --ozone-platform=x11 for Vulkan/WebGPU stability. Override with OPENBENTT_OZONE_PLATFORM=wayland or =auto."
    );
  }
}

/**
 * WebGPU for on-device Gemma — only when hardware rendering is available.
 * Set OPENBENTT_DISABLE_WEBGPU_FLAGS=1 to opt out for debugging.
 */
if (!gpuSafeMode.enabled && !process.env.OPENBENTT_DISABLE_WEBGPU_FLAGS) {
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

/** Manual override after auto-detection (must still run before app.ready). */
if (!gpuSafeMode.enabled && process.env.OPENBENTT_DISABLE_GPU === "1") {
  app.disableHardwareAcceleration();
}

const VITE_DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:8080";
/** When true, load the Vite dev server (use `npm run electron:dev`). Otherwise load built `dist/` via app:// */
const useViteDevServer = process.env.OPENBENTT_ELECTRON_DEV === "1";

/** Dev load runs async; keep the app alive if the window closes mid-retry. */
let devStartupInProgress = false;
let devWindowRecreateCount = 0;
const MAX_DEV_WINDOW_RECREATE = 2;

/** Desktop home: projects hub (Notebook Studio entry). */
const START_PATH = "/projects";

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

function ensureWindowVisible(win) {
  if (win.isDestroyed()) return;
  if (!win.isVisible()) win.show();
  win.focus();
  win.moveTop();
  if (!win.isVisible()) {
    win.setAlwaysOnTop(true, "screen-saver");
    win.show();
    win.setAlwaysOnTop(false);
  }
}

function buildBrowserWindowOptions(icon) {
  /** Framed Linux (safe mode): native menu bar + window icon; no in-app title strip. */
  const linuxNativeChrome = process.platform === "linux" && gpuSafeMode.enabled;
  const base = {
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: gpuSafeMode.enabled,
    title: "Openbentt",
    autoHideMenuBar: !linuxNativeChrome,
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

  /** Linux: framed window in safe mode — frameless + software rendering often never maps on screen. */
  return {
    ...base,
    frame: gpuSafeMode.enabled,
  };
}

function windowIconPath() {
  const p = path.resolve(__dirname, "..", "build", "icon.png");
  return fs.existsSync(p) ? p : undefined;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Vite can accept TCP connections before the first HTML/transform is ready — retry in dev. */
async function waitForViteDevServer(baseUrl, maxMs = 45_000) {
  const root = baseUrl.replace(/\/$/, "");
  const deadline = Date.now() + maxMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const res = await fetch(`${root}/`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    const delay = Math.min(250 * attempt, 1500);
    if (attempt === 1 || attempt % 5 === 0) {
      console.info(`[electron] Waiting for Vite at ${root} (attempt ${attempt})…`);
    }
    await sleep(delay);
  }
  throw new Error(`Vite dev server not ready at ${root} after ${maxMs}ms`);
}

async function loadDevUrlWithRetry(win, url, maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    if (win.isDestroyed()) {
      throw new Error(`BrowserWindow closed before dev load finished (${url})`);
    }
    try {
      await win.loadURL(url);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const delay = Math.min(300 * (i + 1), 2000);
      console.warn(
        `[electron] Dev load attempt ${i + 1}/${maxAttempts} failed (${msg}); retry in ${delay}ms…`
      );
      await sleep(delay);
    }
  }
  throw new Error(`Failed to load ${url} after ${maxAttempts} attempts. Is Vite running? (npm run dev)`);
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

  setLocalGgufProgressTarget(win);
  setZoteroProgressTarget(win);
  setUpdaterTargetWindow(win);

  if (gpuSafeMode.enabled) {
    win.center();
    ensureWindowVisible(win);
    if (process.platform === "linux") {
      win.setMenuBarVisibility(true);
    }
  }

  if (useViteDevServer) {
    /** Show immediately — don't wait for page load so the window is always visible. */
    win.show();
    win.focus();
    const devBase = VITE_DEV_URL.replace(/\/$/, "");
    const devStart = `${devBase}${START_PATH}`;
    devStartupInProgress = true;
    win.webContents.on("did-fail-load", (_event, code, _desc, url, isMainFrame) => {
      if (isMainFrame) {
        console.warn(`[electron] Main frame failed to load (${code}): ${url}`);
      }
    });
    void (async () => {
      try {
        await waitForViteDevServer(devBase);
        await loadDevUrlWithRetry(win, devStart);
        if (process.env.OPENBENTT_ELECTRON_DEVTOOLS === "1" && !win.isDestroyed()) {
          win.webContents.openDevTools({ mode: "detach" });
        }
      } catch (err) {
        console.error("[electron]", err instanceof Error ? err.message : err);
      } finally {
        devStartupInProgress = false;
      }
      if (!win.isDestroyed() && !win.isVisible()) win.show();
    })();
    /** Show window unconditionally after 3 s so a silent load failure never leaves it invisible. */
    sleep(3000).then(() => { if (!win.isDestroyed() && !win.isVisible()) win.show(); });
  } else {
    win.once("ready-to-show", () => ensureWindowVisible(win));
    win.webContents.on("did-finish-load", () => ensureWindowVisible(win));
    win.webContents.on("did-fail-load", (_event, code, desc, url, isMainFrame) => {
      if (isMainFrame) {
        console.error(`[electron] Production load failed (${code}): ${url} — ${desc}`);
        ensureWindowVisible(win);
      }
    });
    win.loadURL(`app://openbentt${START_PATH}`);
    sleep(2000).then(() => ensureWindowVisible(win));
    sleep(5000).then(() => ensureWindowVisible(win));
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
  if (process.platform === "darwin") return;
  if (useViteDevServer && devStartupInProgress && devWindowRecreateCount < MAX_DEV_WINDOW_RECREATE) {
    devWindowRecreateCount += 1;
    console.warn("[electron] Window closed during dev startup — recreating…");
    createWindow();
    return;
  }
  app.quit();
});
