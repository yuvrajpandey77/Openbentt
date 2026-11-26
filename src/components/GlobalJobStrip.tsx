import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { useTaskCenter, type Task } from "@/context/TaskCenterContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KIND_ROUTE: Record<string, string> = {
  compile: "/notebook?mode=editor",
  "paper-run": "/notebook?mode=orchestra",
  "paper-install": "/notebook?mode=orchestra",
  agent: "/chat",
  "model-download": "/settings",
  "ollama-setup": "/settings",
  sync: "/notebook",
  export: "/documents",
  processing: "/notebook",
};

const DONE_VISIBLE_MS = 7000;

function JobChip({ task }: { task: Task }) {
  const navigate = useNavigate();
  const { removeTask } = useTaskCenter();
  const route = KIND_ROUTE[task.kind] ?? "/chat";

  return (
    <div
      className={cn(
        "flex max-w-[16rem] items-center gap-1.5 rounded-full border border-border/70 bg-card/95 px-2.5 py-1 text-xs shadow-sm",
        task.state === "failed" && "border-destructive/40",
        task.state === "done" && "border-emerald-500/40"
      )}
    >
      {task.state === "running" ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" aria-hidden />
      ) : null}
      <button
        type="button"
        className="min-w-0 truncate text-left hover:underline"
        onClick={() => {
          task.onOpen?.();
          navigate(route);
        }}
        title={task.detail ?? task.title}
      >
        <span className="font-medium text-foreground">{task.title}</span>
        {task.detail ? (
          <span className="ml-1 text-muted-foreground">· {task.detail}</span>
        ) : null}
      </button>
      {task.state === "running" && task.onCancel ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-5 w-5 shrink-0"
          aria-label={`Cancel ${task.title}`}
          onClick={() => task.onCancel?.()}
        >
          <X className="h-3 w-3" />
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-5 w-5 shrink-0"
          aria-label="Dismiss"
          onClick={() => removeTask(task.id)}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

/** Sticky strip: compile / Paper / agent jobs stay visible across route changes. */
export function GlobalJobStrip() {
  const { tasks, removeTask } = useTaskCenter();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-drop done chips after a short celebration window.
  useEffect(() => {
    for (const t of tasks) {
      if (t.state !== "done") continue;
      if (now - t.updatedAt >= DONE_VISIBLE_MS) removeTask(t.id);
    }
  }, [tasks, now, removeTask]);

  const visible = useMemo(
    () =>
      tasks
        .filter((t) => {
          if (t.state === "running" || t.state === "failed") return true;
          if (t.state === "done" && now - t.updatedAt < DONE_VISIBLE_MS) return true;
          return false;
        })
        .slice(-6),
    [tasks, now]
  );

  if (visible.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-3 left-1/2 z-[85] flex max-w-[min(96vw,42rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5"
    >
      {visible.map((t) => (
        <JobChip key={t.id} task={t} />
      ))}
    </div>
  );
}
