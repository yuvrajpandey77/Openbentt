import React from "react";
import { Progress } from "@/components/ui/progress";
import { formatBytes, formatEta, formatSpeed } from "@/lib/downloadProgress";
import type { DownloadProgressSnapshot } from "@/lib/downloadProgress";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModelDownloadProgressBarProps {
  title: string;
  hint?: string;
  progress: DownloadProgressSnapshot;
  className?: string;
  /** Shown when percent is known but bytes are not (browser WebGPU cache). */
  percentOnly?: boolean;
}

/** Shared download progress UI for GGUF (desktop) and on-device (WebGPU) models. */
export const ModelDownloadProgressBar: React.FC<ModelDownloadProgressBarProps> = ({
  title,
  hint,
  progress,
  className,
  percentOnly = false,
}) => {
  const pct = progress.percent ?? 0;
  const hasBytes =
    !percentOnly &&
    progress.received != null &&
    progress.total != null &&
    progress.total > 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2.5 space-y-2",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          {title}
        </span>
        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
      {hasBytes ? (
        <p className="text-[11px] leading-snug text-muted-foreground tabular-nums">
          {formatBytes(progress.received!)} / {formatBytes(progress.total!)}
          {progress.speedBps != null && progress.speedBps > 0 ? (
            <>
              {" · "}
              <span className="text-foreground/80">{formatSpeed(progress.speedBps)}</span>
            </>
          ) : null}
          {progress.etaSeconds != null ? (
            <>
              {" · "}
              {formatEta(progress.etaSeconds)}
            </>
          ) : null}
        </p>
      ) : null}
      {hint ? (
        <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
      ) : percentOnly ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Keep this window open until the download finishes. Speed varies with your connection.
        </p>
      ) : null}
    </div>
  );
};
