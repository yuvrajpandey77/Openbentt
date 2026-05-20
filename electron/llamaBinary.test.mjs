/**
 * Smoke test: bundled llama-server path exists after download script.
 * Run: npm run test:electron
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

describe("bundled llama-server", () => {
  it("is present for the current platform when download script ran", () => {
    const platform = process.platform;
    const exe = platform === "win32" ? "llama-server.exe" : "llama-server";
    const bundled = path.join(ROOT, "resources", "llama", platform, exe);
    if (!fs.existsSync(bundled)) {
      console.log(`skip: run npm run download:llama-server — missing ${bundled}`);
      return;
    }
    const st = fs.statSync(bundled);
    assert.ok(st.size > 1_000_000, "binary should be >1MB");
  });
});
