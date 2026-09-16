/**
 * Phase 1 — navigation classification + permission default-deny tests.
 * Run: node --test electron/navigationPolicy.test.mjs
 * (Live BrowserWindow wiring is covered by the static gate in
 * scripts/check-electron-security.mjs + the Electron smoke run.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { classifyNavigation, decidePermission } from "./navigationPolicy.mjs";

test("app routes are allowed", () => {
  assert.equal(classifyNavigation("app://openbentt/projects"), "allow");
  assert.equal(classifyNavigation("app://openbentt/notebook"), "allow");
});

test("https URLs escalate to open-external", () => {
  assert.equal(classifyNavigation("https://arxiv.org/abs/1234"), "open-external");
});

test("everything else is denied", () => {
  for (const u of [
    "http://example.com/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,x",
    "http://127.0.0.1:9999/",
  ]) {
    assert.equal(classifyNavigation(u), "deny", u);
  }
});

test("permissions default to denied", () => {
  for (const p of [
    "camera",
    "microphone",
    "geolocation",
    "notifications",
    "clipboard-read",
    "clipboard-sanitized-write",
    "fullscreen",
    "pointerLock",
    "bluetooth",
    "usb",
    "serial",
    "hid",
    "midi",
    "mediaKeySystem",
    "storage-access",
    "idle-detection",
    "window-management",
    "unknown-future-permission",
  ]) {
    assert.equal(decidePermission(p), false, p);
  }
});
