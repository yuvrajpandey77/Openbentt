import React, { useEffect, useState } from "react";
import { executionDisplayLabel, getExecutionRuntime } from "@/lib/agent/executionRuntime";
import { hasOpenCodeDesktopApi, openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { cn } from "@/lib/utils";

/**
 * Subtle runtime indicator for the composer/header: which execution
 * engine acts when a task needs action. Default is OpenCode; the user
 * sees it but never has to configure it. Model/provider selection is
 * a separate concept and lives elsewhere.
 */
export const ExecutionBadge: React.FC<{ className?: string }> = ({ className }) => {
  const [runtime] = useState(getExecutionRuntime);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopApp() || !hasOpenCodeDesktopApi()) return;
    let cancelled = false;
    openCodeAgentApi
      .getRuntimeStatus()
      .then((s) => {
        if (!cancelled) setStatus(s.opencode.status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = status === "READY";
  const dot = !isDesktopApp()
    ? "bg-muted-foreground"
    : status == null
      ? "bg-muted-foreground animate-pulse"
      : ready
        ? "bg-emerald-500"
        : "bg-amber-500";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground",
        className
      )}
      title={
        isDesktopApp()
          ? `Execution engine: ${executionDisplayLabel(runtime)}${status ? ` (${status})` : ""}. OpenCode runs underneath Openbentt when a task needs action.`
          : "Execution engine: OpenCode (available in the desktop app)"
      }
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      Execution: {executionDisplayLabel(runtime)}
    </span>
  );
};
