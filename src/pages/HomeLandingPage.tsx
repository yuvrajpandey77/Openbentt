import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { ArrowRight, Download, Globe, Moon, Sparkles, Sun, Zap } from "lucide-react";

/** Decorative ring showing ~60% fill — “web tier” framing (browser limits vs native). */
function WebPowerRing({ className }: { className?: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const pct = 60;
  const offset = c * (1 - pct / 100);
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        className="stroke-muted/60"
        strokeWidth="10"
      />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        className="stroke-amber-500/90 dark:stroke-amber-400/90"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
      />
      <text
        x="50"
        y="54"
        textAnchor="middle"
        className="fill-foreground text-[22px] font-bold font-display"
      >
        {pct}%
      </text>
    </svg>
  );
}

const HomeLandingPage: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    document.title = "Openbentt — choose desktop or web";
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5] dark:opacity-35"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 90% 70% at 50% -25%, hsl(var(--primary) / 0.32), transparent 55%),
            radial-gradient(ellipse 55% 45% at 0% 100%, hsl(222 45% 48% / 0.12), transparent 50%),
            linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted) / 0.25) 100%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:44px_44px] opacity-[0.28] dark:opacity-[0.15]"
        aria-hidden
      />

      <header className="flex items-center justify-between gap-3 px-4 py-4 md:px-8">
        <div className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          Openbentt
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-xl"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 pb-20 pt-6 md:gap-12 md:px-6 md:pt-10">
        <div className="space-y-4 text-center md:space-y-5">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Local-first OpenRouter client
          </p>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight md:text-4xl lg:text-[2.75rem]">
            How do you want to run{" "}
            <span className="bg-gradient-to-r from-primary via-teal-600 to-cyan-600 bg-clip-text text-transparent dark:from-primary dark:via-teal-400 dark:to-cyan-400">
              Openbentt
            </span>
            ?
          </h1>
          <p className="mx-auto max-w-xl text-base text-muted-foreground md:text-lg">
            Pick native for the full experience, or the web build when you want something lighter in the browser.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <Card
            className={cn(
              "relative overflow-hidden border-border/80 bg-card/90 shadow-lg backdrop-blur-sm",
              "ring-2 ring-primary/25"
            )}
          >
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl"
              aria-hidden
            />
            <CardHeader className="space-y-3 pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-primary">
                  <Zap className="h-6 w-6" />
                  <CardTitle className="font-display text-xl md:text-2xl">Desktop</CardTitle>
                </div>
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 font-display text-xs font-semibold text-primary">
                  100%
                </span>
              </div>
              <CardDescription className="text-base text-muted-foreground">
                Installers for Windows, Linux, and macOS — full UI, native window, best for long sessions and heavy
                workspaces.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-2">
              <Button size="lg" className="h-12 w-full rounded-xl text-base shadow-md shadow-primary/15" asChild>
                <Link to="/download" className="gap-2">
                  <Download className="h-5 w-5" />
                  Download &amp; install
                </Link>
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Installers, portable builds, and checksums on the downloads page.
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-border/80 bg-card/80 shadow-md backdrop-blur-sm">
            <div
              className="pointer-events-none absolute -left-6 bottom-0 h-28 w-28 rounded-full bg-amber-500/10 blur-2xl dark:bg-amber-400/10"
              aria-hidden
            />
            <CardHeader className="space-y-3 pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Globe className="h-6 w-6 shrink-0" />
                    <CardTitle className="font-display text-xl md:text-2xl">Web app</CardTitle>
                  </div>
                  <CardDescription className="text-base text-muted-foreground">
                    Same app in your tab — bounded by browser memory and network. Great for quick chats; heavy PDF /
                    model loads may feel tighter than desktop.
                  </CardDescription>
                </div>
                <WebPowerRing className="h-[5.5rem] w-[5.5rem] md:h-24 md:w-24" />
              </div>
              <p className="rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                We label this path <strong className="text-foreground">~60% power</strong>: full features, but not the
                same headroom as the native shell.
              </p>
            </CardHeader>
            <CardContent className="pt-2">
              <Button
                size="lg"
                variant="secondary"
                className="h-12 w-full rounded-xl border border-border/80 bg-secondary/80 text-base"
                asChild
              >
                <Link to="/chat" className="gap-2">
                  <Globe className="h-5 w-5 opacity-80" />
                  Use web version
                  <ArrowRight className="h-4 w-4 opacity-70" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Shared links &amp; read-only views:{" "}
          <Link to="/share" className="font-medium text-primary underline-offset-4 hover:underline">
            /share
          </Link>
        </p>
      </main>
    </div>
  );
};

export default HomeLandingPage;
