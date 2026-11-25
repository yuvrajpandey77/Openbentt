/**
 * Desktop Electron smoke — runs only when OPENBENTT_E2E_ELECTRON=1.
 * Web CI keeps research-workspace Phase A skipped; this project is for local/pack verify.
 *
 * Launch: build first, then:
 *   OPENBENTT_E2E_ELECTRON=1 npx playwright test --project=electron --workers=1 e2e/electron-smoke.spec.ts
 *
 * Use --workers=1: each test launches a full Electron app; parallel launches
 * raced for the desktop session and one failed during electron.launch().
 */
import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const enabled = process.env.OPENBENTT_E2E_ELECTRON === "1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test.describe("electron desktop smoke", () => {
  test.skip(!enabled, "Set OPENBENTT_E2E_ELECTRON=1 after npm run build");
  // Each test launches a full Electron app; sequential launches can exceed the
  // 30 s default when the software renderer is still settling.
  test.setTimeout(90_000);

  type DesktopApiForAuthTest = {
    getAppVersion?: () => Promise<string>;
    workspaceRead?: (root: string, path: string) => Promise<unknown>;
  };


  test("opens main window with Openbentt branding", async () => {
    const app = await electron.launch({
      args: [path.join(root, "electron/main.mjs")],
      env: {
        ...process.env,
        OPENBENTT_ELECTRON_DEV: "0",
        // Load built renderer if present
        OPENBENTT_LOAD_DIST: "1",
      },
      cwd: root,
    });
    try {
      const win = await app.firstWindow({ timeout: 60_000 });
      await win.waitForLoadState("domcontentloaded");
      const title = await win.title();
      expect(title).toMatch(/Openbentt/i);
      // Chat shell or setup should be reachable
      const body = await win.locator("body").innerText();
      expect(body.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  test("stays alive across repeated Notebook navigation", async () => {
    const app = await electron.launch({
      args: [path.join(root, "electron/main.mjs")],
      env: {
        ...process.env,
        OPENBENTT_ELECTRON_DEV: "0",
        OPENBENTT_LOAD_DIST: "1",
      },
      cwd: root,
    });
    try {
      const context = app.context();
      await context.addInitScript(() => {
        localStorage.setItem(
          "openbentt-onboarding-v1",
          JSON.stringify({ state: "READY", completed: true, updatedAt: new Date().toISOString() })
        );
      });
      const win = await app.firstWindow({ timeout: 60_000 });
      await win.reload({ waitUntil: "domcontentloaded" });
      await win.waitForSelector("button.sidebar-nav-item", { timeout: 30_000 });

      const rail = (icon: string) =>
        win.locator(`button.sidebar-nav-item:has(svg.lucide-${icon})`).first();
      const openNotebook = async () => {
        await rail("notebook-pen").click();
        await win.waitForURL("**/notebook");
        await win.waitForSelector("[data-notebook-studio]");
      };
      const openChat = async () => {
        await rail("message-square").click();
        await win.waitForURL("**/chat");
      };

      for (let i = 0; i < 3; i++) {
        await openNotebook();
        await openChat();
      }
      await openNotebook();

      // The reported failure was a full app quit, not a route-level error.
      expect(app.process()?.exitCode).toBeNull();
      expect(win.isClosed()).toBe(false);
    } finally {
      await app.close();
    }
  });

  test("loads lazy Settings chunk repeatedly without a render error", async () => {
    const app = await electron.launch({
      args: [path.join(root, "electron/main.mjs")],
      env: {
        ...process.env,
        OPENBENTT_ELECTRON_DEV: "0",
        OPENBENTT_LOAD_DIST: "1",
      },
      cwd: root,
    });
    try {
      const context = app.context();
      await context.addInitScript(() => {
        localStorage.setItem(
          "openbentt-onboarding-v1",
          JSON.stringify({ state: "READY", completed: true, updatedAt: new Date().toISOString() })
        );
      });
      const win = await app.firstWindow({ timeout: 60_000 });
      await win.reload({ waitUntil: "load" });
      await win.waitForSelector("button.sidebar-nav-item", { timeout: 30_000 });
      const errors: string[] = [];
      win.on("pageerror", (error) => errors.push(String(error)));

      const rail = (icon: string) =>
        win.locator(`button.sidebar-nav-item:has(svg.lucide-${icon})`).first();
      for (let i = 0; i < 6; i++) {
        await rail("settings").dispatchEvent("click");
        await win.waitForURL("**/settings");
        await expect(win.locator("body")).toContainText(/settings/i);
        await rail("message-square").dispatchEvent("click");
        await win.waitForURL("**/chat");
      }

      expect(errors).toEqual([]);
      expect(app.process()?.exitCode).toBeNull();
      expect(win.isClosed()).toBe(false);
    } finally {
      await app.close();
    }
  });

  test("authorizes trusted main-frame IPC and rejects unauthorized payloads", async () => {
    const app = await electron.launch({
      args: [path.join(root, "electron/main.mjs")],
      env: {
        ...process.env,
        OPENBENTT_ELECTRON_DEV: "0",
        OPENBENTT_LOAD_DIST: "1",
      },
      cwd: root,
    });
    try {
      const win = await app.firstWindow({ timeout: 60_000 });
      await win.waitForLoadState("domcontentloaded");

      const version = await win.evaluate(async () => {
        const api = (window as Window & { openbenttDesktop?: DesktopApiForAuthTest }).openbenttDesktop;
        return api?.getAppVersion ? await api.getAppVersion() : null;
      });
      expect(typeof version).toBe("string");

      // Trusted sender, but a workspace root that main never authorized.
      const blocked = await win.evaluate(async () => {
        const api = (window as Window & { openbenttDesktop?: DesktopApiForAuthTest }).openbenttDesktop;
        try {
          await api.workspaceRead("/tmp/openbentt-unauthorized-e2e", "secret.txt");
          return "allowed";
        } catch (error) {
          return String((error as Error)?.message ?? error);
        }
      });
      expect(blocked).toMatch(/IPC authorization denied|not been authorized/i);
    } finally {
      await app.close();
    }
  });

  test("rejects IPC from an unregistered renderer window", async () => {
    const app = await electron.launch({
      args: [path.join(root, "electron/main.mjs")],
      env: {
        ...process.env,
        OPENBENTT_ELECTRON_DEV: "0",
        OPENBENTT_LOAD_DIST: "1",
      },
      cwd: root,
    });
    try {
      const mainWindow = await app.firstWindow({ timeout: 60_000 });
      await mainWindow.waitForLoadState("domcontentloaded");

      // Create a second app-origin renderer with the same preload. It has a
      // valid bridge and origin, but main never registered its webContents.
      await app.evaluate(async ({ BrowserWindow }, roguePreload: string) => {
        const rogue = new BrowserWindow({
          show: false,
          webPreferences: {
            preload: roguePreload,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        await rogue.loadURL("app://openbentt/chat");
      }, path.join(root, "electron/preload.cjs"));

      const windows = app.windows();
      expect(windows.length).toBeGreaterThanOrEqual(2);
      const rogueWindow = windows[windows.length - 1];
      const result = await rogueWindow.evaluate(async () => {
        const api = (window as Window & { openbenttDesktop?: DesktopApiForAuthTest }).openbenttDesktop;
        try {
          await api.getAppVersion();
          return "allowed";
        } catch (error) {
          return String((error as Error)?.message ?? error);
        }
      });
      expect(result).toMatch(/IPC authorization denied|untrusted sender/i);
    } finally {
      await app.close();
    }
  });
});
