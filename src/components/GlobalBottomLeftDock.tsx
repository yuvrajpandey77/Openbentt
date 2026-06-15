import { useLocation } from "react-router-dom";
import { AppSettingsDialog, AppSettingsDockButton } from "@/components/AppSettingsDialog";
import { NotebookPaneSettingsDock } from "@/components/notebook/NotebookPaneSettingsDock";

/** Routes that use AppLayout sidebar (settings live in sidebar footer). */
const SIDEBAR_SHELL_ROUTES = ["/chat", "/labs", "/benchmark", "/webgpu", "/write"];

function usesSidebarShell(pathname: string): boolean {
  return SIDEBAR_SHELL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

/** Fixed bottom-left stack on routes without sidebar chrome; notebook studio uses its own footer. */
export function GlobalBottomLeftDock() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/notebook") || usesSidebarShell(pathname)) return null;

  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-[60] flex flex-col items-start gap-2">
      <AppSettingsDialog trigger={<AppSettingsDockButton />} tooltip="Settings" tooltipSide="right" />
      <NotebookPaneSettingsDock embedded />
    </div>
  );
}
