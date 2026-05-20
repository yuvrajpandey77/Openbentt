import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";
import { githubReleasesLatestUrl, GITHUB_REPO } from "@/config/releaseDownloads";
import { footerColumns } from "@/config/marketingContent";
import { marketingNav } from "@/components/marketing/marketingNav";
import { cn } from "@/lib/utils";
import { MarketingTerminalBar } from "@/components/marketing/MarketingTerminalBar";
import { Github, Moon, Sun } from "lucide-react";

type MarketingShellProps = {
  children: React.ReactNode;
  homeAnchors?: boolean;
  terminalBar?: boolean;
  /** Wider content column (landing hero) */
  wide?: boolean;
};

export function MarketingShell({
  children,
  homeAnchors = false,
  terminalBar = false,
  wide = false,
}: MarketingShellProps) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const releasesUrl = githubReleasesLatestUrl();
  const onHome = location.pathname === "/";
  const githubUrl = GITHUB_REPO ? `https://github.com/${GITHUB_REPO}` : null;

  const resolveHashLink = (hash: string) => {
    if (homeAnchors && onHome) return hash;
    return `/${hash}`;
  };

  return (
    <div className="marketing-page relative min-h-screen bg-background text-foreground">
      <div className="marketing-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(55vh,480px)]" aria-hidden />

      <header className="marketing-header sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-md">
        <div
          className={cn(
            "mx-auto flex h-[4.25rem] items-center justify-between gap-6 px-5 md:h-[4.75rem] md:px-8",
            wide ? "max-w-[1400px]" : "max-w-6xl"
          )}
        >
          <Link to="/" className="marketing-brand flex shrink-0 items-center gap-3">
            <img
              src="/openbentt-logo.svg"
              alt=""
              width={44}
              height={44}
              className="h-10 w-10 rounded-xl md:h-11 md:w-11"
            />
            <span className="font-display text-xl font-semibold tracking-tight md:text-2xl">Openbentt</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Site">
            {marketingNav.map((item) =>
              "to" in item ? (
                <Link
                  key={item.label}
                  to={item.to}
                  className={cn(
                    "rounded-lg px-4 py-2 text-[0.95rem] text-muted-foreground transition-colors hover:text-foreground",
                    location.pathname === item.to && "font-semibold text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={resolveHashLink(item.href)}
                  className="rounded-lg px-4 py-2 text-[0.95rem] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </a>
              )
            )}
          </nav>

          <div className="flex items-center gap-2 md:gap-2.5">
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-lg" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-[1.15rem] w-[1.15rem]" /> : <Moon className="h-[1.15rem] w-[1.15rem]" />}
            </Button>
            {githubUrl && (
              <Button variant="outline" className="hidden h-10 rounded-lg px-4 text-sm sm:inline-flex gap-2" asChild>
                <a href={githubUrl} target="_blank" rel="noreferrer">
                  <Github className="h-4 w-4" />
                  GitHub
                </a>
              </Button>
            )}
            <Button variant="ghost" className="hidden h-10 rounded-lg px-4 text-sm md:inline-flex" asChild>
              <Link to="/chat">Web app</Link>
            </Button>
            <Button className="h-10 rounded-lg px-5 text-sm font-semibold md:px-6" asChild>
              <Link to="/download">Download</Link>
            </Button>
          </div>
        </div>
      </header>

      {children}

      {terminalBar && <MarketingTerminalBar />}

      <footer className={cn("border-t border-border/50 bg-muted/15", terminalBar ? "mt-0" : "mt-8")}>
        <div className={cn("mx-auto px-4 py-14 md:px-8", wide ? "max-w-[1400px]" : "max-w-6xl")}>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-3">
              <Link to="/" className="inline-flex items-center gap-2.5">
                <img src="/openbentt-logo.svg" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" />
                <span className="font-display text-lg font-semibold">Openbentt</span>
              </Link>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                Local-first AI workspace for LaTeX, PDFs, benchmarking, and fine-tuned models. By Cogerphere.
              </p>
            </div>
            {footerColumns.map((col) => (
              <div key={col.title}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.title}</p>
                <ul className="space-y-2 text-sm">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {"to" in link ? (
                        <Link to={link.to} className="text-foreground/75 hover:text-foreground">
                          {link.label}
                        </Link>
                      ) : link.external === "releases" && releasesUrl ? (
                        <a
                          href={releasesUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground/75 hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      ) : typeof link.external === "string" ? (
                        <a
                          href={link.external}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground/75 hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-12 border-t border-border/50 pt-8 text-center text-xs text-muted-foreground md:text-left">
            © {new Date().getFullYear()} Openbentt. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
