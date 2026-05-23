import { Alert, AlertDescription } from "@/components/ui/alert";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { MonitorOff } from "lucide-react";

/** Shown when Electron runs with software rendering (no GPU / safe mode). */
export function DesktopSafeModeBanner() {
  if (!isDesktopApp()) return null;
  if (!window.openbenttDesktop?.softwareRenderingMode) return null;

  return (
    <Alert className="mx-3 mt-2 rounded-md border-amber-500/40 bg-amber-500/10 py-2 text-xs">
      <MonitorOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="text-amber-950 dark:text-amber-100/90">
        Running in software rendering mode (GPU unavailable). Cloud models via OpenRouter work normally;
        on-device WebGPU is disabled. Set <code className="rounded bg-black/10 px-1">OPENBENTT_DISABLE_GPU=0</code> to
        force hardware acceleration if your drivers support it.
      </AlertDescription>
    </Alert>
  );
}
