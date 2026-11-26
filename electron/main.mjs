/**
 * Openbentt desktop shell — loads the same Vite app as the web build.
 * - Dev (hot reload): set OPENBENTT_ELECTRON_DEV=1 → http://127.0.0.1:8080 (Vite must be running)
 * - Packaged / local dist: custom app:// protocol → dist/ with SPA fallback (no src/ changes)
 */
import { app, BrowserWindow, protocol, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { augmentProcessPath } from "./augmentPath.mjs";
import {
  cleanupLocalGgufOnQuit,
  registerLocalGgufIpc,
  setLocalGgufProgressTarget,
} from "./localGgufService.mjs";
import { registerHfSecretIpc } from "./hfSecretStore.mjs";
import { registerSecretVaultIpc } from "./secretVault.mjs";
import { registerDesktopUpdaterIpc, setUpdaterTargetWindow } from "./updater.mjs";
import { registerExternalAgentDetectIpc } from "./externalAgentDetect.mjs";
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
import { registerOcrIpc } from "./ocrService.mjs";
import { registerComputerUseIpc } from "./computerUseService.mjs";
import { setOmniRouteEventTarget, cleanupOmniRouteOnQuit } from "./omniRouteService.mjs";
import { registerVoiceIpc, setVoiceEventTarget, cleanupVoiceOnQuit, isMicGrantActive } from "./voiceService.mjs";
import { registerNarrationIpc, cleanupNarration } from "./narrationVoice.mjs";
import {
  registerPaperOrchestraIpc,
  setPaperOrchestraProgressTarget,
  cleanupPaperOrchestra,
} from "./paperOrchestraService.mjs";
import { resolveUnderDistRoot } from "./ipcValidate.mjs";
import { registerNavigationPolicy, setVoiceGrantChecker } from "./navigationPolicy.mjs";
import { getGpuSafeMode, writeGpuSafeModeMarker } from "./gpuSafeMode.mjs";
import {
  installIpcAuthorization,
  registerTrustedWindow,
  unregisterTrustedWindow,
} from "./ipcAuthorization.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** GUI launches often miss user tool dirs — fix PATH before agent detection. */
augmentProcessPath();

/** Phase 3: install the IPC guard before any service registers a channel. */
installIpcAuthorization(ipcMain);

/** Startup critical-path instrumentation (main process). */
const startupTimings = [];
function timedStartup(name, fn) {
  const start = process.hrtime.bigint();
  const result = fn();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  startupTimings.push({ name, ms: Math.round(ms * 100) / 100 });
  return result;
}
function logStartupTimings() {
  const total = startupTimings.reduce((sum, step) => sum + step.ms, 0);
  console.info(
    "[startup][main] " + JSON.stringify({ totalMs: Math.round(total * 100) / 100, steps: startupTimings })
  );
}

const gpuSafeMode = getGpuSafeMode();
if (gpuSafeMode.enabled) {
  process.env.OPENBENTT_SOFTWARE_RENDERING = "1";
  console.info(
    `[electron] Software rendering enabled (${gpuSafeMode.reason ?? "safe-mode"}).`
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
 * Linux display: prefer native Wayland when the session is Wayland.
 * (We no longer force X11 for WebGPU — that path caused GPU SIGSEGV + invisible windows.)
 * Override with OPENBENTT_OZONE_PLATFORM=x11|wayland|auto.
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
    app.commandLine.appendSwitch("ozone-platform", "wayland");
    console.info(
      "[electron] Wayland session detected; using --ozone-platform=wayland. Override with OPENBENTT_OZONE_PLATFORM=x11 or =auto."
    );
  }
}

/** Manual override after auto-detection (must still run before app.ready). */
if (!gpuSafeMode.enabled && process.env.OPENBENTT_DISABLE_GPU === "1") {
  app.disableHardwareAcceleration();
}

const gpuRecoveryAttempted = process.env.OPENBENTT_GPU_RECOVERY_ONCE === "1";
let gpuCrashBurstCount = 0;
let gpuCrashBurstWindowStart = 0;

function noteGpuCrashBurst() {
  const now = Date.now();
  const windowMs = 20_000;
  if (!gpuCrashBurstWindowStart || now - gpuCrashBurstWindowStart > windowMs) {
    gpuCrashBurstWindowStart = now;
    gpuCrashBurstCount = 0;
  }
  gpuCrashBurstCount += 1;
  return gpuCrashBurstCount;
}

function relaunchInGpuSafeMode(reason) {
  if (gpuSafeMode.enabled || gpuRecoveryAttempted) return false;
  // Blank/broken compositor after GPU SIGSEGV is worse than a one-shot software relaunch —
  // even if a window already exists (common: crash ~1s after createWindow).
  console.error(`[electron] ${reason}. Relaunching once with OPENBENTT_DISABLE_GPU=1 for compatibility.`);
  try {
    writeGpuSafeModeMarker(app.getPath("userData"));
  } catch {
    /* marker is best-effort */
  }
  app.relaunch({
    args: process.argv.slice(1),
    env: {
      ...process.env,
      OPENBENTT_DISABLE_GPU: "1",
      OPENBENTT_GPU_RECOVERY_ONCE: "1",
    },
  });
  app.exit(0);
  return true;
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

const APP_PROTOCOL_MIME = {
  ".html": "text/html; charset=UTF-8",
  ".js": "text/javascript; charset=UTF-8",
  ".mjs": "text/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".json": "application/json",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=UTF-8",
};

function registerAppProtocolHandler() {
  protocol.handle("app", async (request) => {
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
    // Read from disk directly instead of net.fetch(file://…). Under sustained
    // load the file:// network path intermittently returned ERR_FAILED for
    // lazy route chunks (e.g. SettingsPage-*.js), which surfaced as a render
    // error. A direct read has no network socket pool to exhaust.
    try {
      const data = await fs.promises.readFile(filePath);
      const contentType = APP_PROTOCOL_MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
      return new Response(data, { status: 200, headers: { "Content-Type": contentType } });
    } catch (error) {
      console.error("[app-protocol] failed to read", filePath, error);
      return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }
  });
}

/** App shell background — matches `.app-shell { --background: 0 0% 12% }` → #1f1f1f */
const APP_SHELL_BG = "#171717";

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
  /** Unified shell: same #171717 from title strip through content; in-app min/max/close. */
  const base = {
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: true,
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

  /** Linux: frameless so the in-app title bar + window controls match the app bg. */
  return {
    ...base,
    frame: false,
  };
}

function useInAppFramelessChrome() {
  return process.platform === "linux";
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
      additionalArguments: [
        `--openbentt-software-rendering=${gpuSafeMode.enabled ? "1" : "0"}`,
        `--openbentt-safe-mode-reason=${gpuSafeMode.reason ?? ""}`,
        `--openbentt-packaged=${app.isPackaged ? "1" : "0"}`,
        `--openbentt-frameless=${useInAppFramelessChrome() ? "1" : "0"}`,
      ],
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

  // Phase 3 IPC security: only this main-process-owned window may invoke IPC.
  // Capture the id now: the BrowserWindow/webContents are destroyed by the
  // time the "closed" event fires.
  const trustedWebContentsId = registerTrustedWindow(win);
  win.once("closed", () => unregisterTrustedWindow(trustedWebContentsId));

  setLocalGgufProgressTarget(win);
  setZoteroProgressTarget(win);
  setUpdaterTargetWindow(win);
  setOpenCodeEventTarget(win);
  setOmniRouteEventTarget(win);
  setVoiceEventTarget(win);
  setWorkspaceEventTarget(win);
  setPaperOrchestraProgressTarget(win);
  // Phase 3: microphone granted only while a voice session is live.
  setVoiceGrantChecker(() => isMicGrantActive());

  if (process.platform === "linux") {
    win.setMenuBarVisibility(false);
    win.setAutoHideMenuBar(true);
  }
  if (gpuSafeMode.enabled) {
    win.center();
    ensureWindowVisible(win);
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
    // Show the shell immediately (bg color) — do not wait on full renderer boot.
    ensureWindowVisible(win);
    win.once("ready-to-show", () => ensureWindowVisible(win));
    win.webContents.on("did-finish-load", () => {
      ensureWindowVisible(win);
      console.info("[startup][renderer] did-finish-load");
    });
    win.webContents.on("dom-ready", () => {
      console.info("[startup][renderer] dom-ready");
    });
    win.webContents.on("did-fail-load", (_event, code, desc, url, isMainFrame) => {
      if (isMainFrame) {
        console.error(`[electron] Production load failed (${code}): ${url} — ${desc}`);
        ensureWindowVisible(win);
      }
    });
    win.loadURL(`app://openbentt${START_PATH}`);
    sleep(1500).then(() => ensureWindowVisible(win));
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

if (!gpuSafeMode.enabled) {
  app.on("child-process-gone", (_event, details) => {
    if (details?.type !== "GPU") return;
    const exitCode = Number.isFinite(details.exitCode) ? details.exitCode : -1;
    const burst = noteGpuCrashBurst();
    console.error(
      `[electron] GPU process crashed (reason=${details.reason ?? "unknown"}, exitCode=${exitCode}, burst=${burst}).`
    );
    if (burst >= 2) {
      relaunchInGpuSafeMode("Repeated GPU process crashes detected");
    }
  });

  app.on("gpu-process-crashed", (_event, killed) => {
    const burst = noteGpuCrashBurst();
    console.error(`[electron] gpu-process-crashed (killed=${Boolean(killed)} burst=${burst}).`);
    if (burst >= 2) {
      relaunchInGpuSafeMode("Legacy gpu-process-crashed signal received repeatedly");
    }
  });
}

app.whenReady().then(async () => {
  // Critical path only: show the window as soon as possible.
  timedStartup("setupApplicationMenu", () => setupApplicationMenu({ isDev: useViteDevServer }));
  timedStartup("registerDesktopWindowIpc", () => registerDesktopWindowIpc(ipcMain));
  if (!useViteDevServer) {
    timedStartup("registerAppProtocolHandler", () => registerAppProtocolHandler());
  }
  timedStartup("createWindow", () => createWindow());
  logStartupTimings();

  // Defer heavier IPC/services to the next turn so first paint is not blocked.
  setImmediate(() => {
    const deferred = [];
    const run = (name, fn) => {
      const start = process.hrtime.bigint();
      try {
        fn();
      } catch (err) {
        console.error(`[electron] deferred ${name} failed:`, err);
      }
      deferred.push({ name, ms: Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100 });
    };
    run("registerDesktopUpdaterIpc", () => registerDesktopUpdaterIpc());
    run("registerExternalAgentDetectIpc", () => registerExternalAgentDetectIpc(ipcMain));
    run("registerHfSecretIpc", () => registerHfSecretIpc(ipcMain, app));
    run("registerSecretVaultIpc", () => registerSecretVaultIpc(ipcMain, app));
    run("registerLocalGgufIpc", () => registerLocalGgufIpc(ipcMain, app));
    run("registerResearchProjectIpc", () => registerResearchProjectIpc(ipcMain, app));
    run("registerZoteroSecretIpc", () => registerZoteroSecretIpc(ipcMain, app));
    run("registerZoteroIpc", () => registerZoteroIpc(ipcMain, app));
    run("registerOllamaIpc", () =>
      registerOllamaIpc(ipcMain, {
        getWindow: () => BrowserWindow.getAllWindows()[0] ?? null,
      })
    );
    run("registerOpenCodeIpc", () => registerOpenCodeIpc(ipcMain, app));
    run("registerVoiceIpc", () => registerVoiceIpc(ipcMain, app));
    run("registerNarrationIpc", () => registerNarrationIpc(ipcMain, app));
    run("registerPaperOrchestraIpc", () => registerPaperOrchestraIpc(ipcMain, app));
    run("registerWorkspaceIpc", () => registerWorkspaceIpc(ipcMain, app));
    run("registerLatexIpc", () => registerLatexIpc(ipcMain, app));
    run("registerOcrIpc", () => registerOcrIpc(ipcMain, app));
    run("registerComputerUseIpc", () => registerComputerUseIpc(ipcMain, app));
    console.info(
      "[startup][deferred] " +
        JSON.stringify({
          totalMs: Math.round(deferred.reduce((s, x) => s + x.ms, 0) * 100) / 100,
          steps: deferred,
        })
    );
    void reconcileAgentStateOnStartup(app)
      .then(({ reconciled }) => {
        if (reconciled > 0) console.info(`[electron] Reconciled ${reconciled} interrupted agent task(s).`);
      })
      .catch(() => {});
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  // Without this, a startup registration/IPC failure surfaces only as an
  // opaque unhandled rejection and no window is ever created.
  console.error("[electron] startup failed:", error);
});

async function flushResearchPersistenceOnQuit() {
  try {
    const mod = await import("./researchDb.mjs");
    if (typeof mod.flushPersistence === "function") {
      const status = await mod.flushPersistence();
      if (status?.state === "failed") {
        console.error(
          "[electron] research persistence is FAILED; unsaved in-memory changes were preserved:",
          status.lastError
        );
      }
    }
  } catch (error) {
    console.error("[electron] final persistence flush failed:", error);
  }
}

app.on("before-quit", (_event) => {
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
  cleanupNarration();
  cleanupPaperOrchestra();
  cleanupWorkspaceOnQuit();
  // Bounded agent shutdown (tasks → OpenCode → OmniRoute) before DB close.
  // before-quit cannot block long; best-effort async with hard timeout.
  try {
    void Promise.race([
      shutdownAgentServices(),
      new Promise((r) => setTimeout(r, 8000)),
    ])
      .catch(() => {})
      .then(flushResearchPersistenceOnQuit)
      .finally(() => shutdownResearchServices());
  } catch {
    void flushResearchPersistenceOnQuit().finally(() => shutdownResearchServices());
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