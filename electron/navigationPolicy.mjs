/**
 * Window / navigation / permission policy for the single BrowserWindow
 * (Phase 1 security foundation).
 *
 * - Navigation: the renderer may only navigate within the app origin
 *   (`app://openbentt/*` packaged, Vite dev origin in dev). Anything else is
 *   denied; allowed-HTTPS URLs are escalated to the OS browser instead of
 *   becoming app navigation.
 * - Window creation: always denied for Electron windows; allowed-HTTPS URLs
 *   open via the OS (`shell.openExternal`). No renderer-controlled windows.
 * - Permissions: default-deny. No current Openbentt feature requires a Chromium
 *   permission grant (verified: no getUserMedia, Notification API, or
 *   clipboard-read usage in src/; clipboard *writes* are not permission-gated).
 *
 * Pure decision logic (`classifyNavigation`, `decidePermission`) is exported for
 * unit tests; `registerNavigationPolicy` wires it to a live BrowserWindow.
 */
import {
  isAllowedAppNavigationUrl,
  isAllowedExternalUrl,
} from "./externalUrlPolicy.mjs";
import { createLogger } from "./log.mjs";

const log = createLogger("navigation");

/**
 * Lazily loaded so this module stays importable in plain-Node unit tests
 * (the `electron` package only resolves inside the Electron runtime).
 */
async function openExternalInOsBrowser(url) {
  try {
    const { shell } = await import("electron");
    await shell.openExternal(url);
  } catch {
    /* best effort */
  }
}

/**
 * @param {string} url
 * @returns {"allow" | "open-external" | "deny"}
 */
export function classifyNavigation(url) {
  if (isAllowedAppNavigationUrl(url)) return "allow";
  if (isAllowedExternalUrl(url)) return "open-external";
  return "deny";
}

/**
 * Permission decision — default deny, no allowlist.
 *
 * Explicitly evaluated (none required by any current feature):
 * camera, microphone, speakers, geolocation, notifications, clipboard-read,
 * clipboard-sanitized-write, fullscreen (not session-gated), pointerLock,
 * mediaKeySystem, bluetooth, usb, serial, hid, midi, storage-access, idle-detection.
 *
 * @param {string} _permission
 * @returns {boolean} always false (documented default-deny)
 */
export function decidePermission(_permission) {
  return false;
}

/**
 * @param {import('electron').BrowserWindow} win
 */
export function registerNavigationPolicy(win) {
  const wc = win.webContents;

  const guardNavigation = (event, url) => {
    const decision = classifyNavigation(url);
    if (decision === "allow") return;
    event.preventDefault();
    if (decision === "open-external") {
      void openExternalInOsBrowser(url);
    } else {
      log.warn("blocked navigation to disallowed URL", { url: redactUrl(url) });
    }
  };

  wc.on("will-navigate", guardNavigation);
  wc.on("will-redirect", guardNavigation);

  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void openExternalInOsBrowser(url);
    } else {
      log.warn("blocked window.open to disallowed URL", { url: redactUrl(url) });
    }
    // No renderer-controlled arbitrary window creation — the OS browser handles it.
    return { action: "deny" };
  });

  const { session } = wc;
  session.setPermissionRequestHandler((_wc, permission, callback) => {
    if (decidePermission(permission)) {
      callback(true);
      return;
    }
    log.warn("denied permission request", { permission: String(permission) });
    callback(false);
  });
  if (typeof session.setPermissionCheckHandler === "function") {
    session.setPermissionCheckHandler(() => false);
  }
}

/** Never log full URLs (may embed paths/tokens); keep scheme + host for diagnosis. */
function redactUrl(raw) {
  try {
    const u = new URL(String(raw));
    return `${u.protocol}//${u.host}/…`;
  } catch {
    return "(unparseable)";
  }
}
