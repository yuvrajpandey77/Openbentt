import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocalModelsOptional } from "@/context/LocalModelContext";
import { cn } from "@/lib/utils";
import { CloudOff, HardDrive, Wifi, WifiOff } from "lucide-react";

/** Compact connectivity + configured model status for the app chrome. */
export function LocalModelStatusBar({ className }: { className?: string }) {
  const lm = useLocalModelsOptional();
  if (!lm) return null;

  const { connectivity, connectivityLabel, configuredAvailability, snapshot, loading } = lm;
  const avail = configuredAvailability?.state;
  const availMsg = configuredAvailability?.message ?? "";

  const connIcon =
    connectivity === "online" ? (
      <Wifi className="h-3 w-3" aria-hidden />
    ) : (
      <CloudOff className="h-3 w-3" aria-hidden />
    );

  const modelVariant =
    avail === "ready" || avail === "downloadable"
      ? "secondary"
      : avail === "blocked_offline"
        ? "outline"
        : "destructive";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-[10px]", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 px-1.5 py-0 font-normal">
            {connIcon}
            {connectivityLabel}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {connectivity === "offline_first"
            ? "Local-only mode is on (Privacy). Cloud calls and external research are blocked."
            : connectivity === "offline"
              ? "No network. Cloud providers unavailable until reconnected."
              : "Network available. Cloud providers allowed unless offline-first is enabled."}
        </TooltipContent>
      </Tooltip>

      {snapshot && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 px-1.5 py-0 font-normal">
              <HardDrive className="h-3 w-3" aria-hidden />
              {snapshot.storage.formattedTotal} local
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {snapshot.registry.gguf.length} GGUF · {snapshot.registry.webgpu.length} on-device ·{" "}
            {snapshot.registry.ollama.length} Ollama
            {snapshot.storage.hasLowDiskWarning ? " · Low disk space" : ""}
          </TooltipContent>
        </Tooltip>
      )}

      {!loading && configuredAvailability && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={modelVariant} className="gap-1 px-1.5 py-0 font-normal">
              {avail === "ready" || avail === "downloadable" ? (
                <Wifi className="h-3 w-3" aria-hidden />
              ) : (
                <WifiOff className="h-3 w-3" aria-hidden />
              )}
              Model: {avail?.replace(/_/g, " ") ?? "unknown"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {availMsg}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
