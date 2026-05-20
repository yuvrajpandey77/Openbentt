import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { useSuggestedDownload } from "@/components/marketing/useSuggestedDownload";
import {
  releaseAssets,
  githubReleasesLatestUrl,
  githubBlobMain,
  DESKTOP_ASSET_VERSION,
} from "@/config/releaseDownloads";
import { getClientPlatform, type ClientPlatform } from "@/lib/detectClientPlatform";
import { cn } from "@/lib/utils";
import {
  Apple,
  ArrowRight,
  BookOpen,
  Box,
  Download,
  ExternalLink,
  FileArchive,
  Github,
  Globe,
  Layers,
  Monitor,
  ScrollText,
  Server,
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
  const releasesUrl = githubReleasesLatestUrl();
  const webHref = releaseAssets.webStaticZip();

  useEffect(() => {
    document.title = "Download Openbentt";
  }, []);

  const windowsRows: DownloadRow[] = useMemo(
    () => [
      {
        id: "win-nsis",
        label: "Installer",
        hint: "Recommended · NSIS",
        href: releaseAssets.windowsNsis(),
        icon: <Download className="h-4 w-4" />,
        primary: true,
      },
      {
        id: "win-portable",
        label: "Portable .exe",
        hint: "No installer",
        href: releaseAssets.windowsPortable(),
        icon: <Monitor className="h-4 w-4" />,
      },
      {
        id: "win-zip",
        label: "Zip archive",
        href: releaseAssets.windowsZip(),
        icon: <FileArchive className="h-4 w-4" />,
      },
    ],
    []
  );

  const linuxRows: DownloadRow[] = useMemo(
    () => [
      {
        id: "linux-appimage",
        label: "AppImage",
        hint: "Recommended · amd64",
        href: releaseAssets.linuxAppImage(),
        icon: <Box className="h-4 w-4" />,
        primary: true,
      },
      {
        id: "linux-deb",
        label: "Debian package",
        href: releaseAssets.linuxDeb(),
        icon: <Layers className="h-4 w-4" />,
      },
    ],
    []
  );

  const macRows: DownloadRow[] = useMemo(
    () => [
      {
        id: "mac-dmg",
        label: "Disk image (.dmg)",
        hint: "Apple Silicon",
        href: releaseAssets.macDmgArm64(),
        icon: <Apple className="h-4 w-4" />,
        primary: true,
      },
      {
        id: "mac-zip",
        label: "Zip archive",
        href: releaseAssets.macZipArm64(),
        icon: <FileArchive className="h-4 w-4" />,
      },
    ],
    []
  );

  const highlight = (family: ClientPlatform) => platform !== "unknown" && platform === family;

  return (
    <MarketingShell>
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-12 md:px-6 md:pt-16">
        <section className="max-w-3xl space-y-6">
          <p className="font-mono text-xs text-muted-foreground">Release v{DESKTOP_ASSET_VERSION}</p>
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">Download Openbentt</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Production builds for Windows, Linux, and macOS. Verify checksums on GitHub if you need supply-chain
            assurance. Unsigned installers may show OS security prompts. That is expected for open-source releases.
          </p>

          {suggested?.href && (
            <div className="rounded-2xl border border-primary/30 bg-card p-6 md:p-8">
              <p className="text-sm font-medium text-primary">Suggested for you</p>
              <p className="mt-1 font-display text-2xl font-semibold">{suggested.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{suggested.hint}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button size="lg" className="h-12 rounded-lg gap-2 px-7" asChild>
                  <a href={suggested.href} target="_blank" rel="noreferrer">
                    <Download className="h-5 w-5" />
                    Download now
                  </a>
                </Button>
                {releasesUrl && (
                  <Button size="lg" variant="outline" className="h-12 rounded-lg" asChild>
                    <a href={releasesUrl} target="_blank" rel="noreferrer" className="gap-2">
                      <Github className="h-4 w-4" />
                      All release assets
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button variant="outline" className="rounded-lg" asChild>
              <Link to="/chat" className="gap-2">
                Use web app instead
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="ghost" className="rounded-lg" asChild>
              <Link to="/">← Home</Link>
            </Button>
          </div>
        </section>

        <section id="downloads" className="scroll-mt-24 pt-20">
          <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">All platforms</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Desktop builds bundle Electron with the same UI as this site. Intel Mac builds and other architectures may
            appear on the GitHub release page only.
          </p>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
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
        </section>

        <section id="web" className="scroll-mt-24 pt-20">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-8 md:flex md:items-center md:justify-between md:gap-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <Globe className="h-5 w-5" />
                <h2 className="font-display text-xl font-semibold">Web & self-host</h2>
              </div>
              <p className="max-w-lg text-muted-foreground leading-relaxed">
                Skip the installer and open the workspace in your browser, or deploy the static zip to nginx, S3, or
                Docker.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-2 md:mt-0 md:items-end">
              <Button className="rounded-lg" asChild>
                <Link to="/chat">Open web app</Link>
              </Button>
              {webHref && (
                <Button variant="outline" size="sm" className="rounded-lg" asChild>
                  <a href={webHref} target="_blank" rel="noreferrer" className="gap-2">
                    <FileArchive className="h-4 w-4" />
                    Static bundle (v{DESKTOP_ASSET_VERSION})
                  </a>
                </Button>
              )}
            </div>
          </div>
        </section>

        <section id="docs" className="scroll-mt-24 pt-20">
          <h2 className="font-display text-2xl font-bold tracking-tight">Documentation</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
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
        "rounded-2xl border border-border/70 bg-card p-5",
        highlighted && "border-primary/40 ring-1 ring-primary/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold">{title}</h3>
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
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5",
              row.primary && "border-primary/25 bg-primary/[0.04]"
            )}
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
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
        <span className="font-medium">{title}</span>
        <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </>
  );

  if (!href) {
    return <div className="rounded-xl border border-dashed border-border/80 p-4 opacity-70">{content}</div>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/30 hover:bg-card/95"
    >
      {content}
    </a>
  );
}

export default DownloadPage;
