import { cn } from "@/lib/utils";

/** CSS-only product frame — no screenshots required for marketing. */
export function ProductShowcase({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_24px_80px_-24px_rgba(15,55,65,0.35)] dark:shadow-[0_32px_90px_-28px_rgba(0,0,0,0.65)]",
        className
      )}
      aria-hidden
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/90" />
        <span className="ml-2 flex-1 rounded-md bg-background/80 px-3 py-1 text-center font-mono text-[10px] text-muted-foreground">
          openbentt workspace
        </span>
      </div>

      <div className="grid min-h-[280px] grid-cols-[148px_1fr] md:min-h-[320px]">
        <aside className="border-r border-border/50 bg-sidebar/80 p-2.5">
          <p className="mb-2 px-1 font-mono text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Threads
          </p>
          <div className="space-y-1">
            <div className="rounded-md bg-primary/15 px-2 py-1.5 text-[11px] font-medium text-foreground">Paper draft</div>
            <div className="rounded-md px-2 py-1.5 text-[11px] text-muted-foreground">Model compare</div>
            <div className="rounded-md px-2 py-1.5 text-[11px] text-muted-foreground">Lab notes</div>
          </div>
          <p className="mb-1.5 mt-4 px-1 font-mono text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Workspaces
          </p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p className="px-2 py-1">Notebook</p>
            <p className="px-2 py-1">Research labs</p>
          </div>
        </aside>

        <div className="flex flex-col bg-background p-3 md:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-border/70 bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-foreground">
              claude-sonnet · openrouter
            </span>
            <span className="rounded-md border border-dashed border-primary/40 px-2 py-0.5 font-mono text-[10px] text-primary">
              + compare model
            </span>
          </div>

          <div className="flex-1 space-y-3">
            <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary/12 px-3 py-2 text-[11px] leading-relaxed text-foreground">
              Summarize the methods section and flag anything that needs a citation.
            </div>
            <div className="max-w-[95%] rounded-2xl rounded-bl-md border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="text-foreground">Three gaps stand out:</span> sample size is underpowered for subgroup
                analysis; baseline metrics differ from Table 2; the ablation omits the tokenizer variant you cited in §4.
              </p>
              <p className="mt-2 font-mono text-[9px] text-primary/90">streaming · 412 tokens · 1.2s</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-border/70 bg-muted/25 px-3 py-2">
            <p className="font-mono text-[10px] text-muted-foreground">Message composer: attach PDF, image, or paste LaTeX</p>
          </div>
        </div>
      </div>
    </div>
  );
}
