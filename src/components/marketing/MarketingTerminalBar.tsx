import { hero } from "@/config/marketingContent";
import { Apple, Monitor } from "lucide-react";

export function MarketingTerminalBar() {
  return (
    <div className="marketing-terminal-bar">
      <div className="marketing-container flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
        <p className="marketing-terminal-bar__line">{hero.terminalLine}</p>
        <div className="marketing-terminal-bar__meta">
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
          <span className="marketing-terminal-bar__badge">Phase 1 · 2026</span>
        </div>
      </div>
    </div>
  );
}
