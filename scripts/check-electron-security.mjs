/**
 * Static Electron security gate — fails CI if renderer gets Node integration
 * or if an IPC handler can bypass the centralized authorization framework.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getChannelPolicy } from "../electron/ipcAuthorization.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainPath = path.join(root, "electron/main.mjs");
const preloadPath = path.join(root, "electron/preload.cjs");

const errors = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
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
// Phase 10 adds openbenttAgent (capability-specific agent:* IPC, no exec).
// openbenttNarration is a narrow narration:status/ensure/synthesize surface.
// openbenttPaperOrchestra is a narrow paperOrchestra:* surface (spawn intact CLI only).
if (bridgeCount !== 9) {
  errors.push(
    `${preloadPath}: expected 9 contextBridge surfaces (found ${bridgeCount}). Update docs/THREAT_MODEL.md if intentional.`
  );
}

/* -------------------- Phase 3 IPC authorization gate -------------------- */

const policy = getChannelPolicy();
const installIndex = main.indexOf("installIpcAuthorization(ipcMain)");
if (installIndex < 0) {
  errors.push(`${mainPath}: installIpcAuthorization(ipcMain) must be called before service registration`);
}
for (const token of [
  "registerTrustedWindow(win)",
  "unregisterTrustedWindow(trustedWebContentsId)",
  'from "./ipcAuthorization.mjs"',
]) {
  if (!main.includes(token)) {
    errors.push(`${mainPath}: expected ${token} (Phase 3 trusted-window bound IPC)`);
  }
}
const firstRegistration = main.search(/register[A-Za-z]*Ipc\s*\(/);
if (installIndex >= 0 && firstRegistration >= 0 && installIndex > firstRegistration) {
  errors.push(`${mainPath}: IPC authorization must be installed before ipcMain service registrations`);
}

for (const [channel, rule] of Object.entries(policy)) {
  if (!Array.isArray(rule.capabilities) || !Array.isArray(rule.argValidators)) {
    errors.push(`ipcAuthorization.mjs: invalid policy entry for ${channel}`);
  }
  if (!Number.isFinite(rule.maxBytes) || rule.maxBytes <= 0) {
    errors.push(`ipcAuthorization.mjs: ${channel} has no payload size limit`);
  }
}

const registrations = [];
for (const file of walk(path.join(root, "electron"))) {
  if (file.endsWith("ipcAuthorization.mjs")) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(
    /(?:ipcMain|ipc)\.(?:handle|on|once|handleOnce)\(\s*(?:["'`])([^"'`]+)(?:["'`])/g
  )) {
    registrations.push({ channel: match[1], file: path.relative(root, file) });
  }
}
for (const { channel, file } of registrations) {
  if (!policy[channel]) {
    errors.push(`${file}: channel ${channel} is not in the IPC authorization policy (would be denied at runtime)`);
  }
}
const unused = Object.keys(policy).filter((channel) => !registrations.some((r) => r.channel === channel));
if (unused.length) {
  errors.push(
    `ipcAuthorization.mjs: policy entries without a registration (remove or implement): ${unused.join(", ")}`
  );
}

// Renderer code must never reach ipcMain directly.
for (const file of walk(path.join(root, "src"))) {
  const text = fs.readFileSync(file, "utf8");
  if (/ipcMain\b|require\(["']electron["']\)/.test(text)) {
    errors.push(`${path.relative(root, file)}: renderer source must not reference ipcMain or require electron`);
  }
}

// Capability grants are main-only; no bridge may expose/authorize them.
for (const token of ["grantCapability", "authorization:grant", "capability:grant", "__openbenttAuthorized"]) {
  if (preload.includes(token)) {
    errors.push(`${preloadPath}: renderer bridge must not expose ${token}`);
  }
}
for (const match of preload.matchAll(/ipcRenderer\.(?:invoke|send|on)\(["']([^"']+)["']/g)) {
  if (!policy[match[1]] && !match[1].includes(":")) {
    errors.push(`${preloadPath}: unknown IPC channel ${match[1]}`);
  }
}

if (errors.length) {
  console.error("Electron security check failed:\n");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log(
  `Electron security check passed (nodeIntegration off, ${bridgeCount} bridges, ${registrations.length} IPC registrations covered by ${Object.keys(policy).length} policy entries).`
);
