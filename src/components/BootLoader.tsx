import { cn } from "@/lib/utils";

type BootLoaderProps = {
  /** Shorter copy for route suspense; longer for app config restore */
  variant?: "boot" | "route" | "workspace";
  className?: string;
};

const COPY = {
  boot: {
    line: "Openbentt",
    sub: "write papers · run agents · local models",
  },
  route: {
    line: "Openbentt",
    sub: "Loading this view…",
  },
  workspace: {
    line: "Openbentt",
    sub: "Restoring settings and chat history…",
  },
} as const;

/**
 * Branded dark loader — Caveat wordmark + yellow/lime pulse.
 * Used for Suspense fallbacks and workspace config restore.
 */
export function BootLoader({ variant = "route", className }: BootLoaderProps) {
  const copy = COPY[variant];
  return (
    <div
      className={cn(
        "ob-boot flex min-h-[50vh] w-full flex-col items-center justify-center gap-5 bg-[#0c0c0c] px-6 text-center",
        variant !== "route" && "min-h-screen",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="ob-boot__mark" aria-hidden>
        <span className="ob-boot__dot ob-boot__dot--y" />
        <span className="ob-boot__dot ob-boot__dot--g" />
        <span className="ob-boot__dot ob-boot__dot--y" />
      </div>
      <p className="ob-boot__title font-hand">{copy.line}</p>
      <p className="ob-boot__sub font-hand">{copy.sub}</p>
      <span className="sr-only">Loading</span>
    </div>
  );
}
