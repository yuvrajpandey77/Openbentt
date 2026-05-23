import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { NotebookStudioSettingsProvider } from "@/context/NotebookStudioSettingsContext";
import { GlobalBottomLeftDock } from "@/components/GlobalBottomLeftDock";
import { DesktopSafeModeBanner } from "@/components/DesktopSafeModeBanner";

/** App chrome (projects, notebook, chat, setup) — Cursor default dark; marketing routes stay outside. */
export function AppShell() {
  useEffect(() => {
    document.documentElement.classList.add("app-shell-route");
    return () => document.documentElement.classList.remove("app-shell-route");
  }, []);

  return (
    <NotebookStudioSettingsProvider>
      <div className="app-shell dark flex h-full min-h-0 flex-col bg-background text-foreground">
        <DesktopSafeModeBanner />
        <Outlet />
        <GlobalBottomLeftDock />
      </div>
    </NotebookStudioSettingsProvider>
  );
}
