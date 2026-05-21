import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ProjectLoadingScreenProps = {
  title?: string;
  subtitle?: string;
  className?: string;
};

/** Prism-style transition while a research project loads. */
export function ProjectLoadingScreen({
  title = "Loading project",
  subtitle = "Preparing files, draft, and workspace…",
  className,
}: ProjectLoadingScreenProps) {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-center bg-background px-6",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative mb-8 flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-xl" aria-hidden />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-card shadow-lg">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </div>
      <p className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</p>
      <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/70" />
      </div>
    </div>
  );
}
