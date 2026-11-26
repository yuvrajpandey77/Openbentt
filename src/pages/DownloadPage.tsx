import React, { useEffect, useMemo, useState } from "react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import {
  githubReleasesLatestUrl,
  DESKTOP_ASSET_VERSION,
} from "@/config/releaseDownloads";
import { useLatestReleaseAssets } from "@/hooks/useLatestReleaseAssets";
import { pickAsset, type ReleaseAssetKind } from "@/lib/fetchLatestReleaseAssets";
import { getClientPlatform, type ClientPlatform } from "@/lib/detectClientPlatform";
import { trackDownloadClick } from "@/lib/analytics/marketingAnalytics";
import { cn } from "@/lib/utils";
import { applyPageSeo, marketingSeo } from "@/lib/seo/pageSeo";

type DownloadOption = {
  id: string;
  kind: ReleaseAssetKind;
  label: string;
  href: string | null;
  downloads: number | null;
};

function usePrimaryPlatform(): ClientPlatform {
  const [p, setP] = useState<ClientPlatform>("unknown");
  useEffect(() => {
    setP(getClientPlatform());
  }, []);
  return p;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

const DownloadPage: React.FC = () => {
  const platform = usePrimaryPlatform();
  const { release, loading } = useLatestReleaseAssets();
  const releasesUrl = release?.releaseUrl ?? githubReleasesLatestUrl();
  const displayVersion = release?.version || DESKTOP_ASSET_VERSION;
  const totalDownloads = release && !release.fromFallback ? release.totalDownloads : null;

  useEffect(() => {
    applyPageSeo(marketingSeo.download);
  }, []);

  const asset = (kind: ReleaseAssetKind) => pickAsset(release, kind);
  const countFor = (kind: ReleaseAssetKind): number | null => {
    if (!release || release.fromFallback) return null;
    const n = release.downloadCounts[kind];
    return typeof n === "number" ? n : null;
  };

  const windows = useMemo<DownloadOption[]>(
    () => [
      { id: "win-nsis", kind: "windowsNsis", label: "Installer · NSIS", href: asset("windowsNsis"), downloads: countFor("windowsNsis") },
      { id: "win-portable", kind: "windowsPortable", label: "Portable .exe", href: asset("windowsPortable"), downloads: countFor("windowsPortable") },
      { id: "win-zip", kind: "windowsZip", label: "Zip", href: asset("windowsZip"), downloads: countFor("windowsZip") },
    ],
    [release]
  );

  const linux = useMemo<DownloadOption[]>(
    () => [
      { id: "linux-appimage", kind: "linuxAppImage", label: "AppImage", href: asset("linuxAppImage"), downloads: countFor("linuxAppImage") },
      { id: "linux-deb", kind: "linuxDeb", label: "Debian package", href: asset("linuxDeb"), downloads: countFor("linuxDeb") },
    ],
    [release]
  );

  const mac = useMemo<DownloadOption[]>(
    () => [
      { id: "mac-dmg", kind: "macDmgArm64", label: "Disk image · .dmg", href: asset("macDmgArm64"), downloads: countFor("macDmgArm64") },
      { id: "mac-zip", kind: "macZipArm64", label: "Zip", href: asset("macZipArm64"), downloads: countFor("macZipArm64") },
    ],
    [release]
  );

  const web = useMemo<DownloadOption[]>(
    () => [{ id: "web-zip", kind: "webStaticZip", label: "Static zip", href: asset("webStaticZip"), downloads: countFor("webStaticZip") }],
    [release]
  );

  const here = (family: ClientPlatform) => platform !== "unknown" && platform === family;

  return (
    <MarketingShell>
      <main className="ov-dl">
        <div className="ov-container">
          <header className="ov-dl__head">
            <p className="ov-dl__version">{loading ? "Latest release" : `Latest · v${displayVersion}`}</p>
            <h1 className="font-hand">Download</h1>
            {typeof totalDownloads === "number" && totalDownloads > 0 ? (
              <p className="ov-dl__stats font-hand" aria-live="polite">
                {formatCount(totalDownloads)} downloads on this release
              </p>
            ) : null}
          </header>

          {!loading && release && !release.hasInstallers && (
            <p className="ov-dl__note">No installers on this release yet.</p>
          )}

          <div className="ov-dl__grid">
            <PlatformCard
              title="Windows"
              meta="x64"
              here={here("windows")}
              platform="windows"
              version={displayVersion}
              options={windows}
            />
            <PlatformCard
              title="Linux"
              meta="amd64"
              here={here("linux")}
              platform="linux"
              version={displayVersion}
              options={linux}
            />
            <PlatformCard
              title="macOS"
              meta="Apple Silicon"
              here={here("mac")}
              platform="mac"
              version={displayVersion}
              options={mac}
            />
            <PlatformCard title="Web" meta="Self-host" platform="web" version={displayVersion} options={web} />
          </div>

          {releasesUrl && (
            <a className="ov-link ov-dl__more" href={releasesUrl} target="_blank" rel="noreferrer">
              All release files →
            </a>
          )}
        </div>
      </main>
    </MarketingShell>
  );
};

function PlatformCard({
  title,
  meta,
  here,
  platform,
  version,
  options,
}: {
  title: string;
  meta: string;
  here?: boolean;
  platform: string;
  version: string;
  options: DownloadOption[];
}) {
  return (
    <article className={cn("ov-dl__card", here && "ov-dl__card--here")}>
      <div className="ov-dl__card-top">
        <h2 className="font-hand">{title}</h2>
        {here && <span>This device</span>}
      </div>
      <p className="ov-dl__meta">{meta}</p>
      <ul>
        {options.map((option) => (
          <li key={option.id}>
            <span>
              {option.label}
              {typeof option.downloads === "number" ? (
                <span className="ov-dl__count"> · {formatCount(option.downloads)}</span>
              ) : null}
            </span>
            {option.href ? (
              <a
                href={option.href}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  trackDownloadClick({
                    assetId: option.id,
                    platform,
                    version,
                    source: "download_page",
                    href: option.href,
                  })
                }
              >
                Download
              </a>
            ) : (
              <span className="ov-dl__soon">Unavailable</span>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

export default DownloadPage;
