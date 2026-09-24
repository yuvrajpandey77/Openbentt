import React from "react";
import { Cpu, Loader2, AlertTriangle, Download } from "lucide-react";
import { useLocalAI } from "@/context/LocalAIContext";
import { friendlyModelLabel } from "@/lib/ollama/selection";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Phase 9 — compact local-AI status (sidebar + header use).
 * Shows REAL Ollama state: checking / ready / no-models / unavailable.
 * Now uses the unified effectiveModel which reflects the actual active model.
 */
export const LocalAIStatus: React.FC<{ compact?: boolean; onOpen?: () => void }> = ({
  compact,
  onOpen,
}) => {
  const { health, effectiveModel, checking, error, activePulls } = useLocalAI();
  const pulls = Object.values(activePulls);
  const downloading = pulls.length > 0 ? pulls[0] : null;

  const dot =
    effectiveModel?.available
      ? "bg-green-500"
      : health === "checking"
        ? "bg-amber-400"
        : health === "no-models"
          ? "bg-amber-400"
          : "bg-red-500";

  const label =
    downloading && downloading.percent != null
      ? `Downloading ${friendlyModelLabel(downloading.model)} ${downloading.percent}%`
      : effectiveModel
        ? friendlyModelLabel(effectiveModel.modelId || "")
        : health === "checking" || checking
          ? "Checking local AI…"
          : health === "no-models"
            ? "No local model"
            : health === "unsupported"
              ? "Desktop only"
              : error ?? "Ollama unavailable";

  const icon =
    checking && !downloading ? (
      <Loader2 size={14} className="animate-spin" />
    ) : downloading ? (
      <Download size={14} />
    ) : health !== "ready" ? (
      <AlertTriangle size={14} />
    ) : (
      <Cpu size={14} />
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/60"
          aria-label={`Local AI: ${label}`}
        >
          <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
          {!compact && (
            <>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{label}</span>
              {icon}
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        Local AI: {label}
      </TooltipContent>
    </Tooltip>
  );
};
