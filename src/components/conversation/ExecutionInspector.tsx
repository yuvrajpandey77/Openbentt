import React, { useEffect, useMemo, useState } from "react";
import { useChat } from "@/context/ChatContext";
import { getDesktopApi } from "@/lib/desktopApi";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface FileDiff {
  path: string;
  added: number;
  removed: number;
  binary: boolean;
  patch: string;
}

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
  const [tab, setTab] = React.useState<"activity" | "files" | "diff" | "commands" | "computer" | "runtime" | "advanced">("activity");
  const [diffs, setDiffs] = useState<FileDiff[] | null>(null);
  const [diffsLoading, setDiffsLoading] = useState(false);
  const [undoApproval, setUndoApproval] = useState<{ approvalId: string; files: string[] } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoDone, setUndoDone] = useState<string | null>(null);

  // Real diffs from filesystem snapshots (never fabricated from agent text).
  useEffect(() => {
    if (tab !== "diff" || !executionDrawerTaskId || diffs) return;
    const api = getDesktopApi();
    if (!api?.workspaceDiff) {
      setDiffs([]);
      return;
    }
    setDiffsLoading(true);
    api
      .workspaceDiff(executionDrawerTaskId)
      .then((d) => setDiffs(d))
      .catch(() => setDiffs([]))
      .finally(() => setDiffsLoading(false));
  }, [tab, executionDrawerTaskId, diffs]);

  useEffect(() => {
    setDiffs(null);
    setUndoApproval(null);
    setUndoDone(null);
  }, [executionDrawerTaskId]);

  const files = useMemo(
    () =>
      events
        .filter((e) => e.type === "agent.file.changed")
        .map((e) => String(e.payload.file ?? e.payload.target ?? "file")),
    [events]
  );
  const commands = useMemo(() => events.filter((e) => e.type.startsWith("agent.command")), [events]);
  const computerEvents = useMemo(() => events.filter((e) => e.type.startsWith("computer.")), [events]);

  if (!executionDrawerTaskId || !task) return null;

  const tabs = [
    { id: "activity", label: "Activity" },
    { id: "files", label: `Files${files.length ? ` (${files.length})` : ""}` },
    { id: "diff", label: "Diff" },
    { id: "commands", label: `Commands${commands.length ? ` (${commands.length})` : ""}` },
    { id: "computer", label: `Computer${computerEvents.length ? ` (${computerEvents.length})` : ""}` },
    { id: "runtime", label: "Runtime" },
    { id: "advanced", label: "Advanced" },
  ] as const;

  const requestUndo = async () => {
    const api = getDesktopApi();
    if (!api?.workspaceUndo || !executionDrawerTaskId) return;
    setUndoBusy(true);
    setUndoDone(null);
    try {
      const res = await api.workspaceUndo(executionDrawerTaskId);
      setUndoApproval({ approvalId: res.approvalId, files: res.files });
    } catch {
      setUndoDone("Undo unavailable (no snapshot for this task).");
    } finally {
      setUndoBusy(false);
    }
  };

  const confirmUndo = async (decision: "allow" | "deny") => {
    const api = getDesktopApi();
    if (!api?.workspaceUndoConfirm || !undoApproval) return;
    setUndoBusy(true);
    try {
      const res = await api.workspaceUndoConfirm(undoApproval.approvalId, decision);
      setUndoApproval(null);
      setDiffs(null);
      setUndoDone(
        res.status === "restored"
          ? `Restored ${res.restored?.length ?? 0} file(s) from the pre-task snapshot.`
          : "Undo rejected — files unchanged."
      );
    } catch {
      setUndoDone("Undo failed — files unchanged.");
    } finally {
      setUndoBusy(false);
    }
  };

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
        {tab === "diff" && (
          <div>
            {diffsLoading && <p className="text-xs text-muted-foreground">Computing real diffs…</p>}
            {!diffsLoading && (!diffs || diffs.length === 0) && (
              <p className="text-xs text-muted-foreground">No filesystem changes recorded for this task.</p>
            )}
            {diffs && diffs.length > 0 && (
              <>
                <ul className="space-y-2">
                  {diffs.map((d) => (
                    <li key={d.path} className="rounded border border-border/60 bg-muted/20 p-2">
                      <p className="font-mono text-[11px] text-foreground">
                        {d.path}{" "}
                        <span className="text-emerald-600 dark:text-emerald-400">+{d.added}</span>{" "}
                        <span className="text-destructive">-{d.removed}</span>
                        {d.binary && <span className="text-muted-foreground"> (binary)</span>}
                      </p>
                      {d.patch && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                            Review patch
                          </summary>
                          <pre className="mt-1 max-h-64 overflow-auto rounded bg-background p-2 font-mono text-[10px] leading-relaxed">
                            {d.patch}
                          </pre>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
                {!undoApproval && !undoDone && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    disabled={undoBusy}
                    onClick={() => void requestUndo()}
                  >
                    {undoBusy ? "Preparing…" : "Undo changes"}
                  </Button>
                )}
                {undoApproval && (
                  <div role="dialog" aria-label="Confirm undo" className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5">
                    <p className="text-xs font-medium text-foreground">
                      Restore {undoApproval.files.length} file(s) to the pre-task snapshot?
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      This is destructive and requires your explicit approval.
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <Button type="button" size="sm" className="h-7 text-xs" disabled={undoBusy} onClick={() => void confirmUndo("allow")}>
                        Allow restore
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={undoBusy} onClick={() => void confirmUndo("deny")}>
                        Deny
                      </Button>
                    </div>
                  </div>
                )}
                {undoDone && <p className="mt-2 text-xs text-muted-foreground">{undoDone}</p>}
              </>
            )}
          </div>
        )}
        {tab === "computer" && (
          <div>
            {computerEvents.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No computer-use activity. Screenshots, clicks, and app actions appear here with verification.
              </p>
            )}
            <ol className="space-y-2">
              {computerEvents.map((e) => (
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
