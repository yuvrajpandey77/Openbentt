import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";
import { githubReleasesLatestUrl, GITHUB_REPO } from "@/config/releaseDownloads";
import { cogerphereWebsite, footerColumns } from "@/config/marketingContent";
import { marketingNav } from "@/components/marketing/marketingNav";
import { cn } from "@/lib/utils";
import { MarketingHeroBackdrop } from "@/components/marketing/MarketingHeroBackdrop";
import { MarketingTerminalBar } from "@/components/marketing/MarketingTerminalBar";
import { Github, Moon, Sun } from "lucide-react";

type MarketingShellProps = {
  children: React.ReactNode;
  homeAnchors?: boolean;
  terminalBar?: boolean;
  wide?: boolean;
  /** Dark overview chrome. Default for every public marketing page. */
  overview?: boolean;
};

export function MarketingShell({
  children,
  homeAnchors = false,
  terminalBar = false,
  wide = false,
  overview = true,
}: MarketingShellProps) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const releasesUrl = githubReleasesLatestUrl();
  const onHome = location.pathname === "/";
  const githubUrl = GITHUB_REPO ? `https://github.com/${GITHUB_REPO}` : null;
  const [scrolled, setScrolled] = useState(false);
  const isOverview = overview;
  const wideLayout = wide || isOverview;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash;
    const scrollToHash = () => {
      const el = document.querySelector(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const t = window.setTimeout(scrollToHash, 80);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.hash]);

  const resolveHashLink = (hash: string) => {
    if (homeAnchors && onHome) return hash;
    return `/${hash}`;
  };

  return (
    <div
      className={cn(
        "marketing-page relative min-h-screen text-foreground",
        onHome && "marketing-page--home",
        isOverview && "marketing-page--overview",
        !onHome && "bg-background"
      )}
    >
      {!isOverview && (
        <div className="marketing-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(55vh,480px)]" aria-hidden />
      )}

      {onHome && !isOverview && <MarketingHeroBackdrop />}

      <header
        className={cn(
          "marketing-header sticky top-0 z-50 border-b transition-[background-color,box-shadow,border-color] duration-300",
          isOverview
            ? cn("ov-header border-transparent", scrolled && "ov-header--scrolled")
            : onHome
              ? cn("marketing-header--over-hero border-transparent", scrolled && "marketing-header--scrolled")
              : cn("border-border/50 bg-background/90 backdrop-blur-md", scrolled && "marketing-header--scrolled")
        )}
      >
        <div
          className={cn(
            "mx-auto flex h-14 items-center justify-between gap-4 px-5 md:h-16 md:px-8",
            wideLayout ? "max-w-[1200px]" : "max-w-6xl"
          )}
        >
          <Link to="/" className="marketing-brand flex shrink-0 items-center gap-2.5">
            <img
              src="/openbentt-logo.svg"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg"
            />
            <span className="font-display text-base font-semibold tracking-tight md:text-lg">Openbentt</span>
          </Link>

          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Site">
            {marketingNav.map((item) =>
              "to" in item ? (
                <Link
                  key={item.label}
                  to={item.to}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm transition-colors",
                    isOverview
                      ? "text-white/55 hover:text-white"
                      : "text-muted-foreground hover:text-foreground",
                    location.pathname === item.to && (isOverview ? "text-white" : "font-semibold text-foreground")
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={resolveHashLink(item.href)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm transition-colors",
                    isOverview ? "text-white/55 hover:text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                </a>
              )
            )}
          </nav>

          <div className="flex items-center gap-2">
            {!isOverview && (
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={toggleTheme} aria-label="Toggle theme">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            {githubUrl && (
              isOverview ? (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden text-sm text-white/70 transition-colors hover:text-white sm:inline"
                >
                  GitHub
                </a>
              ) : (
                <Button variant="outline" className="hidden h-9 rounded-lg px-3 text-sm sm:inline-flex gap-2" asChild>
                  <a href={githubUrl} target="_blank" rel="noreferrer">
                    <Github className="h-4 w-4" />
                    GitHub
                  </a>
                </Button>
              )
            )}

            {isOverview ? (
              <Link to="/download" className="ov-header-cta">
                Download
              </Link>
            ) : (
              <Button className="h-9 rounded-lg px-4 text-sm font-semibold" asChild>
                <Link to="/download">Download</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {children}

      {terminalBar && !isOverview && <MarketingTerminalBar />}

      <footer
        className={cn(
          isOverview ? "ov-footer" : "border-t border-border/50 bg-muted/15",
          terminalBar && !isOverview ? "mt-0" : "mt-0"
        )}
      >
        {isOverview ? (
          <div className="ov-footer__inner">
            <div className="ov-footer__top">
              <div className="ov-footer__brand">
                <Link to="/" className="ov-footer__brand-link">
                  <img src="/openbentt-logo.svg" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" />
                  <span className="ov-footer__brand-name font-hand">Openbentt</span>
                </Link>
                <p className="ov-footer__tagline font-hand">
                  Write papers, run agents &amp; local models — <em>in one desktop lab</em>.
                </p>
                <p className="ov-footer__blurb">
                  Desktop lab for LaTeX, Paper Orchestra, agents, and local GGUF. By{" "}
                  <a href={cogerphereWebsite} target="_blank" rel="noreferrer">
                    Cogerphere
                  </a>
                  .
                </p>
              </div>
              <div className="ov-footer__columns">
                {footerColumns.map((col) => (
                  <div key={col.title}>
                    <p className="ov-footer__heading">{col.title}</p>
                    <ul>
                      {col.links.map((link) => (
                        <li key={link.label}>
                          {"to" in link ? (
                            <Link to={link.to}>{link.label}</Link>
                          ) : link.external === "releases" && releasesUrl ? (
                            <a href={releasesUrl} target="_blank" rel="noreferrer">
                              {link.label}
                            </a>
                          ) : typeof link.external === "string" ? (
                            <a href={link.external} target="_blank" rel="noreferrer">
                              {link.label}
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="ov-footer__bottom">
              <p className="ov-footer__copy">© {new Date().getFullYear()} Openbentt. All rights reserved.</p>
              <Link to="/download" className="ov-footer__cta">
                Download desktop
              </Link>
            </div>
          </div>
        ) : (
          <div className={cn("mx-auto px-5 py-14 md:px-8", wideLayout ? "max-w-[1200px]" : "max-w-6xl")}>
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-3">
                <Link to="/" className="inline-flex items-center gap-2.5">
                  <img src="/openbentt-logo.svg" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
                  <span className="font-display text-base font-semibold">Openbentt</span>
                </Link>
                <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                  Desktop lab for LaTeX, Paper Orchestra, agents, and local GGUF. By{" "}
                  <a
                    href={cogerphereWebsite}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Cogerphere
                  </a>
                  .
                </p>
              </div>
              {footerColumns.map((col) => (
                <div key={col.title}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {col.title}
                  </p>
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
        )}
      </footer>
    </div>
  );
}
