import { useCallback, useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { isDesktopApp } from "@/lib/isDesktopApp";

/** Matches .app-shell --background (hsl 0 0% 12%). */
export const DESKTOP_TITLE_BAR_HEIGHT_PX = 28;

type DesktopChrome = {
  platform: string;
  frameless: boolean;
};

function readDesktopChrome(): DesktopChrome | null {
  const api = window.openbenttDesktop;
  if (!api?.isElectron) return null;
  return {
    platform: api.platform,
    frameless: api.framelessTitleBar === true,
  };
}

function WindowControl({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-7 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground",
        className
      )}
      style={{ WebkitAppRegion: "no-drag" }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function DesktopTitleBar() {
  const [chrome, setChrome] = useState<DesktopChrome | null>(() =>
    typeof window !== "undefined" ? readDesktopChrome() : null
  );
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) return;
    setChrome(readDesktopChrome());
    void window.openbenttDesktop?.windowIsMaximized?.().then(setMaximized);
  }, []);

  const minimize = useCallback(() => {
    void window.openbenttDesktop?.windowMinimize?.();
  }, []);

  const toggleMaximize = useCallback(() => {
    void window.openbenttDesktop?.windowToggleMaximize?.().then((v) => {
      if (typeof v === "boolean") setMaximized(v);
    });
  }, []);

  const close = useCallback(() => {
    void window.openbenttDesktop?.windowClose?.();
  }, []);

  if (!chrome) return null;

  const isMac = chrome.platform === "darwin";
  const isWin = chrome.platform === "win32";

  return (
    <header
      className="app-shell dark flex h-7 shrink-0 items-stretch border-b border-border/50 bg-background text-foreground select-none"
      style={{ height: DESKTOP_TITLE_BAR_HEIGHT_PX }}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 px-2 text-[11px] text-muted-foreground",
          isMac && "pl-[72px]",
          isWin && "pr-[140px]"
        )}
        style={{ WebkitAppRegion: "drag" }}
      >
        <span className="truncate font-medium tracking-tight text-foreground/90">Openbentt</span>
      </div>

      {chrome.frameless && (
        <div className="flex shrink-0 items-stretch" style={{ WebkitAppRegion: "no-drag" }}>
          <WindowControl label="Minimize" onClick={minimize}>
            <Minus className="h-3.5 w-3.5" strokeWidth={2} />
          </WindowControl>
          <WindowControl label={maximized ? "Restore" : "Maximize"} onClick={toggleMaximize}>
            {maximized ? (
              <Copy className="h-3 w-3 rotate-180" strokeWidth={2} />
            ) : (
              <Square className="h-3 w-3" strokeWidth={2} />
            )}
          </WindowControl>
          <WindowControl
            label="Close"
            onClick={close}
            className="hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </WindowControl>
        </div>
      )}
    </header>
  );
}

/** Full-height desktop shell: compact title bar + scrollable app body. */
export function DesktopAppFrame({ children }: { children: React.ReactNode }) {
  if (!isDesktopApp()) return <>{children}</>;

  return (
    <div className="app-shell dark flex h-screen max-h-screen flex-col overflow-hidden bg-background text-foreground">
      <DesktopTitleBar />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
