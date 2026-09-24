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
import { registerOllamaIpc } from "./ollamaService.mjs";
import { registerOpenCodeIpc, setOpenCodeEventTarget, cleanupOpenCodeOnQuit, reconcileAgentStateOnStartup, shutdownAgentServices } from "./opencodeService.mjs";
import { registerWorkspaceIpc, setWorkspaceEventTarget, cleanupWorkspaceOnQuit } from "./workspaceService.mjs";
import { registerLatexIpc } from "./latexService.mjs";
import { registerComputerUseIpc } from "./computerUseService.mjs";
import { setOmniRouteEventTarget, cleanupOmniRouteOnQuit } from "./omniRouteService.mjs";
import { registerVoiceIpc, setVoiceEventTarget, cleanupVoiceOnQuit, isMicGrantActive } from "./voiceService.mjs";
import { resolveUnderDistRoot } from "./ipcValidate.mjs";
import { registerNavigationPolicy, setVoiceGrantChecker } from "./navigationPolicy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** GPU is always available via software rendering — no safe mode needed. */
const gpuSafeMode = { enabled: false };

/** One app instance — second launch focuses the existing window.
 *  Dev mode skips this so restarts never get blocked by a stale lock. */
const singleInstanceLock =
  process.env.OPENBENTT_ELECTRON_DEV === "1" || app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

/** Linux display: default Ozone to x11 on Wayland sessions. */
if (process.platform === "linux") {
  applyLinuxOzonePlatform();
}

/** Disable GPU entirely so the app runs on any device regardless of GPU state. */
function disableGPU() {
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("disable-gpu-rasterization");
  app.commandLine.appendSwitch("disable-webgl");
  app.commandLine.appendSwitch("disable-webgpu");
  app.disableHardwareAcceleration();
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

  if (isWaylandSession) {
    app.commandLine.appendSwitch("ozone-platform", "x11");
  }
}


const VITE_DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:8080";
/** When true, load the Vite dev server (use `npm run electron:dev`). Otherwise load built `dist/` via app:// */
const useViteDevServer = process.env.OPENBENTT_ELECTRON_DEV === "1";

/** Dev load runs async; keep the app alive if the window closes mid-retry. */
let devStartupInProgress = false;
let devWindowRecreateCount = 0;
const MAX_DEV_WINDOW_RECREATE = 2;

/** Desktop home: chat-first workspace (Phase 9). */
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

/** Must run before app.ready (Electron requirement). */
disableGPU();
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
  const base = {
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: true,
    title: "Openbentt",
    autoHideMenuBar: process.platform === "linux",
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

  /** Linux: always framed window. */
  return {
    ...base,
    frame: true,
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

  // Phase 1: deny arbitrary navigation/window creation + default-deny permissions.
  registerNavigationPolicy(win);

  setLocalGgufProgressTarget(win);
  setZoteroProgressTarget(win);
  setUpdaterTargetWindow(win);
  setOpenCodeEventTarget(win);
  setOmniRouteEventTarget(win);
  setVoiceEventTarget(win);
  setWorkspaceEventTarget(win);
  // Phase 3: microphone granted only while a voice session is live.
  setVoiceGrantChecker(() => isMicGrantActive());

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
  registerOllamaIpc(ipcMain, {
    getWindow: () => BrowserWindow.getAllWindows()[0] ?? null,
  });
  registerOpenCodeIpc(ipcMain, app);
  registerVoiceIpc(ipcMain, app);
  registerWorkspaceIpc(ipcMain, app);
  registerLatexIpc(ipcMain, app);
  registerComputerUseIpc(ipcMain, app);
  // Phase 2: reconcile durable agent history (interrupted → UNKNOWN, never completed).
  void reconcileAgentStateOnStartup(app).then(({ reconciled }) => {
    if (reconciled > 0) console.info(`[electron] Reconciled ${reconciled} interrupted agent task(s).`);
  }).catch(() => {});
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
  cleanupOpenCodeOnQuit();
  cleanupOmniRouteOnQuit();
  cleanupVoiceOnQuit();
  cleanupWorkspaceOnQuit();
  // Bounded agent shutdown (tasks → OpenCode → OmniRoute) before DB close.
  // before-quit cannot block long; best-effort async with hard timeout.
  try {
    void Promise.race([
      shutdownAgentServices(),
      new Promise((r) => setTimeout(r, 8000)),
    ]).catch(() => {}).finally(() => shutdownResearchServices());
  } catch {
    shutdownResearchServices();
  }
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
