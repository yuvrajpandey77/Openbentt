import { Outlet } from "react-router-dom";
import { NotebookStudioSettingsProvider } from "@/context/NotebookStudioSettingsContext";
import { NotebookPaneSettingsDock } from "@/components/notebook/NotebookPaneSettingsDock";

/** App chrome (projects, notebook, chat, setup) — Cursor default dark; marketing routes stay outside. */
export function AppShell() {
  return (
    <NotebookStudioSettingsProvider>
      <div className="app-shell dark min-h-screen bg-background text-foreground">
        <Outlet />
        <NotebookPaneSettingsDock />
      </div>
    </NotebookStudioSettingsProvider>
  );
}
