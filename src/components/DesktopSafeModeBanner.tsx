import { useState } from "react";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { cn } from "@/lib/utils";
import { MonitorOff, X } from "lucide-react";

const DISMISS_STORAGE_KEY = "openbentt-software-render-banner-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Shown when Electron runs with software rendering (no GPU / safe mode). */
export function DesktopSafeModeBanner() {
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!isDesktopApp()) return null;
  if (!window.openbenttDesktop?.softwareRenderingMode) return null;
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      /* ignore quota / private mode */
    }
  };

  return (
    <div
      role="alert"
      className={cn(
        "relative z-20 mx-3 mt-2 flex shrink-0 items-start gap-2.5 rounded-md border border-primary/40",
        "bg-primary/10 px-3 py-2.5 text-xs text-foreground"
      )}
    >
      <MonitorOff className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 leading-relaxed">
        Running in software rendering mode (GPU unavailable). Cloud models via OpenRouter work normally;
        on-device WebGPU is disabled. Set{" "}
        <code className="rounded bg-black/10 px-1">OPENBENTT_DISABLE_GPU=0</code> to force hardware
        acceleration if your drivers support it.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close software rendering notice"
        title="Close"
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border/70",
          "bg-background/90 px-2 text-[11px] font-medium text-foreground shadow-sm",
          "transition-colors hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        )}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        <span>Close</span>
      </button>
    </div>
  );
}
