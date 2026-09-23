import React, { useMemo } from "react";
import { useChat } from "@/context/ChatContext";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/**
 * Secondary execution inspector: conversation stays primary, execution
 * internals stay secondary. Right-side drawer with Activity / Files /
 * Commands / Runtime / Advanced tabs for the selected task.
 */
export const ExecutionInspector: React.FC = () => {
  const {
    executionDrawerTaskId,
    setExecutionDrawerTaskId,
    executionTasks,
    executionEvents,
    cancelExecutionTask,
  } = useChat();

  const task = executionDrawerTaskId ? executionTasks[executionDrawerTaskId] : undefined;
  const events = executionDrawerTaskId ? (executionEvents[executionDrawerTaskId] ?? []) : [];
  const [tab, setTab] = React.useState<"activity" | "files" | "commands" | "runtime" | "advanced">("activity");

  const files = useMemo(
    () =>
      events
        .filter((e) => e.type === "agent.file.changed")
        .map((e) => String(e.payload.file ?? e.payload.target ?? "file")),
    [events]
  );
  const commands = useMemo(() => events.filter((e) => e.type.startsWith("agent.command")), [events]);

  if (!executionDrawerTaskId || !task) return null;

  const tabs = [
    { id: "activity", label: "Activity" },
    { id: "files", label: `Files${files.length ? ` (${files.length})` : ""}` },
    { id: "commands", label: `Commands${commands.length ? ` (${commands.length})` : ""}` },
    { id: "runtime", label: "Runtime" },
    { id: "advanced", label: "Advanced" },
  ] as const;

  return (
    <div
      className="fixed inset-y-0 right-0 z-[var(--z-drawer,60)] flex w-full max-w-md flex-col border-l border-border bg-background shadow-xl"
      role="complementary"
      aria-label="Execution inspector"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {task.title || `Task ${task.id.slice(0, 8)}`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Status: {task.status} · {task.inputSource === "voice" ? "voice" : "text"}
            {task.model ? ` · ${task.model}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="ml-auto rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setExecutionDrawerTaskId(null)}
          aria-label="Close execution inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 px-3 py-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium",
              tab === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "activity" && (
          <ol className="space-y-2">
            {events.map((e) => (
              <li key={e.eventId} className="flex gap-2 text-xs">
                <span className="shrink-0 text-muted-foreground">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span className="shrink-0 font-mono text-foreground">{e.type}</span>
                <span className="min-w-0 break-words text-muted-foreground">
                  {typeof e.payload.message === "string"
                    ? e.payload.message.slice(0, 300)
                    : typeof e.payload.file === "string"
                      ? e.payload.file
                      : ""}
                </span>
              </li>
            ))}
            {!events.length && (
              <li className="text-xs text-muted-foreground">No activity yet.</li>
            )}
          </ol>
        )}
        {tab === "files" && (
          <div>
            {files.length === 0 && (
              <p className="text-xs text-muted-foreground">No files changed yet.</p>
            )}
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={i} className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 font-mono text-[11px]">
                  {f}
                </li>
              ))}
            </ul>
            {files.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Changed {files.length} file{files.length === 1 ? "" : "s"}. Expand diffs in your editor.
              </p>
            )}
          </div>
        )}
        {tab === "commands" && (
          <div>
            {commands.length === 0 && (
              <p className="text-xs text-muted-foreground">No commands run yet.</p>
            )}
            <ol className="space-y-2">
              {commands.map((e) => (
                <li key={e.eventId} className="rounded border border-border/60 bg-muted/20 p-2">
                  <p className="font-mono text-[11px] text-foreground">{e.type}</p>
                  <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                    {typeof e.payload.message === "string" ? e.payload.message.slice(0, 500) : JSON.stringify(e.payload).slice(0, 500)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
        {tab === "runtime" && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <dt className="text-muted-foreground">Engine</dt>
            <dd className="text-foreground">OpenCode</dd>
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="break-all font-mono text-[11px] text-foreground">{task.workspace.rootPath}</dd>
            <dt className="text-muted-foreground">Session</dt>
            <dd className="break-all font-mono text-[11px] text-foreground">{task.sessionId ?? "—"}</dd>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="text-foreground">{task.model ?? "auto"}</dd>
            <dt className="text-muted-foreground">Provider</dt>
            <dd className="text-foreground">{task.provider ?? "—"}</dd>
            <dt className="text-muted-foreground">Mode</dt>
            <dd className="text-foreground">{task.mode ?? "build"}</dd>
          </dl>
        )}
        {tab === "advanced" && (
          <pre className="max-h-full overflow-auto rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">
            {JSON.stringify({ task, eventCount: events.length }, null, 2)}
          </pre>
        )}
      </div>

      {["RUNNING", "WAITING_FOR_PERMISSION", "STARTING", "QUEUED"].includes(task.status) && (
        <div className="shrink-0 border-t border-border/60 p-3">
          <button
            type="button"
            className="w-full rounded border px-3 py-1.5 text-xs hover:bg-muted"
            onClick={() => void cancelExecutionTask(task.id)}
          >
            Cancel task
          </button>
        </div>
      )}
    </div>
  );
};
