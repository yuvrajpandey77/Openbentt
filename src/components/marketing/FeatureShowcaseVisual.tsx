import { cn } from "@/lib/utils";

type FeatureShowcaseVisualProps = {
  variant: string;
  className?: string;
};

function WindowChrome({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2.5">
      <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
      <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-primary/90" />
      <span className="ml-2 flex-1 truncate rounded-md bg-background/80 px-3 py-1 text-center font-mono text-[10px] text-muted-foreground">
        {title}
      </span>
    </div>
  );
}

function ShimmerBar({
  className,
  delay,
  style,
}: {
  className?: string;
  delay?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("marketing-shimmer h-2 rounded-md bg-muted/80", className)}
      style={{ ...style, animationDelay: delay != null ? `${delay}ms` : undefined }}
    />
  );
}

function MeridianVisual() {
  return (
    <div className="grid min-h-[300px] grid-cols-2 md:min-h-[340px]">
      <div className="border-r border-border/50 bg-background p-3 font-mono text-[10px]">
        <p className="mb-2 text-primary/90">\\section&#123;Methods&#125;</p>
        <ShimmerBar className="mb-1.5 w-[92%]" />
        <ShimmerBar className="mb-1.5 w-[78%]" delay={120} />
        <ShimmerBar className="mb-3 w-[65%]" delay={240} />
        <p className="text-muted-foreground">
          \\cite&#123;<span className="marketing-type-cursor text-primary">author2024</span>&#125;
        </p>
        <span className="marketing-apply-pill mt-4 inline-flex rounded-md bg-primary px-2 py-1 text-[9px] font-semibold text-primary-foreground">
          Apply to source
        </span>
      </div>
      <div className="relative bg-muted/20 p-3">
        <p className="mb-2 text-[10px] font-medium text-muted-foreground">PDF preview</p>
        <div className="marketing-pdf-page space-y-2 rounded-lg border border-border/60 bg-card p-3 shadow-sm">
          <ShimmerBar className="h-2.5 w-3/4 bg-foreground/10" />
          <ShimmerBar className="w-full" delay={80} />
          <ShimmerBar className="w-5/6" delay={160} />
          <ShimmerBar className="w-2/3" delay={240} />
        </div>
        <span className="marketing-compile-dot absolute bottom-4 right-4 rounded-full bg-primary px-2 py-0.5 text-[9px] font-medium text-white">
          Compiled
        </span>
      </div>
    </div>
  );
}

