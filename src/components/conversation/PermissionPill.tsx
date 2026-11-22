import React, { useState, useEffect, useRef } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useChat } from "@/context/ChatContext";
import { pendingPermission, pendingQuestion } from "@/lib/agent/executionView";
import { cn } from "@/lib/utils";
import { useTimeout } from "@/hooks/use-timeout";

/**
 * Global approvals indicator — surfaces pending OpenCode permission requests
 * and questions anywhere in the UI. Uses a debounced check so it doesn't
 * re-render on every tiny event change.
 *
 * Usage:
 *  <PermissionPill />
 *
 * Features:
 * - Persistent pill in the header (add via AppChromeHeader)
 * - Keyboard accessible (Enter/Space to open drawer)
 * - Debounced check (250ms) to avoid flicker
 * - Shows count badge with hover detail
 * - Jumps to the active task drawer when clicked
 */
export const PermissionPill: React.FC = () => {
  const { executionTasks, executionEvents, setExecutionDrawerTaskId } = useChat();
  const [showDetails, setShowDetails] = useState(false);
  const [pending, setPending] = useState<Array<{ taskId: string; kind: "permission" | "question" }>>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced check for pending permissions/questions
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      const results: Array<{ taskId: string; kind: "permission" | "question" }> = [];
      for (const [taskId, events] of Object.entries(executionEvents)) {
        const task = executionTasks[taskId];
        if (!task || !["WAITING_FOR_PERMISSION", "RUNNING"].includes(task.status)) continue;
        if (pendingPermission(events)) results.push({ taskId, kind: "permission" });
        if (pendingQuestion(events)) results.push({ taskId, kind: "question" });
      }
      setPending(results);
    }, 250);
    return () => clearTimeout(timeoutRef.current);
  }, [executionEvents, executionTasks]);

  const count = pending.length;
  const first = pending[0];

  return (
    <div className="relative">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => {
                if (first) setExecutionDrawerTaskId(first.taskId);
                else setShowDetails((v) => !v);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-[11px] transition-colors",
                count > 0
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400"
                  : "border-muted-foreground/20 bg-muted/30 text-muted-foreground/80 hover:bg-muted/40 hover:text-muted-foreground"
              )}
              aria-expanded={showDetails}
              aria-label={count > 0 ? `${count} pending approvals — review` : "Approvals — manual review"}
              // Keyboard accessibility
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (first) setExecutionDrawerTaskId(first.taskId);
                  else setShowDetails((v) => !v);
                }
              }}
            >
              {count > 0 ? (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0 truncate font-medium">
                {count > 0 ? `Approvals · ${count}` : "Approvals · manual"}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-xs">
            <p className="text-xs text-muted-foreground">
              {count > 0
                ? "OpenCode is waiting for your decision — click to review."
                : "Every OpenCode action that needs approval waits for you. Nothing is auto-approved."}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {showDetails && count > 0 && (
        <div
          role="dialog"
          aria-label="OpenCode pending approvals"
          className="absolute left-0 bottom-full mb-1.5 z-50 w-80 rounded-lg border border-border bg-card p-3 shadow-lg animate-fade-in-up"
        >
          <div className="flex items-start gap-2">
            {pending.map((p, i) => (
              <div
                key={i}
                className="text-xs text-muted-foreground break-all"
              >
                <strong>{p.kind === "permission" ? "Permission" : "Question"}:</strong> {executionTasks[p.taskId]?.description ?? "OpenCode request"}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded border px-3 py-1.5 text-xs hover:bg-muted"
            onClick={() => setShowDetails(false)}
          >
            Close
          </button>
        </div>
      )}

      {showDetails && count === 0 && (
        <div className="absolute left-0 bottom-full mb-1.5 z-50 w-80 rounded-lg border border-border bg-card p-3 shadow-lg animate-fade-in-up">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm text-foreground">Manual approvals</h4>
              <p className="mt-1 text-[11px] text-muted-foreground">
                OpenCode asks before running commands, editing files, or accessing the network.
                Each request shows what it wants to do, the affected files, and the scope.
                Allow once, allow for the task, or deny — nothing runs without your decision.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded border px-3 py-1.5 text-xs hover:bg-muted"
            onClick={() => setShowDetails(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
