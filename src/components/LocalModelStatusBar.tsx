import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocalAI } from "@/context/LocalAIContext";
import { cn } from "@/lib/utils";
import { CloudOff, HardDrive, Wifi, WifiOff } from "lucide-react";

/** Compact connectivity + effective model status for the app chrome. */
export function LocalModelStatusBar({ className }: { className?: string }) {
  const { effectiveModel, checking } = useLocalAI();
  if (!effectiveModel && checking) return null;
  if (!effectiveModel) return null;

  const avail = effectiveModel.available;
  const location = effectiveModel.location;
  const provider = effectiveModel.provider;
  const modelId = effectiveModel.modelId;
  const displayName = effectiveModel.displayName;

  const connIcon = location === "local" ? (
    <Wifi className="h-3 w-3" aria-hidden />
  ) : (
    <CloudOff className="h-3 w-3" aria-hidden />
  );

  const modelVariant = avail ? "secondary" : "destructive";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-[10px]", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 px-1.5 py-0 font-normal">
            {connIcon}
            {location === "local" ? "Local" : "Cloud"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {location === "local"
            ? "Local model active. Running on this device via Ollama."
            : "Cloud model active. Requests routed to remote provider."}
        </TooltipContent>
      </Tooltip>

      {!checking && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={modelVariant} className="gap-1 px-1.5 py-0 font-normal">
              {avail ? (
                <Wifi className="h-3 w-3" aria-hidden />
              ) : (
                <WifiOff className="h-3 w-3" aria-hidden />
              )}
              {displayName}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            Provider: {provider} · {location === "local" ? "Local" : "Cloud"} · {avail ? "Available" : "Unavailable"}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
