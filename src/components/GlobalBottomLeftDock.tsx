import { useLocation } from "react-router-dom";
import { AppSettingsDialog, AppSettingsDockButton } from "@/components/AppSettingsDialog";
import { NotebookPaneSettingsDock } from "@/components/notebook/NotebookPaneSettingsDock";

/** Any route inside AppLayout already has the sidebar. Do not float extra buttons. */
const SIDEBAR_ROUTES = [
  "/chat",
  "/projects",
  "/notebook",
  "/agent",
  "/files",
  "/tasks",
  "/documents",
  "/diagnostics",
  "/labs",
  "/settings",
  "/write",
  "/benchmark",
  "/webgpu",
];

function hasAppSidebar(pathname: string): boolean {
  return SIDEBAR_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/** Fixed bottom-left stack only on screens that have no sidebar (setup / welcome). */
export function GlobalBottomLeftDock() {
  const { pathname } = useLocation();
  if (hasAppSidebar(pathname)) return null;

  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-[60] flex flex-col items-start gap-2">
      <AppSettingsDialog trigger={<AppSettingsDockButton />} tooltip="Settings" tooltipSide="right" />
      <NotebookPaneSettingsDock embedded />
    </div>
  );
}
