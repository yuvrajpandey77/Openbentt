/**
 * Centralized external-URL policy for the Electron shell (Phase 1 security foundation).
 *
 * Single choke point for every place the app opens an out-of-app URL:
 * - `desktop:openExternal` IPC (electron/desktopWindowIpc.mjs)
 * - `setWindowOpenHandler` (electron/navigationPolicy.mjs)
 * - `will-navigate` / `will-redirect` escalation to the OS browser (same module)
 *
 * Philosophy (unchanged from before Phase 1, now centralized): HTTPS-only.
 * Explicitly denied unless securely validated: file://, javascript:, data:,
 * blob:, and arbitrary custom protocols.
 */

/**
 * Parse + validate an external URL.
 * @param {unknown} raw
 * @returns {URL | null} the parsed URL when allowed, else null.
 *
 * Allowed: `https:` URLs with a non-empty hostname and no embedded credentials.
 * Everything else (http:, file:, javascript:, data:, blob:, custom schemes,
 * credentials-in-URL, unparseable input) is rejected.
 */
export function parseAllowedExternalUrl(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Block control characters / whitespace tricks before parsing.
  // eslint-disable-next-line no-control-regex
  if (!trimmed || /[\u0000-\u0020\u007f]/.test(trimmed)) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  // Refuse credential-bearing URLs (leak via Referer / shell history).
  if (url.username || url.password) return null;
  return url;
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isAllowedExternalUrl(raw) {
  return parseAllowedExternalUrl(raw) !== null;
}

/**
 * In-app navigation allowlist for the single BrowserWindow.
 *
 * Allowed:
 * - packaged app: any `app://openbentt/*` route (protocol handler serves dist/ w/ SPA fallback)
 * - dev: http://127.0.0.1:8080/* and http://localhost:8080/* (Vite dev server)
 *
 * @param {unknown} raw
 * @param {{ devServerBases?: string[] }} [opts]
 * @returns {boolean}
 */
export function isAllowedAppNavigationUrl(raw, opts) {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  // Packaged app origin.
  if (trimmed.startsWith("app://openbentt/") || trimmed === "app://openbentt") return true;
  const bases = opts?.devServerBases ?? ["http://127.0.0.1:8080/", "http://localhost:8080/"];
  try {
    const url = new URL(trimmed);
    return bases.some((base) => {
      const b = new URL(base);
      return (
        url.protocol === b.protocol &&
        url.hostname === b.hostname &&
        url.port === b.port
      );
    });
  } catch {
    return false;
  }
}
