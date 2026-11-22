/**
 * Desktop Electron smoke — runs only when OPENBENTT_E2E_ELECTRON=1.
 * Web CI keeps research-workspace Phase A skipped; this project is for local/pack verify.
 *
 * Launch: build first, then:
 *   OPENBENTT_E2E_ELECTRON=1 npx playwright test --project=electron e2e/electron-smoke.spec.ts
 */
import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const enabled = process.env.OPENBENTT_E2E_ELECTRON === "1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test.describe("electron desktop smoke", () => {
  test.skip(!enabled, "Set OPENBENTT_E2E_ELECTRON=1 after npm run build");

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
});
