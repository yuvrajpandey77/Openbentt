import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Square, X, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { isDesktopApp } from "@/lib/isDesktopApp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Matches .app-shell --background (hsl 0 0% 12%). */
export const DESKTOP_TITLE_BAR_HEIGHT_PX = 28;

const SITE_URL =
  import.meta.env.VITE_PUBLIC_SITE_URL?.trim() || "https://openbentt.vercel.app";

type DesktopChrome = {
  platform: string;
  frameless: boolean;
};

type EditRole = "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";

const NO_DRAG = { WebkitAppRegion: "no-drag" } as const;

const menuItemClass = "cursor-pointer px-2 py-1 text-xs focus:bg-accent";

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
      style={NO_DRAG}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TitleBarMenuTrigger({ label }: { label: string }) {
  return (
    <DropdownMenuTrigger
      className="inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground focus:outline-none data-[state=open]:bg-accent/80 data-[state=open]:text-foreground"
      style={NO_DRAG}
    >
      {label}
    </DropdownMenuTrigger>
  );
}

/** Bridges native app menu navigation (Alt menu) into React Router. */
function DesktopMenuNavigateBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const api = window.openbenttDesktop;
    if (!api?.onMenuNavigate) return;
    return api.onMenuNavigate((path) => navigate(path));
  }, [navigate]);

  return null;
}

function DesktopTitleBarMenus() {
  const navigate = useNavigate();
  const api = window.openbenttDesktop;

  const go = useCallback((path: string) => navigate(path), [navigate]);

  const edit = useCallback(
    (role: EditRole) => {
      void api?.editRole?.(role);
    },
    [api]
  );

  return (
    <nav className="flex shrink-0 items-center gap-0.5" aria-label="Application menu" style={NO_DRAG}>
      <DropdownMenu>
        <TitleBarMenuTrigger label="File" />
        <DropdownMenuContent align="start" className="min-w-[10rem]">
          <DropdownMenuItem className={menuItemClass} onSelect={() => go("/chat")}>
            New Chat
          </DropdownMenuItem>
          <DropdownMenuItem className={menuItemClass} onSelect={() => go("/projects")}>
            Projects
          </DropdownMenuItem>
          <DropdownMenuItem className={menuItemClass} onSelect={() => go("/notebook")}>
            Notebook Studio
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={menuItemClass} onSelect={() => void api?.quitApp?.()}>
            Quit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <TitleBarMenuTrigger label="Edit" />
        <DropdownMenuContent align="start" className="min-w-[10rem]">
          <DropdownMenuItem className={menuItemClass} onSelect={() => edit("undo")}>
            Undo
          </DropdownMenuItem>
          <DropdownMenuItem className={menuItemClass} onSelect={() => edit("redo")}>
            Redo
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={menuItemClass} onSelect={() => edit("cut")}>
            Cut
          </DropdownMenuItem>
          <DropdownMenuItem className={menuItemClass} onSelect={() => edit("copy")}>
            Copy
          </DropdownMenuItem>
          <DropdownMenuItem className={menuItemClass} onSelect={() => edit("paste")}>
            Paste
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={menuItemClass} onSelect={() => edit("selectAll")}>
            Select All
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <TitleBarMenuTrigger label="View" />
        <DropdownMenuContent align="start" className="min-w-[10rem]">
          <DropdownMenuItem className={menuItemClass} onSelect={() => void api?.reloadPage?.()}>
            Reload
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={menuItemClass} onSelect={() => void api?.toggleDevTools?.()}>
            Toggle Developer Tools
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <TitleBarMenuTrigger label="Help" />
        <DropdownMenuContent align="start" className="min-w-[10rem]">
          <DropdownMenuItem className={menuItemClass} onSelect={() => void api?.showAbout?.()}>
            About Openbentt
          </DropdownMenuItem>
          <DropdownMenuItem
            className={menuItemClass}
            onSelect={() => void api?.openExternal?.(SITE_URL)}
          >
            Openbentt Website
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
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
          "flex min-w-0 flex-1 items-center gap-1.5 px-2",
          isMac && "pl-[72px]",
          isWin && "pr-[140px]"
        )}
      >
        <div className="flex min-w-0 shrink-0 items-center gap-1.5" style={NO_DRAG}>
          <img
            src="/openbentt-logo.svg"
            alt="Openbentt"
            width={16}
            height={16}
            className="h-4 w-4 shrink-0 rounded-[3px]"
            draggable={false}
          />
          <DesktopTitleBarMenus />
        </div>
        <div className="min-w-2 flex-1" style={{ WebkitAppRegion: "drag" }} aria-hidden />
      </div>

      {chrome.frameless && (
        <div className="flex shrink-0 items-stretch" style={NO_DRAG}>
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
      <DesktopMenuNavigateBridge />
      <DesktopTitleBar />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
