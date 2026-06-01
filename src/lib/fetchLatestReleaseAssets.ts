import { GITHUB_REPO, releaseAssets } from "@/config/releaseDownloads";

export type ReleaseAssetKind = keyof typeof releaseAssets;

export type ResolvedReleaseAssets = {
  version: string;
  tagName: string;
  releaseUrl: string;
  /** Resolved download URLs keyed by asset kind. */
  assets: Partial<Record<ReleaseAssetKind, string>>;
  /** True when at least one desktop installer/archive is present (not just source). */
  hasInstallers: boolean;
  /** GitHub API fetch failed — fall back to static URLs. */
  fromFallback: boolean;
  /** Most common semver detected from installer asset filenames (if present). */
  inferredAssetVersion: string | null;
  /** True when latest tag version and installer filename version differ. */
  versionMismatch: boolean;
};

type GhAsset = { name: string; browser_download_url: string };
type GhRelease = {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: GhAsset[];
};

const INSTALLER_EXTENSIONS = [".appimage", ".deb", ".exe", ".dmg", ".zip"];

function isInstallerAsset(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.includes("source")) return false;
  return INSTALLER_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Map a GitHub release asset filename to our download row kind. */
function classifyAsset(filename: string): ReleaseAssetKind | null {
  const lower = filename.toLowerCase();
  if (filename === "openbentt-web-dist.zip") return "webStaticZip";
  if (lower.endsWith(".appimage")) return "linuxAppImage";
  if (lower.endsWith(".deb")) return "linuxDeb";
  if (lower.endsWith(".dmg") && lower.includes("arm64")) return "macDmgArm64";
  if (lower.endsWith(".zip") && lower.includes("arm64") && lower.includes("mac")) return "macZipArm64";
  if (lower.endsWith("-win.zip")) return "windowsZip";
  if (lower.endsWith(".exe") && lower.includes("setup")) return "windowsNsis";
  if (filename === "Openbentt.exe") return "windowsPortable";
  return null;
}

function stripTagPrefix(tag: string): string {
  return tag.replace(/^v/i, "");
}

function latestAssetUrl(filename: string): string {
  return `https://github.com/${GITHUB_REPO}/releases/latest/download/${encodeURIComponent(filename)}`;
}

function versionedFallbackUrl(kind: ReleaseAssetKind, version: string): string {
  switch (kind) {
    case "windowsNsis":
      return latestAssetUrl(`Openbentt Setup ${version}.exe`);
    case "windowsPortable":
      return latestAssetUrl("Openbentt.exe");
    case "windowsZip":
      return latestAssetUrl(`Openbentt-${version}-win.zip`);
    case "linuxAppImage":
      return latestAssetUrl(`Openbentt-${version}.AppImage`);
    case "linuxDeb":
      return latestAssetUrl(`openbentt_${version}_amd64.deb`);
    case "macDmgArm64":
      return latestAssetUrl(`Openbentt-${version}-arm64.dmg`);
    case "macZipArm64":
      return latestAssetUrl(`Openbentt-${version}-arm64-mac.zip`);
    case "webStaticZip":
      return latestAssetUrl("openbentt-web-dist.zip");
  }
}

function extractVersionFromAssetName(name: string): string | null {
  const patterns = [
    /Openbentt Setup (\d+\.\d+\.\d+(?:-[\w.]+)?)\.exe/i,
    /Openbentt-(\d+\.\d+\.\d+(?:-[\w.]+)?)-win\.zip/i,
    /Openbentt-(\d+\.\d+\.\d+(?:-[\w.]+)?)\.AppImage/i,
    /openbentt_(\d+\.\d+\.\d+(?:-[\w.]+)?)_amd64\.deb/i,
    /Openbentt-(\d+\.\d+\.\d+(?:-[\w.]+)?)-arm64\.dmg/i,
    /Openbentt-(\d+\.\d+\.\d+(?:-[\w.]+)?)-arm64-mac\.zip/i,
  ];
  for (const re of patterns) {
    const m = name.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function fallbackAssets(): ResolvedReleaseAssets {
  const kinds = Object.keys(releaseAssets) as ReleaseAssetKind[];
  const assets: Partial<Record<ReleaseAssetKind, string>> = {};
  for (const kind of kinds) {
    const url = releaseAssets[kind]();
    if (url) assets[kind] = url;
  }
  return {
    version: "",
    tagName: "",
    releaseUrl: GITHUB_REPO ? `https://github.com/${GITHUB_REPO}/releases/latest` : "",
    assets,
    hasInstallers: true,
    fromFallback: true,
    inferredAssetVersion: null,
    versionMismatch: false,
  };
}

/**
 * Fetch the latest GitHub Release and resolve real asset download URLs.
 * Falls back to constructed `releases/latest/download/{filename}` URLs on error.
 */
export async function fetchLatestReleaseAssets(): Promise<ResolvedReleaseAssets> {
  if (!GITHUB_REPO) return fallbackAssets();

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return fallbackAssets();

    const data = (await res.json()) as GhRelease;
    const latestVersion = stripTagPrefix(data.tag_name);
    const assets: Partial<Record<ReleaseAssetKind, string>> = {};
    const mismatchedKinds = new Set<ReleaseAssetKind>();
    let hasInstallers = false;
    const versionVotes = new Map<string, number>();

    for (const asset of data.assets ?? []) {
      const kind = classifyAsset(asset.name);
      const inferred = extractVersionFromAssetName(asset.name);
      if (isInstallerAsset(asset.name)) {
        hasInstallers = true;
        if (inferred) versionVotes.set(inferred, (versionVotes.get(inferred) ?? 0) + 1);
      }
      if (!kind || assets[kind]) continue;

      if (inferred && inferred !== latestVersion) {
        mismatchedKinds.add(kind);
        continue;
      }

      assets[kind] = asset.browser_download_url;
    }

    // Fill gaps with versioned filenames derived from the latest tag first.
    // If the only published asset for a row had a stale versioned filename, route to
    // the release page instead of sending users to an obviously wrong direct download.
    const kinds = Object.keys(releaseAssets) as ReleaseAssetKind[];
    for (const kind of kinds) {
      if (!assets[kind]) {
        const url = mismatchedKinds.has(kind)
          ? data.html_url
          : versionedFallbackUrl(kind, latestVersion) || releaseAssets[kind]();
        if (url) assets[kind] = url;
      }
    }

    const inferredAssetVersion = [...versionVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const versionMismatch = Boolean(inferredAssetVersion && inferredAssetVersion !== latestVersion);

    return {
      version: latestVersion,
      tagName: data.tag_name,
      releaseUrl: data.html_url,
      assets,
      hasInstallers,
      fromFallback: false,
      inferredAssetVersion,
      versionMismatch,
    };
  } catch {
    return fallbackAssets();
  }
}

export function pickAsset(
  resolved: ResolvedReleaseAssets | null,
  kind: ReleaseAssetKind
): string | null {
  if (!resolved) return releaseAssets[kind]();
  return resolved.assets[kind] ?? releaseAssets[kind]() ?? null;
}
