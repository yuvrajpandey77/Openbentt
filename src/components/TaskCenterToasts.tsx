import React from "react";
import { X, Loader2, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { useTaskCenter, type Task } from "@/context/TaskCenterContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/** Phase 9 — one global status surface for all background work (real state only). */
function TaskCard({ task }: { task: Task }) {
  const { removeTask } = useTaskCenter();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto w-[min(92vw,22rem)] rounded-xl border border-border bg-card p-3 shadow-lg"
    >
      <div className="flex items-start gap-2">
        {task.state === "running" && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />}
        {task.state === "done" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />}
        {task.state === "failed" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
        {task.state === "cancelled" && <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
          {task.detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{task.detail}</p>}
          {task.state === "running" && task.percent != null && (
            <div className="mt-2 flex items-center gap-2">
              <Progress value={task.percent} className="h-1.5 flex-1" aria-label={`${task.percent}%`} />
              <span className="text-[11px] tabular-nums text-muted-foreground">{task.percent}%</span>
            </div>
          )}
          {task.state === "running" && task.percent == null && (
            <p className="mt-1 text-[11px] text-muted-foreground">Working in background…</p>
          )}
          {(task.state === "failed" || task.state === "cancelled" || task.state === "done") && (
            <div className="mt-2 flex items-center gap-1.5">
              {task.onRetry && task.state === "failed" && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={task.onRetry}>
                  <RotateCcw size={12} /> Retry
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => removeTask(task.id)}>
                Dismiss
              </Button>
            </div>
          )}
        </div>
        {task.state === "running" && (
          <div className="flex shrink-0 items-center gap-1">
            {task.onCancel && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={task.onCancel}
              >
                Cancel
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className={cn("h-7 w-7")}
              onClick={() => removeTask(task.id)}
              aria-label="Hide status"
            >
              <X size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export const TaskCenterToasts: React.FC = () => {
  const { tasks } = useTaskCenter();
  const visible = tasks.slice(-4);
  if (visible.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex flex-col items-end gap-2">
      {visible.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
    </div>
  );
};
