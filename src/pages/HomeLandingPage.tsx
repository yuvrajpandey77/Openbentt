import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  BookOpen,
  Download,
  Globe,
  Layers,
  Lock,
  Moon,
  Shield,
  Sparkles,
  Sun,
  Zap,
} from "lucide-react";

function WebPowerRing({ className }: { className?: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const pct = 60;
  const offset = c * (1 - pct / 100);
  return (
    <svg viewBox="0 0 100 100" className={cn("shrink-0", className)} aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" className="stroke-muted/60" strokeWidth="10" />
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

const pillars = [
  {
    title: "Model lab",
    body: "Run one prompt across several models, compare latency and tokens, and keep context in one place.",
    icon: Layers,
  },
  {
    title: "Notebook & PDF",
    body: "Bring LaTeX-heavy workflows into a focused editor with compile and preview when you need print-ready output.",
    icon: BookOpen,
  },
  {
    title: "Privacy stance",
    body: "Your keys stay on the device. Openbentt does not operate a hosted account layer for chat content.",
    icon: Shield,
  },
];

const HomeLandingPage: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    document.title = "Openbentt · Workspace for AI chat, research, and documents";
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.48] dark:opacity-32"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 85% 65% at 50% -20%, hsl(var(--primary) / 0.28), transparent 58%),
            radial-gradient(ellipse 50% 40% at 100% 10%, hsl(187 55% 42% / 0.1), transparent 45%),
            linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted) / 0.2) 100%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border)/0.28)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.28)_1px,transparent_1px)] bg-[size:52px_52px] opacity-[0.22] dark:opacity-[0.12]"
        aria-hidden
      />

      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight">
            <img src="/openbentt-logo.svg" alt="" width={36} height={36} className="rounded-lg shadow-sm" />
            Openbentt
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#product" className="hover:text-foreground">
              Product
            </a>
            <a href="#choose" className="hover:text-foreground">
              Get started
            </a>
            <Link to="/download" className="hover:text-foreground">
              Downloads
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button size="sm" className="rounded-xl shadow-sm" asChild>
              <Link to="/chat">Open app</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 md:px-8 md:pt-16">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <div className="space-y-6">
              <p className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                Productivity workspace
              </p>
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight text-balance md:text-5xl lg:text-[3.15rem]">
                Serious work with AI models,{" "}
                <span className="bg-gradient-to-r from-primary via-teal-600 to-cyan-600 bg-clip-text text-transparent dark:from-primary dark:via-teal-400 dark:to-cyan-300">
                  without giving up control
                </span>
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
                Openbentt is a focused environment for assisted writing, research threads, and structured outputs. You
                choose providers and models; your credentials stay local. Use it as a native app for maximum comfort, or
                in the browser when you need speed over peak capacity.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" className="h-12 rounded-xl px-7 text-base shadow-md shadow-primary/15" asChild>
                  <Link to="/download" className="gap-2">
                    <Download className="h-5 w-5" />
                    Get the desktop app
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="h-12 rounded-xl border-border/80" asChild>
                  <Link to="/chat" className="gap-2">
                    Continue in browser
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
            <div className="relative rounded-2xl border border-border/60 bg-card/80 p-6 shadow-xl backdrop-blur-sm">
              <div className="absolute -right-6 -top-6 h-40 w-40 rounded-full bg-primary/15 blur-3xl" aria-hidden />
              <div className="relative space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <Lock className="h-5 w-5" />
                  <span className="text-sm font-semibold">Designed for local-first use</span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Conversations and workspace state live in your profile on this machine. There is no Openbentt cloud
                  login replacing your model provider: you bring keys where the app needs them, and they stay under your
                  control.
                </p>
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Multi-model comparison with measurable latency and usage where the API exposes it
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Notebook path for long-form LaTeX and PDF workflows alongside chat
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Optional desktop shell with the same UI you deploy to the web
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="product" className="scroll-mt-28 border-t border-border/40 bg-muted/15 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <div className="mb-10 max-w-2xl">
              <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">What you get</h2>
              <p className="mt-2 text-muted-foreground">
                A single surface for experimentation and delivery: chat, comparison, and document-oriented tooling.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {pillars.map(({ title, body, icon: Icon }) => (
                <Card key={title} className="border-border/70 bg-card/90 shadow-sm">
                  <CardHeader>
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="font-display text-lg">{title}</CardTitle>
                    <CardDescription className="text-base leading-relaxed">{body}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="choose" className="scroll-mt-28 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <div className="mb-10 text-center">
              <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Choose your runtime</h2>
              <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">
                Same product: native gives you the full desktop envelope; web stays convenient with a lighter footprint
                in the tab.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 md:gap-8">
              <Card className={cn("relative overflow-hidden border-border/80 bg-card/95 shadow-lg", "ring-2 ring-primary/20")}>
                <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/12 blur-2xl" aria-hidden />
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-primary">
                      <Zap className="h-6 w-6" />
                      <CardTitle className="font-display text-xl">Desktop</CardTitle>
                    </div>
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 font-display text-xs font-semibold text-primary">
                      Full capacity
                    </span>
                  </div>
                  <CardDescription className="text-base leading-relaxed">
                    Windows, Linux, and macOS installers. Best for long sessions, large previews, and keeping the app one
                    click away from your research stack.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button size="lg" className="h-12 w-full rounded-xl text-base shadow-md shadow-primary/10" asChild>
                    <Link to="/download" className="gap-2">
                      <Download className="h-5 w-5" />
                      Downloads &amp; checksums
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border-border/80 bg-card/85 shadow-md">
                <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-amber-500/10 blur-2xl dark:bg-amber-400/10" aria-hidden />
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <Globe className="h-6 w-6 shrink-0" />
                        <CardTitle className="font-display text-xl">Browser</CardTitle>
                      </div>
                      <CardDescription className="text-base leading-relaxed">
                        Runs entirely in your tab. Heavy PDF and model workloads share browser memory; we show an at-a-glance
                        capacity hint so expectations stay clear.
                      </CardDescription>
                    </div>
                    <WebPowerRing className="h-[5.25rem] w-[5.25rem] md:h-[5.75rem] md:w-[5.75rem]" />
                  </div>
                  <p className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    <strong className="text-foreground">About 60% capacity</strong> is our plain-language label for the
                    web build: full features, less headroom than the native shell for the same workload.
                  </p>
                </CardHeader>
                <CardContent>
                  <Button size="lg" variant="secondary" className="h-12 w-full rounded-xl border border-border/70" asChild>
                    <Link to="/chat" className="gap-2">
                      <Globe className="h-5 w-5 opacity-80" />
                      Open web workspace
                      <ArrowRight className="h-4 w-4 opacity-70" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <p className="mt-10 text-center text-sm text-muted-foreground">
              Shared read-only snapshots:{" "}
              <Link to="/share" className="font-medium text-primary underline-offset-4 hover:underline">
                /share
              </Link>
            </p>
          </div>
        </section>

        <footer className="border-t border-border/50 bg-muted/20 py-10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center text-sm text-muted-foreground md:flex-row md:text-left md:px-8">
            <div className="flex items-center gap-2">
              <img src="/openbentt-logo.svg" alt="" width={28} height={28} className="rounded-md" />
              <span className="font-display font-medium text-foreground">Openbentt</span>
            </div>
            <p className="max-w-md">Workspace software for people who ship documents, not just prompts.</p>
            <Link to="/download" className="text-primary hover:underline">
              Release builds
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default HomeLandingPage;
