import { useLocation } from "react-router-dom";
import { AppSettingsDialog, AppSettingsDockButton } from "@/components/AppSettingsDialog";
import { NotebookPaneSettingsDock } from "@/components/notebook/NotebookPaneSettingsDock";

/** Fixed bottom-left stack on non-notebook routes; notebook studio uses sidebar footer instead. */
export function GlobalBottomLeftDock() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/notebook")) return null;

  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-[60] flex flex-col items-start gap-2">
      <AppSettingsDialog trigger={<AppSettingsDockButton />} tooltip="Settings" tooltipSide="right" />
      <NotebookPaneSettingsDock embedded />
    </div>
  );
}
