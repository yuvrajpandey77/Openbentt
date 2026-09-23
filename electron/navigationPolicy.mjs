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
 * Phase 3 exception: 'media' (microphone) is granted ONLY while an explicit
 * main-side voice grant is active (see setVoiceGrantChecker). The grant
 * exists solely between voice:startSession and voice:stopSession — both
 * gated behind explicit user action — and never at launch.
 *
 * @param {string} _permission
 * @returns {boolean} always false (documented default-deny)
 */
export function decidePermission(_permission) {
  return false;
}

/** Main-side voice mic grant checker (default: no grant). */
let voiceGrantChecker = null;

/**
 * @param {(() => boolean) | null} fn
 */
export function setVoiceGrantChecker(fn) {
  voiceGrantChecker = typeof fn === "function" ? fn : null;
}

/**
 * Voice-scoped media decision. Pure and unit-testable: microphone is
 * allowed iff the named permission is media/mic AND the main-side grant
 * callback confirms a live voice session AND the request is audio-only
 * (camera/video never granted for voice).
 *
 * @param {unknown} permission
 * @param {(() => boolean) | null} [grantChecker]
 * @param {{ mediaTypes?: string[], audioRequested?: boolean, videoRequested?: boolean } | null} [details]
 */
export function decideVoiceMediaPermission(permission, grantChecker = voiceGrantChecker, details = null) {
  const p = String(permission ?? "").toLowerCase();
  if (p !== "media" && p !== "microphone" && p !== "audio-capture") return false;
  if (details && typeof details === "object") {
    if (details.videoRequested === true) return false;
    if (Array.isArray(details.mediaTypes)) {
      if (details.mediaTypes.includes("video")) return false;
      if (!details.mediaTypes.includes("audio")) return false;
    }
  }
  try {
    return grantChecker?.() === true;
  } catch {
    return false;
  }
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
  session.setPermissionRequestHandler((_wc, permission, callback, details) => {
    // Phase 3: microphone only with a live main-side voice grant; everything
    // else stays default-deny. Camera/video never granted for voice.
    if (decideVoiceMediaPermission(permission, voiceGrantChecker, details ?? null)) {
      callback(true);
      return;
    }
    if (decidePermission(permission)) {
      callback(true);
      return;
    }
    log.warn("denied permission request", { permission: String(permission) });
    callback(false);
  });
  if (typeof session.setPermissionCheckHandler === "function") {
    session.setPermissionCheckHandler((_wc, permission, _origin, details) => {
      if (decideVoiceMediaPermission(permission, voiceGrantChecker, details ?? null)) return true;
      return false;
    });
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
