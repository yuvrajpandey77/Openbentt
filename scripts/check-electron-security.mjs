/**
 * Static Electron security gate — fails CI if renderer gets Node integration.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainPath = path.join(root, "electron/main.mjs");
const preloadPath = path.join(root, "electron/preload.cjs");

const errors = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const main = read("electron/main.mjs");
if (/nodeIntegration\s*:\s*true/.test(main)) {
  errors.push(`${mainPath}: nodeIntegration must not be true`);
}
if (!/nodeIntegration\s*:\s*false/.test(main)) {
  errors.push(`${mainPath}: expected nodeIntegration: false in BrowserWindow webPreferences`);
}
if (!/contextIsolation\s*:\s*true/.test(main)) {
  errors.push(`${mainPath}: expected contextIsolation: true`);
}

const preload = read("electron/preload.cjs");
const bridgeCount = (preload.match(/contextBridge\.exposeInMainWorld/g) ?? []).length;
if (bridgeCount !== 5) {
  errors.push(
    `${preloadPath}: expected 5 contextBridge surfaces (found ${bridgeCount}). Update docs/THREAT_MODEL.md if intentional.`
  );
}

if (errors.length) {
  console.error("Electron security check failed:\n");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log("Electron security check passed (nodeIntegration off, preload surface count OK).");
