/**
 * GitHub Releases download URLs. Set at build time:
 * - VITE_GITHUB_REPO — `owner/repo` (optional; defaults to the public upstream so /download works without extra env)
 * - VITE_DESKTOP_ASSET_VERSION — legacy fallback only; package.json version wins to avoid stale deploy overrides
 */

const trim = (s: string | undefined) => (s ?? "").trim();

/** Public upstream releases. Self-hosts and forks: set `VITE_GITHUB_REPO` to your `owner/repo`. */
const DEFAULT_GITHUB_REPO = "yuvrajpandey77/Openbentt";

/** e.g. `myorg/Openbentt` */
export const GITHUB_REPO = trim(import.meta.env.VITE_GITHUB_REPO) || DEFAULT_GITHUB_REPO;

/**
 * Version segment in desktop/web zip filenames from electron-builder / CI (e.g. 2.0.2 in `Openbentt-2.0.2.AppImage`).
 * Defaults to `package.json` via `VITE_APP_VERSION` at build time. A legacy `VITE_DESKTOP_ASSET_VERSION` is only used if `VITE_APP_VERSION` is unavailable.
 */
export const DESKTOP_ASSET_VERSION =
  trim(import.meta.env.VITE_APP_VERSION) ||
  trim(import.meta.env.VITE_DESKTOP_ASSET_VERSION) ||
  "2.2.4";

export function githubReleasesLatestUrl(): string | null {
  if (!GITHUB_REPO) return null;
  return `https://github.com/${GITHUB_REPO}/releases/latest`;
}

export function githubBlobMain(relativePath: string): string | null {
  if (!GITHUB_REPO) return null;
  return `https://github.com/${GITHUB_REPO}/blob/main/${relativePath}`;
}

/** Direct asset URL using `releases/latest/download/` (follows the newest GitHub release). */
export function releaseLatestAssetUrl(filename: string): string | null {
  if (!GITHUB_REPO) return null;
  const enc = encodeURIComponent(filename);
  return `https://github.com/${GITHUB_REPO}/releases/latest/download/${enc}`;
}

export const releaseAssets = {
  windowsNsis: () => releaseLatestAssetUrl(`Openbentt Setup ${DESKTOP_ASSET_VERSION}.exe`),
  windowsPortable: () => releaseLatestAssetUrl("Openbentt.exe"),
  windowsZip: () => releaseLatestAssetUrl(`Openbentt-${DESKTOP_ASSET_VERSION}-win.zip`),
  linuxAppImage: () => releaseLatestAssetUrl(`Openbentt-${DESKTOP_ASSET_VERSION}.AppImage`),
  linuxDeb: () => releaseLatestAssetUrl(`openbentt_${DESKTOP_ASSET_VERSION}_amd64.deb`),
  macDmgArm64: () => releaseLatestAssetUrl(`Openbentt-${DESKTOP_ASSET_VERSION}-arm64.dmg`),
  macZipArm64: () => releaseLatestAssetUrl(`Openbentt-${DESKTOP_ASSET_VERSION}-arm64-mac.zip`),
  webStaticZip: () => releaseLatestAssetUrl("openbentt-web-dist.zip"),
} as const;
