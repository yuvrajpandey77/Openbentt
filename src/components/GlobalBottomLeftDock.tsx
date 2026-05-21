import { AppSettingsDialog, AppSettingsDockButton } from "@/components/AppSettingsDialog";
import { NotebookPaneSettingsDock } from "@/components/notebook/NotebookPaneSettingsDock";

/** Fixed bottom-left stack: main Settings above notebook pane tweak (same position as before). */
export function GlobalBottomLeftDock() {
  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-[60] flex flex-col items-start gap-2">
      <AppSettingsDialog trigger={<AppSettingsDockButton />} tooltip="Settings" tooltipSide="right" />
      <NotebookPaneSettingsDock embedded />
    </div>
  );
}
