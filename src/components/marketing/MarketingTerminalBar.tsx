import { hero } from "@/config/marketingContent";
import { Apple, Monitor } from "lucide-react";

export function MarketingTerminalBar() {
  return (
    <div className="border-t border-border/50 bg-[hsl(222_28%_12%)] text-[hsl(210_25%_92%)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-6">
        <p className="font-mono text-sm tracking-tight text-[hsl(210_20%_78%)]">{hero.terminalLine}</p>
        <div className="flex flex-wrap items-center gap-4 text-xs text-[hsl(210_18%_65%)]">
          <span className="inline-flex items-center gap-1.5">
            <Monitor className="h-3.5 w-3.5" aria-hidden />
            Windows
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Apple className="h-3.5 w-3.5" aria-hidden />
            macOS
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Monitor className="h-3.5 w-3.5" aria-hidden />
            Linux
          </span>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-medium text-[hsl(210_25%_88%)]">
            Phase 1 · 2026
          </span>
        </div>
      </div>
    </div>
  );
}
