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

// Phase 1: navigation / window / permission hardening must stay wired.
if (!/registerNavigationPolicy\s*\(/.test(main)) {
  errors.push(`${mainPath}: expected registerNavigationPolicy(win) in createWindow (Phase 1)`);
}
const navPolicy = read("electron/navigationPolicy.mjs");
for (const token of ["setWindowOpenHandler", "will-navigate", "setPermissionRequestHandler", "action: \"deny\""]) {
  if (!navPolicy.includes(token)) {
    errors.push(`electron/navigationPolicy.mjs: expected ${token} (Phase 1 navigation hardening)`);
  }
}
const urlPolicy = read("electron/externalUrlPolicy.mjs");
for (const token of ["parseAllowedExternalUrl", "isAllowedAppNavigationUrl", "!== \"https:\""]) {
  if (!urlPolicy.includes(token)) {
    errors.push(`electron/externalUrlPolicy.mjs: expected ${token} (Phase 1 URL policy)`);
  }
}

const preload = read("electron/preload.cjs");
const bridgeCount = (preload.match(/contextBridge\.exposeInMainWorld/g) ?? []).length;
// Phase 9 adds openbenttOllama (loopback-only status/pull IPC, no exec).
if (bridgeCount !== 6) {
  errors.push(
    `${preloadPath}: expected 6 contextBridge surfaces (found ${bridgeCount}). Update docs/THREAT_MODEL.md if intentional.`
  );
}

if (errors.length) {
  console.error("Electron security check failed:\n");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log("Electron security check passed (nodeIntegration off, preload surface count OK).");
