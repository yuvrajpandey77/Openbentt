/**
 * Sticky bar above the composer when any agent task waits for permission/options.
 * Keeps approvals visible without digging into message history.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ShieldAlert, HelpCircle } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { pendingPermission, pendingQuestion } from "@/lib/agent/executionView";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const AgentAwaitingBar: React.FC = () => {
  const {
    executionTasks,
    executionEvents,
    respondToExecutionPermission,
    setExecutionDrawerTaskId,
  } = useChat();
  const [pending, setPending] = useState<
    Array<{ taskId: string; kind: "permission" | "question"; label: string; approvalId?: string }>
  >([]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const rows: typeof pending = [];
      for (const [taskId, events] of Object.entries(executionEvents)) {
        const task = executionTasks[taskId];
        if (!task || !["WAITING_FOR_PERMISSION", "RUNNING"].includes(task.status)) continue;
        const perm = pendingPermission(events);
        if (perm) {
          rows.push({
            taskId,
            kind: "permission",
            label: String(perm.description ?? perm.capability ?? task.description ?? "Permission"),
            approvalId: typeof perm.approvalId === "string" ? perm.approvalId : undefined,
          });
        }
        const q = pendingQuestion(events);
        if (q) {
          rows.push({
            taskId,
            kind: "question",
            label: String(
              (Array.isArray(q.questions) && (q.questions as Array<{ question?: string }>)[0]?.question) ||
                "Agent question"
            ),
          });
        }
      }
      setPending(rows);
    }, 200);
    return () => window.clearTimeout(t);
  }, [executionEvents, executionTasks]);

  const first = pending[0];
  const title = useMemo(() => {
    if (!first) return "";
    return first.kind === "permission" ? "Waiting for your approval" : "Waiting for your choice";
  }, [first]);

  if (!first) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 shadow-sm ring-1 ring-amber-500/20"
      )}
    >
      {first.kind === "permission" ? (
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      ) : (
        <HelpCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{first.label}</p>
      </div>
      {first.kind === "permission" && first.approvalId ? (
        <>
          <Button
            type="button"
            size="sm"
            className="h-7 cursor-pointer text-xs"
            onClick={() => void respondToExecutionPermission(first.taskId, first.approvalId!, "allow-once")}
          >
            Allow once
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 cursor-pointer text-xs"
            onClick={() => void respondToExecutionPermission(first.taskId, first.approvalId!, "deny")}
          >
            Deny
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 cursor-pointer text-xs"
        onClick={() => setExecutionDrawerTaskId(first.taskId)}
      >
        Open details
      </Button>
      {pending.length > 1 ? (
        <span className="text-[10px] text-muted-foreground">+{pending.length - 1} more</span>
      ) : null}
    </div>
  );
};