function NotebookVisual() {
  return (
    <div className="grid min-h-[300px] grid-cols-2 md:min-h-[340px]">
      <div className="border-r border-border/50 bg-background p-3">
        <p className="mb-2 font-mono text-[10px] text-muted-foreground">main.tex</p>
        <div className="space-y-1.5">
          {[100, 88, 72, 90, 60].map((w, i) => (
            <ShimmerBar key={w} delay={i * 100} style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="marketing-spin-slow mt-4 inline-flex items-center gap-1.5 text-[9px] text-primary">
          <span className="h-3 w-3 rounded-full border-2 border-primary/30 border-t-primary" />
          Building PDF…
        </div>
      </div>
      <div className="flex items-center justify-center bg-gradient-to-br from-muted/30 to-primary/5 p-4">
        <div className="marketing-float-a4 aspect-[3/4] w-[70%] max-w-[140px] rounded-md border border-border/70 bg-card p-3 shadow-lg">
          <div className="mb-2 h-3 w-12 rounded bg-foreground/15" />
          <div className="space-y-1.5">
            <ShimmerBar className="w-full" />
            <ShimmerBar className="w-4/5" delay={100} />
            <ShimmerBar className="w-full" delay={200} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelArenaVisual() {
  const models = [
    { name: "Gemma 2", tps: "48 tok/s", lat: "0.9s", h: "72%" },
    { name: "Mistral", tps: "62 tok/s", lat: "0.6s", h: "88%" },
    { name: "Phi-3", tps: "91 tok/s", lat: "0.4s", h: "95%" },
  ];

  return (
    <div className="min-h-[300px] p-4 md:min-h-[340px]">
      <p className="mb-3 font-mono text-[10px] text-muted-foreground">Same prompt · 3 models</p>
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {models.map((m, i) => (
          <div
            key={m.name}
            className="rounded-xl border border-border/60 bg-card/90 p-2.5 md:p-3"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <p className="truncate text-[10px] font-semibold text-foreground">{m.name}</p>
            <div className="mt-2 flex h-16 items-end gap-0.5 rounded-md bg-muted/40 p-1 md:h-20">
              <div
                className="marketing-bar-grow w-full rounded-sm bg-primary/70"
                style={{ height: m.h, animationDelay: `${200 + i * 150}ms` }}
              />
            </div>
            <p className="marketing-metric-pulse mt-2 font-mono text-[9px] text-primary">{m.tps}</p>
            <p className="text-[9px] text-muted-foreground">{m.lat} TTFT</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DesktopGgufVisual() {
  const models = ["gemma-2-9b-Q4", "mistral-7b-Q5", "phi-3-mini-Q8"];

  return (
    <div className="min-h-[300px] p-4 md:min-h-[340px]">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] text-muted-foreground">Local GGUF hub</p>
        <span className="marketing-offline-glow rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-medium text-primary">
          Offline ready
        </span>
      </div>
      <ul className="space-y-2">
        {models.map((name, i) => (
          <li
            key={name}
            className="rounded-xl border border-border/60 bg-card px-3 py-2.5"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[10px] text-foreground">{name}</span>
              <span className="text-[9px] text-muted-foreground">{(2.1 + i * 0.8).toFixed(1)} GB</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="marketing-progress-fill h-full rounded-full bg-primary"
                style={{ animationDelay: `${300 + i * 400}ms` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="marketing-stream-lines mt-4 rounded-lg border border-border/50 bg-muted/25 px-3 py-2 font-mono text-[9px] text-muted-foreground">
        llama-server · streaming reply…
      </div>
    </div>
  );
}

function ResearchVisual() {
  return (
    <div className="min-h-[300px] p-4 md:min-h-[340px]">
      <div className="relative mb-4 h-28 rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 to-muted/30 md:h-32">
        <svg className="absolute inset-0 h-full w-full p-4" viewBox="0 0 200 100" aria-hidden>
          <circle className="marketing-graph-node" cx="40" cy="50" r="6" fill="hsl(var(--primary))" style={{ animationDelay: "0ms" }} />
          <circle className="marketing-graph-node" cx="100" cy="30" r="6" fill="hsl(var(--primary) / 0.7)" style={{ animationDelay: "200ms" }} />
          <circle className="marketing-graph-node" cx="160" cy="55" r="6" fill="hsl(var(--primary) / 0.5)" style={{ animationDelay: "400ms" }} />
          <circle className="marketing-graph-node" cx="120" cy="75" r="5" fill="hsl(var(--primary) / 0.4)" style={{ animationDelay: "600ms" }} />
          <path
            className="marketing-graph-edge"
            d="M40 50 L100 30 L160 55 M100 30 L120 75"
            fill="none"
            stroke="hsl(var(--primary) / 0.35)"
            strokeWidth="1.5"
          />
        </svg>
      </div>
      <p className="mb-2 font-mono text-[10px] text-muted-foreground">BibTeX · 3 papers linked</p>
      <ul className="space-y-1.5">
        {["Attention Is All You Need", "Scaling Laws for Neural LMs", "Your draft.pdf"].map((title, i) => (
          <li
            key={title}
            className="marketing-bib-row rounded-md border border-border/50 bg-card/80 px-2 py-1.5 text-[10px] text-foreground"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            {title}
          </li>
        ))}
      </ul>
    </div>
  );
}

const VARIANTS: Record<string, { title: string; body: React.ReactNode }> = {
  meridian: { title: "Notebook · Meridian 0.1", body: <MeridianVisual /> },
  notebook: { title: "Notebook · LaTeX + PDF", body: <NotebookVisual /> },
  "model-arena": { title: "Model arena", body: <ModelArenaVisual /> },
  "desktop-gguf": { title: "Research labs · GGUF", body: <DesktopGgufVisual /> },
  research: { title: "Research labs", body: <ResearchVisual /> },
};

export function FeatureShowcaseVisual({ variant, className }: FeatureShowcaseVisualProps) {
  const config = VARIANTS[variant] ?? VARIANTS.notebook;

  return (
    <div
      className={cn(
        "marketing-feature-visual relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_20px_60px_-24px_hsl(var(--primary)/0.2)]",
        className
      )}
      aria-hidden
    >
      <WindowChrome title={config.title} />
      <div className="marketing-feature-visual-body">{config.body}</div>
    </div>
  );
}
