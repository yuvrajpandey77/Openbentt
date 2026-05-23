import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { MarketingSectionHeader } from "@/components/marketing/MarketingSectionHeader";
import { useSuggestedDownload } from "@/components/marketing/useSuggestedDownload";
import { desktopHighlights } from "@/config/marketingContent";
import {
  githubReleasesLatestUrl,
  githubBlobMain,
  DESKTOP_ASSET_VERSION,
} from "@/config/releaseDownloads";
import { useLatestReleaseAssets } from "@/hooks/useLatestReleaseAssets";
import { pickAsset, type ReleaseAssetKind } from "@/lib/fetchLatestReleaseAssets";
import { getClientPlatform, type ClientPlatform } from "@/lib/detectClientPlatform";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Apple,
  ArrowRight,
  BookOpen,
  Box,
  Check,
  Download,
  ExternalLink,
  FileArchive,
  Github,
  Globe,
  Layers,
  Monitor,
  ScrollText,
} from "lucide-react";

type DownloadRow = {
  id: string;
  label: string;
  hint?: string;
  href: string | null;
  icon: React.ReactNode;
  primary?: boolean;
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
  const suggested = useSuggestedDownload();
  const { release, loading } = useLatestReleaseAssets();
  const releasesUrl = release?.releaseUrl ?? githubReleasesLatestUrl();
  const displayVersion = release?.version || DESKTOP_ASSET_VERSION;
  const webHref = pickAsset(release, "webStaticZip");

  useEffect(() => {
    document.title = "Download Openbentt";
  }, []);

  const asset = (kind: ReleaseAssetKind) => pickAsset(release, kind);

  const windowsRows: DownloadRow[] = useMemo(
    () => [
      {
        id: "win-nsis",
        label: "Installer",
        hint: "Recommended · NSIS",
        href: asset("windowsNsis"),
        icon: <Download className="h-4 w-4" />,
        primary: true,
      },
      {
        id: "win-portable",
        label: "Portable .exe",
        hint: "No installer",
        href: asset("windowsPortable"),
        icon: <Monitor className="h-4 w-4" />,
      },
      {
        id: "win-zip",
        label: "Zip archive",
        href: asset("windowsZip"),
        icon: <FileArchive className="h-4 w-4" />,
      },
    ],
    [release]
  );

  const linuxRows: DownloadRow[] = useMemo(
    () => [
      {
        id: "linux-appimage",
        label: "AppImage",
        hint: "Recommended · amd64",
        href: asset("linuxAppImage"),
        icon: <Box className="h-4 w-4" />,
        primary: true,
      },
      {
        id: "linux-deb",
        label: "Debian package",
        href: asset("linuxDeb"),
        icon: <Layers className="h-4 w-4" />,
      },
    ],
    [release]
  );

  const macRows: DownloadRow[] = useMemo(
    () => [
      {
        id: "mac-dmg",
        label: "Disk image (.dmg)",
        hint: "Apple Silicon",
        href: asset("macDmgArm64"),
        icon: <Apple className="h-4 w-4" />,
        primary: true,
      },
      {
        id: "mac-zip",
        label: "Zip archive",
        href: asset("macZipArm64"),
        icon: <FileArchive className="h-4 w-4" />,
      },
    ],
    [release]
  );

  const highlight = (family: ClientPlatform) => platform !== "unknown" && platform === family;

  return (
    <MarketingShell wide terminalBar>
      <main>
        <section className="marketing-section pb-12 md:pb-16">
          <div className="marketing-container">
            <MarketingReveal className="max-w-3xl">
              <p className="marketing-eyebrow">
                Release {loading ? "…" : `v${displayVersion}`}
              </p>
              <h1 className="marketing-page-title mt-3">Download Openbentt</h1>
              <p className="marketing-page-lead mt-5">
                Production builds for Windows, Linux, and macOS. Links resolve from the latest GitHub Release when
                available. Verify checksums on GitHub if you need supply-chain assurance. Unsigned installers may show
                OS security prompts — expected for open-source releases.
              </p>
            </MarketingReveal>

            {!loading && release && !release.hasInstallers && (
              <MarketingReveal delay={40} className="mt-8">
                <div className="flex max-w-2xl gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">Installers not published yet</p>
                    <p className="mt-1 text-muted-foreground">
                      The latest GitHub Release ({release.tagName}) has source archives only. Push a version tag to
                      trigger CI — see{" "}
                      {releasesUrl ? (
                        <a href={releasesUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                          GitHub Releases
                        </a>
                      ) : (
                        "GitHub Releases"
                      )}
                      . Installed desktop apps auto-update once <code className="text-xs">latest*.yml</code> assets
                      ship with the release.
                    </p>
                  </div>
                </div>
              </MarketingReveal>
            )}

            {suggested?.href && (
              <MarketingReveal delay={80} className="mt-10 md:mt-12">
                <div className="marketing-card marketing-card--highlight max-w-2xl p-6 md:p-8">
                  <p className="text-sm font-semibold text-primary">Suggested for you</p>
                  <p className="mt-2 font-display text-2xl font-semibold text-foreground md:text-3xl">{suggested.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{suggested.hint}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button size="lg" className="h-12 gap-2 rounded-xl px-7 font-semibold" asChild>
                      <a href={suggested.href} target="_blank" rel="noreferrer">
                        <Download className="h-5 w-5" />
                        Download now
                      </a>
                    </Button>
                    {releasesUrl && (
                      <Button size="lg" variant="outline" className="h-12 rounded-xl" asChild>
                        <a href={releasesUrl} target="_blank" rel="noreferrer" className="gap-2">
                          <Github className="h-4 w-4" />
                          All release assets
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </MarketingReveal>
            )}

            <MarketingReveal delay={120} className="mt-8 flex flex-wrap gap-3">
              <Button variant="outline" className="h-11 rounded-xl" asChild>
                <Link to="/chat" className="gap-2">
                  Use web app instead
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" className="h-11 rounded-xl" asChild>
                <Link to="/">Back to home</Link>
              </Button>
            </MarketingReveal>
          </div>
        </section>

        <section className="marketing-section-band border-y border-border/40 py-12 md:py-16">
          <div className="marketing-container">
            <MarketingSectionHeader
              align="left"
              eyebrow="Desktop"
              title="What ships in the installer"
              lead="Same UI as this site, with offline GGUF, labs, and more headroom for long sessions."
            />
            <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {desktopHighlights.map((line, i) => (
                <MarketingReveal key={line} as="li" delay={i * 40}>
                  <div className="marketing-card flex gap-3 px-4 py-3.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="text-sm leading-relaxed text-foreground md:text-base">{line}</span>
                  </div>
                </MarketingReveal>
              ))}
            </ul>
          </div>
        </section>

        <section id="downloads" className="marketing-section scroll-mt-32">
          <div className="marketing-container">
            <MarketingSectionHeader
              title="All platforms"
              lead="Desktop builds bundle Electron with the same UI as this site. Intel Mac builds and other architectures may appear on the GitHub release page only."
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-3 lg:gap-8">
              <PlatformBlock title="Windows" subtitle="10 / 11 · x64" highlighted={highlight("windows")} rows={windowsRows} />
              <PlatformBlock title="Linux" subtitle="AppImage & deb · amd64" highlighted={highlight("linux")} rows={linuxRows} />
              <PlatformBlock
                title="macOS"
                subtitle="Apple Silicon (arm64)"
                highlighted={highlight("mac")}
                rows={macRows}
                note="Intel Mac builds are on GitHub releases if you need them."
              />
            </div>
          </div>
        </section>

        <section id="web" className="marketing-section scroll-mt-32 border-t border-border/40 pb-16 md:pb-20">
          <div className="marketing-container">
            <MarketingReveal>
              <div className="marketing-card flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between md:gap-10 md:p-10">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Globe className="h-5 w-5" />
                    <h2 className="font-display text-xl font-semibold text-foreground md:text-2xl">Web & self-host</h2>
                  </div>
                  <p className="max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
                    Skip the installer and open the workspace in your browser, or deploy the static zip to nginx, S3, or
                    Docker.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row md:flex-col md:items-stretch lg:items-end">
                  <Button size="lg" className="h-12 rounded-xl font-semibold" asChild>
                    <Link to="/chat">Open web app</Link>
                  </Button>
                  {webHref && (
                    <Button size="lg" variant="outline" className="h-12 rounded-xl gap-2" asChild>
                      <a href={webHref} target="_blank" rel="noreferrer">
                        <FileArchive className="h-4 w-4" />
                        Static bundle (v{displayVersion})
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </MarketingReveal>
          </div>
        </section>

        <section id="docs" className="marketing-section scroll-mt-32 border-t border-border/40 marketing-section--cta">
          <div className="marketing-container">
            <MarketingSectionHeader title="Documentation" lead="Build, release, and hardening guides on GitHub." />
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <DocLink
                title="README"
                description="Features, scripts, and environment variables."
                href={githubBlobMain("README.md")}
                icon={<BookOpen className="h-4 w-4" />}
              />
              <DocLink
                title="Releasing"
                description="How CI builds installers and publishes assets."
                href={githubBlobMain("RELEASING.md")}
                icon={<ScrollText className="h-4 w-4" />}
              />
              <DocLink
                title="Production checklist"
                description="Hardening before you ship to users."
                href={githubBlobMain("PRODUCTION_CHECKLIST.md")}
                icon={<Layers className="h-4 w-4" />}
              />
              <DocLink
                title="Electron shell"
                description="Desktop dev commands and window loading."
                href={githubBlobMain("electron/README.md")}
                icon={<Monitor className="h-4 w-4" />}
              />
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
};

function PlatformBlock({
  title,
  subtitle,
  highlighted,
  rows,
  note,
}: {
  title: string;
  subtitle: string;
  highlighted: boolean;
  rows: DownloadRow[];
  note?: string;
}) {
  return (
    <div
      className={cn(
        "marketing-download-platform",
        highlighted && "marketing-download-platform--active"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {highlighted && (
          <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-medium text-primary">This device</span>
        )}
      </div>
      <ul className="mt-5 space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn("marketing-download-row", row.primary && "marketing-download-row--primary")}
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="text-muted-foreground">{row.icon}</span>
                {row.label}
              </p>
              {row.hint && <p className="mt-0.5 pl-6 text-xs text-muted-foreground">{row.hint}</p>}
            </div>
            {row.href ? (
              <Button size="sm" variant={row.primary ? "default" : "secondary"} className="shrink-0 rounded-lg" asChild>
                <a href={row.href} target="_blank" rel="noreferrer">
                  Download
                </a>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled className="shrink-0 rounded-lg">
                Soon
              </Button>
            )}
          </li>
        ))}
      </ul>
      {note && <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}

function DocLink({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string | null;
  icon: React.ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="font-medium text-foreground">{title}</span>
        <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </>
  );

  if (!href) {
    return <div className="marketing-doc-link border-dashed opacity-70">{content}</div>;
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className="marketing-doc-link">
      {content}
    </a>
  );
}

export default DownloadPage;
