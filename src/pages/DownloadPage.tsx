import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  releaseAssets,
  githubReleasesLatestUrl,
  githubBlobMain,
  GITHUB_REPO,
  DESKTOP_ASSET_VERSION,
} from "@/config/releaseDownloads";
import { getClientPlatform, type ClientPlatform } from "@/lib/detectClientPlatform";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
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
  Sparkles,
} from "lucide-react";

type DownloadRow = {
  id: string;
  label: string;
  hint?: string;
  href: string | null;
  icon: React.ReactNode;
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
  const releasesUrl = githubReleasesLatestUrl();

  useEffect(() => {
    document.title = "Download Openbentt — desktop & web";
  }, []);

  const windowsRows: DownloadRow[] = useMemo(
    () => [
      {
        id: "win-nsis",
        label: "Installer (recommended)",
        hint: "NSIS — installs shortcuts and updater metadata",
        href: releaseAssets.windowsNsis(),
        icon: <Download className="h-4 w-4" />,
      },
      {
        id: "win-portable",
        label: "Portable .exe",
        hint: "Single executable folder layout",
        href: releaseAssets.windowsPortable(),
        icon: <Monitor className="h-4 w-4" />,
      },
      {
        id: "win-zip",
        label: "Archive .zip",
        hint: "Unpack and run",
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
        hint: "Universal Linux binary — chmod +x and run",
        href: releaseAssets.linuxAppImage(),
        icon: <Box className="h-4 w-4" />,
      },
      {
        id: "linux-deb",
        label: "Debian / Ubuntu (.deb)",
        hint: "amd64 package",
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
        hint: "Apple Silicon (arm64)",
        href: releaseAssets.macDmgArm64(),
        icon: <Apple className="h-4 w-4" />,
      },
      {
        id: "mac-zip",
        label: "Archive (.zip)",
        hint: "Apple Silicon (arm64)",
        href: releaseAssets.macZipArm64(),
        icon: <FileArchive className="h-4 w-4" />,
      },
    ],
    []
  );

  const webHref = releaseAssets.webStaticZip();

  const highlight = (family: ClientPlatform) =>
    platform !== "unknown" && platform === family;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.55] dark:opacity-40"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 100% 80% at 50% -30%, hsl(var(--primary) / 0.35), transparent 55%),
            radial-gradient(ellipse 70% 50% at 100% 0%, hsl(187 60% 45% / 0.12), transparent 45%),
            radial-gradient(ellipse 60% 40% at 0% 100%, hsl(222 40% 50% / 0.1), transparent 50%),
            linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted) / 0.35) 100%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[size:48px_48px] opacity-[0.35] dark:opacity-[0.2]"
        aria-hidden
      />

      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link
            to="/"
            className="group flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight text-foreground"
          >
            <img src="/openbentt-logo.svg" alt="" width={32} height={32} className="rounded-lg shadow-sm" />
            Openbentt
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-xs font-medium text-muted-foreground md:text-sm">
            <a href="#overview" className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground">
              Overview
            </a>
            <a href="#downloads" className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground">
              Downloads
            </a>
            <a href="#web" className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground">
              Web
            </a>
            <a href="#docs" className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground">
              Docs
            </a>
            {releasesUrl && (
              <a
                href={releasesUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
              >
                GitHub <ExternalLink className="h-3 w-3 opacity-70" />
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-10 md:px-6 md:pt-14">
        <section id="overview" className="scroll-mt-28 space-y-6">
          <Badge variant="secondary" className="font-display text-[10px] uppercase tracking-widest">
            Release channel · v{DESKTOP_ASSET_VERSION} assets
          </Badge>
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Install{" "}
            <span className="bg-gradient-to-r from-primary via-teal-600 to-cyan-600 bg-clip-text text-transparent dark:from-primary dark:via-teal-400 dark:to-cyan-400">
              Openbentt
            </span>{" "}
            for your operating system
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">
            Production builds for Windows, Linux, and macOS, plus a static bundle for self-hosting. Your suggested
            download is highlighted from this browser when we can detect the platform. Verify checksums on GitHub if you
            need supply-chain assurance.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="gap-2 rounded-xl shadow-md shadow-primary/10" asChild>
              <a href="#downloads">
                <Download className="h-4 w-4" />
                Go to downloads
              </a>
            </Button>
            <Button size="lg" variant="outline" className="rounded-xl border-border/80 bg-card/50 backdrop-blur-sm" asChild>
              <Link to="/chat" className="gap-2">
                Launch web app
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        {!GITHUB_REPO && (
          <Alert className="mt-10 border-amber-500/40 bg-amber-500/5" id="configure">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle>Configure GitHub release links</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Set <code className="rounded bg-muted px-1 py-0.5 text-xs">VITE_GITHUB_REPO=owner/repo</code> at build
              time so download buttons point at your GitHub Releases. Optional:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">VITE_DESKTOP_ASSET_VERSION</code> must match the
              filenames published with each release.
            </AlertDescription>
          </Alert>
        )}

        <section id="downloads" className="scroll-mt-28 pt-16">
          <div className="mb-8 flex flex-col gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Choose your platform</h2>
            <p className="max-w-2xl text-muted-foreground">
              Desktop builds bundle the same UI as the hosted site inside Electron. Unsigned macOS / Windows installers
              may show OS security prompts — open from GitHub if you need checksums.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <PlatformCard
              title="Windows"
              subtitle="10 / 11 (x64)"
              icon={<Monitor className="h-5 w-5" />}
              highlighted={highlight("windows")}
              rows={windowsRows}
            />
            <PlatformCard
              title="Linux"
              subtitle="AppImage + deb (amd64)"
              icon={<Server className="h-5 w-5" />}
              highlighted={highlight("linux")}
              rows={linuxRows}
            />
            <PlatformCard
              title="macOS"
              subtitle="Apple Silicon (arm64)"
              icon={<Apple className="h-5 w-5" />}
              highlighted={highlight("mac")}
              rows={macRows}
              footer={
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Intel Mac builds are not listed here. Use the{" "}
                  {releasesUrl ? (
                    <a href={releasesUrl} className="font-medium text-primary underline-offset-2 hover:underline">
                      GitHub release page
                    </a>
                  ) : (
                    "GitHub release page"
                  )}{" "}
                  if you need other architectures.
                </p>
              }
            />
          </div>
        </section>

        <section id="web" className="scroll-mt-28 pt-20">
          <Card className="overflow-hidden border-border/80 bg-gradient-to-br from-card via-card to-muted/30 shadow-lg">
            <CardHeader className="space-y-2 pb-2">
              <div className="flex items-center gap-2 text-primary">
                <Globe className="h-5 w-5" />
                <CardTitle className="font-display text-xl">Web &amp; self-host</CardTitle>
              </div>
              <CardDescription className="text-base text-muted-foreground">
                Use Openbentt instantly in the browser, or deploy the static bundle anywhere (nginx, S3, Docker).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Hosted app (same origin as this page)
                </p>
                <p>No installer — your OpenRouter key stays in local storage in this browser.</p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <Button asChild className="rounded-xl">
                  <Link to="/chat">Open web app</Link>
                </Button>
                {webHref && (
                  <Button variant="outline" size="sm" className="rounded-lg" asChild>
                    <a href={webHref}>
                      <FileArchive className="mr-2 h-4 w-4" />
                      Static zip ({DESKTOP_ASSET_VERSION})
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="docs" className="scroll-mt-28 pt-20">
          <h2 className="mb-6 font-display text-2xl font-semibold tracking-tight md:text-3xl">Documentation</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <DocTile
              title="README"
              description="Features, scripts, environment variables, and production paths."
              href={githubBlobMain("README.md")}
              icon={<BookOpen className="h-4 w-4" />}
            />
            <DocTile
              title="Releasing"
              description="How GitHub Actions builds installers and what to set in CI."
              href={githubBlobMain("RELEASING.md")}
              icon={<ScrollText className="h-4 w-4" />}
            />
            <DocTile
              title="Production checklist"
              description="Hardening and go-live items before you ship."
              href={githubBlobMain("PRODUCTION_CHECKLIST.md")}
              icon={<Layers className="h-4 w-4" />}
            />
            <DocTile
              title="Electron shell"
              description="Desktop dev commands and how the window loads the Vite build."
              href={githubBlobMain("electron/README.md")}
              icon={<Monitor className="h-4 w-4" />}
            />
          </div>
        </section>

        <Separator className="my-16 opacity-60" />

        <footer className="flex flex-col gap-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p className="font-display text-foreground/90">Openbentt — local-first OpenRouter workspaces.</p>
          <div className="flex flex-wrap gap-4">
            {releasesUrl && (
              <a
                href={releasesUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <Github className="h-4 w-4" />
                Releases
              </a>
            )}
            <Link to="/chat" className="hover:text-foreground">
              Web app
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
};

function PlatformCard({
  title,
  subtitle,
  icon,
  highlighted,
  rows,
  footer,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  highlighted: boolean;
  rows: DownloadRow[];
  footer?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col border-border/80 bg-card/80 shadow-md backdrop-blur-sm transition-shadow",
        highlighted && "ring-2 ring-primary/60 shadow-lg shadow-primary/10"
      )}
    >
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-primary">
            {icon}
            <CardTitle className="font-display text-lg">{title}</CardTitle>
          </div>
          {highlighted && (
            <Badge className="text-[10px] font-normal uppercase tracking-wide">Suggested</Badge>
          )}
        </div>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 pt-0">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-1 rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="text-muted-foreground">{row.icon}</span>
                  {row.label}
                </p>
                {row.hint && <p className="mt-0.5 pl-6 text-[11px] text-muted-foreground">{row.hint}</p>}
              </div>
              {row.href ? (
                <Button size="sm" variant="secondary" className="shrink-0 rounded-lg" asChild>
                  <a href={row.href} target="_blank" rel="noreferrer">
                    Get
                  </a>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled className="shrink-0 rounded-lg">
                  Get
                </Button>
              )}
            </div>
          </div>
        ))}
        {footer && <div className="mt-auto border-t border-border/50 pt-3">{footer}</div>}
      </CardContent>
    </Card>
  );
}

function DocTile({
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
  const inner = (
    <>
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="font-medium text-foreground">{title}</span>
        <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-50" />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </>
  );

  if (!href) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-4 opacity-70">
        {inner}
        <p className="mt-2 text-xs text-muted-foreground">Set VITE_GITHUB_REPO to link.</p>
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm transition-all hover:border-primary/40 hover:bg-card hover:shadow-md"
    >
      {inner}
    </a>
  );
}

export default DownloadPage;
