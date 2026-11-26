import React, { useEffect, useMemo, useState } from "react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import {
  githubReleasesLatestUrl,
  DESKTOP_ASSET_VERSION,
} from "@/config/releaseDownloads";
import { useLatestReleaseAssets } from "@/hooks/useLatestReleaseAssets";
import { pickAsset, type ReleaseAssetKind } from "@/lib/fetchLatestReleaseAssets";
import { getClientPlatform, type ClientPlatform } from "@/lib/detectClientPlatform";
import { cn } from "@/lib/utils";

type DownloadOption = {
  id: string;
  label: string;
  href: string | null;
};

function usePrimaryPlatform(): ClientPlatform {
  const [p, setP] = useState<ClientPlatform>("unknown");
  useEffect(() => {
    setP(getClientPlatform());
  }, []);
  return p;
}

const DownloadPage: React.FC = () => {
  const platform = usePrimaryPlatform();
  const { release, loading } = useLatestReleaseAssets();
  const releasesUrl = release?.releaseUrl ?? githubReleasesLatestUrl();
  const displayVersion = release?.version || DESKTOP_ASSET_VERSION;

  useEffect(() => {
    document.title = "Download Openbentt";
  }, []);

  const asset = (kind: ReleaseAssetKind) => pickAsset(release, kind);

  const windows = useMemo<DownloadOption[]>(
    () => [
      { id: "win-nsis", label: "Installer · NSIS", href: asset("windowsNsis") },
      { id: "win-portable", label: "Portable .exe", href: asset("windowsPortable") },
      { id: "win-zip", label: "Zip", href: asset("windowsZip") },
    ],
    [release]
  );

  const linux = useMemo<DownloadOption[]>(
    () => [
      { id: "linux-appimage", label: "AppImage", href: asset("linuxAppImage") },
      { id: "linux-deb", label: "Debian package", href: asset("linuxDeb") },
    ],
    [release]
  );

  const mac = useMemo<DownloadOption[]>(
    () => [
      { id: "mac-dmg", label: "Disk image · .dmg", href: asset("macDmgArm64") },
      { id: "mac-zip", label: "Zip", href: asset("macZipArm64") },
    ],
    [release]
  );

  const web = useMemo<DownloadOption[]>(
    () => [{ id: "web-zip", label: "Static zip", href: asset("webStaticZip") }],
    [release]
  );

  const here = (family: ClientPlatform) => platform !== "unknown" && platform === family;

  return (
    <MarketingShell>
      <main className="ov-dl">
        <div className="ov-container">
          <header className="ov-dl__head">
            <p className="ov-dl__version">{loading ? "Latest release" : `Latest · v${displayVersion}`}</p>
            <h1>Download</h1>
          </header>

          {!loading && release && !release.hasInstallers && (
            <p className="ov-dl__note">No installers on this release yet.</p>
          )}

          <div className="ov-dl__grid">
            <PlatformCard title="Windows" meta="x64" here={here("windows")} options={windows} />
            <PlatformCard title="Linux" meta="amd64" here={here("linux")} options={linux} />
            <PlatformCard title="macOS" meta="Apple Silicon" here={here("mac")} options={mac} />
            <PlatformCard title="Web" meta="Self-host" options={web} />
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
  options,
}: {
  title: string;
  meta: string;
  here?: boolean;
  options: DownloadOption[];
}) {
  return (
    <article className={cn("ov-dl__card", here && "ov-dl__card--here")}>
      <div className="ov-dl__card-top">
        <h2>{title}</h2>
        {here && <span>This device</span>}
      </div>
      <p className="ov-dl__meta">{meta}</p>
      <ul>
        {options.map((option) => (
          <li key={option.id}>
            <span>{option.label}</span>
            {option.href ? (
              <a href={option.href} target="_blank" rel="noreferrer">
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
