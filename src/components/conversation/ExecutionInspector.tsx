import React, { useEffect, useMemo, useState } from "react";
import { useChat } from "@/context/ChatContext";
import { getDesktopApi } from "@/lib/desktopApi";
import { openCodeAgentApi, hasOpenCodeDesktopApi } from "@/lib/agent/openCodeAgentApi";
import type { OpenCodeServerState } from "@/lib/agent/openCodeTypes";
import {
  deriveExecutionStatus,
  selectChangeEvents,
  selectLogEvents,
  selectPermissionEvents,
  selectQuestionEvents,
  selectTerminalEvents,
  selectToolEvents,
} from "@/lib/agent/executionView";
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

/** Developer/debug mode: raw engine events, IDs, payloads, connection state. */
function useExecutionDebug(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem("openbentt.execDebug") === "1";
    } catch {
      return false;
    }
  });
  return [
    on,
    (v: boolean) => {
      setOn(v);
      try {
        if (v) localStorage.setItem("openbentt.execDebug", "1");
        else localStorage.removeItem("openbentt.execDebug");
      } catch { /* noop */ }
    },
  ];
}

type InspectorTab =
  | "activity" | "terminal" | "changes" | "files" | "diff" | "commands"
  | "computer" | "questions" | "permissions" | "logs" | "runtime" | "advanced" | "debug";

/**
 * Secondary execution inspector: conversation stays primary, execution
 * internals stay secondary. Right-side drawer with Activity / Terminal /
 * Changes / Files / Diff / Commands / Questions / Permissions / Logs /
 * Runtime / Debug tabs for the selected task. Tabs with nothing to show
 * stay hidden (except Activity); Debug appears only in debug mode.
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
  const taskEvents = executionDrawerTaskId ? executionEvents[executionDrawerTaskId] : undefined;
  const events = useMemo(() => taskEvents ?? [], [taskEvents]);
  const [tab, setTab] = React.useState<InspectorTab>("activity");
  const [diffs, setDiffs] = useState<FileDiff[] | null>(null);
  const [diffsLoading, setDiffsLoading] = useState(false);
  const [undoApproval, setUndoApproval] = useState<{ approvalId: string; files: string[] } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoDone, setUndoDone] = useState<string | null>(null);
  const [debug, setDebug] = useExecutionDebug();
  const [serverState, setServerState] = useState<OpenCodeServerState | null>(null);

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
    setServerState(null);
  }, [executionDrawerTaskId]);

  // Engine connection state for the Debug tab (best effort).
  useEffect(() => {
    if (tab !== "debug" || !hasOpenCodeDesktopApi()) return;
    let cancelled = false;
    openCodeAgentApi
      .serverStatus()
      .then((s) => {
        if (!cancelled) setServerState(s);
      })
      .catch(() => {
        if (!cancelled) setServerState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const files = useMemo(
    () =>
      events
        .filter((e) => e.type === "agent.file.changed")
        .map((e) => String(e.payload.file ?? e.payload.target ?? "file")),
    [events]
  );
  const commands = useMemo(() => events.filter((e) => e.type.startsWith("agent.command")), [events]);
  const computerEvents = useMemo(() => events.filter((e) => e.type.startsWith("computer.")), [events]);
  const terminalEvents = useMemo(() => selectTerminalEvents(events), [events]);
  const changeEvents = useMemo(() => selectChangeEvents(events), [events]);
  const questionEvents = useMemo(() => selectQuestionEvents(events), [events]);
  const permissionEvents = useMemo(() => selectPermissionEvents(events), [events]);
  const logEvents = useMemo(() => selectLogEvents(events), [events]);
  const toolEvents = useMemo(() => selectToolEvents(events), [events]);
  const snapshot = useMemo(
    () => (task ? deriveExecutionStatus(task, events) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task?.status, task?.waitingKind, events]
  );

  if (!executionDrawerTaskId || !task) return null;

  const pendingQuestions = questionEvents.filter((e) => e.type === "agent.question.requested").length;
  const pendingPermissions = permissionEvents.filter((e) => e.type === "agent.permission.requested").length;

  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: "activity", label: "Activity" },
    ...(terminalEvents.length ? [{ id: "terminal" as InspectorTab, label: `Terminal (${terminalEvents.length})` }] : []),
    ...(changeEvents.length ? [{ id: "changes" as InspectorTab, label: `Changes (${changeEvents.length})` }] : []),
    { id: "files", label: `Files${files.length ? ` (${files.length})` : ""}` },
    { id: "diff", label: "Diff" },
    { id: "commands", label: `Commands${commands.length ? ` (${commands.length})` : ""}` },
    ...(computerEvents.length ? [{ id: "computer" as InspectorTab, label: `Computer (${computerEvents.length})` }] : []),
    ...(questionEvents.length
      ? [{ id: "questions" as InspectorTab, label: `Questions${pendingQuestions ? ` (${pendingQuestions})` : ""}` }]
      : []),
    ...(permissionEvents.length
      ? [{ id: "permissions" as InspectorTab, label: `Permissions${pendingPermissions ? ` (${pendingPermissions})` : ""}` }]
      : []),
    ...(logEvents.length ? [{ id: "logs" as InspectorTab, label: `Logs (${logEvents.length})` }] : []),
    { id: "runtime", label: "Runtime" },
    { id: "advanced", label: "Advanced" },
    ...(debug ? [{ id: "debug" as InspectorTab, label: "Debug" }] : []),
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "activity";

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
            aria-selected={activeTab === t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium",
              activeTab === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {snapshot && (
          <div className="mb-3 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
            <p className="text-xs font-medium text-foreground">{snapshot.headline}</p>
            {snapshot.detail && (
              <p className="mt-0.5 break-words font-mono text-[11px] text-muted-foreground">{snapshot.detail}</p>
            )}
            {snapshot.lastError && snapshot.status !== "failed" && (
              <p className="mt-0.5 break-words text-[11px] text-amber-600 dark:text-amber-400">
                Last error: {snapshot.lastError.slice(0, 300)}
              </p>
            )}
          </div>
        )}
        {activeTab === "activity" && (
          <ol className="space-y-2">
            {toolEvents.length === 0 && events.length === 0 && (
              <li className="text-xs text-muted-foreground">No activity yet.</li>
            )}
            {(toolEvents.length ? toolEvents : events).map((e) => (
              <li key={e.eventId} className="flex gap-2 text-xs">
                <span className="shrink-0 text-muted-foreground">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span className="min-w-0 break-words text-muted-foreground">
                  {describeInspectorEvent(e)}
                </span>
              </li>
            ))}
          </ol>
        )}
        {activeTab === "terminal" && (
          <TerminalPanel events={terminalEvents} />
        )}
        {activeTab === "changes" && (
          <ChangesPanel events={changeEvents} />
        )}
        {activeTab === "questions" && (
          <ol className="space-y-2">
            {questionEvents.map((e) => (
              <li key={e.eventId} className="rounded border border-border/60 bg-muted/20 p-2">
                <p className="font-mono text-[11px] text-foreground">{e.type}</p>
                <div className="mt-1">
                  {renderQuestionPayload(e.payload)}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(e.timestamp).toLocaleTimeString()}
                  {typeof e.payload.serverRequestId === "string" ? ` · ${e.payload.serverRequestId}` : ""}
                </p>
              </li>
            ))}
            {!questionEvents.length && (
              <p className="text-xs text-muted-foreground">No questions asked.</p>
            )}
          </ol>
        )}
        {activeTab === "permissions" && (
          <ol className="space-y-2">
            {permissionEvents.map((e) => (
              <li key={e.eventId} className="rounded border border-border/60 bg-muted/20 p-2">
                <p className="font-mono text-[11px] text-foreground">{e.type}</p>
                <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                  {typeof e.payload.description === "string" ? e.payload.description.slice(0, 500) : ""}
                </p>
                {typeof e.payload.target === "string" && e.payload.target && (
                  <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                    Target: {String(e.payload.target).slice(0, 500)}
                  </p>
                )}
                {typeof e.payload.serverAction === "string" && e.payload.serverAction && (
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    Engine action: {String(e.payload.serverAction).slice(0, 200)}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </p>
              </li>
            ))}
            {!permissionEvents.length && (
              <p className="text-xs text-muted-foreground">No permission requests.</p>
            )}
          </ol>
        )}
        {activeTab === "logs" && (
          <ol className="space-y-2">
            {logEvents.map((e) => (
              <li key={e.eventId} className="rounded border border-destructive/40 bg-destructive/5 p-2">
                <p className="font-mono text-[11px] text-foreground">{e.type}</p>
                <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                  {typeof e.payload.message === "string" ? e.payload.message.slice(0, 800) : JSON.stringify(e.payload).slice(0, 800)}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </p>
              </li>
            ))}
            {!logEvents.length && (
              <p className="text-xs text-muted-foreground">No errors or warnings.</p>
            )}
          </ol>
        )}
        {activeTab === "files" && (
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
        {activeTab === "diff" && (
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
        {activeTab === "computer" && (
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
        {activeTab === "commands" && (
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
        {activeTab === "runtime" && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <dt className="text-muted-foreground">Engine</dt>
            <dd className="text-foreground">OpenCode</dd>
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="break-all font-mono text-[11px] text-foreground">{task.workspace.rootPath}</dd>
            <dt className="text-muted-foreground">Session</dt>
            <dd className="break-all font-mono text-[11px] text-foreground">{task.sessionId ?? "—"}</dd>
            <dt className="text-muted-foreground">Engine session</dt>
            <dd className="break-all font-mono text-[11px] text-foreground">{task.opencodeSessionId ?? "—"}</dd>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="text-foreground">{task.model ?? "auto"}</dd>
            <dt className="text-muted-foreground">Provider</dt>
            <dd className="text-foreground">{task.provider ?? "—"}</dd>
            <dt className="text-muted-foreground">Mode</dt>
            <dd className="text-foreground">{task.mode ?? "build"}</dd>
            {task.waitingKind && (
              <>
                <dt className="text-muted-foreground">Waiting for</dt>
                <dd className="text-foreground">{task.waitingKind === "question" ? "Your input" : "Permission"}</dd>
              </>
            )}
          </dl>
        )}
        {activeTab === "advanced" && (
          <div>
            <label className="mb-2 flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={debug}
                onChange={(e) => setDebug(e.target.checked)}
                className="h-3 w-3 rounded border-border bg-background text-primary focus:ring-primary"
              />
              <span>Debug mode (raw engine events, IDs, payloads, connection)</span>
            </label>
            <pre className="max-h-full overflow-auto rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">
              {JSON.stringify({ task, eventCount: events.length }, null, 2)}
            </pre>
          </div>
        )}
        {activeTab === "debug" && (
          <div>
            <div className="mb-2 rounded border border-border/60 bg-muted/20 p-2">
              <p className="text-[11px] font-medium text-foreground">Engine connection</p>
              <pre className="mt-1 overflow-auto font-mono text-[11px] text-muted-foreground">
                {serverState ? JSON.stringify(serverState, null, 2) : "Unavailable (bridge offline or still loading)."}
              </pre>
            </div>
            <ol className="space-y-1.5">
              {events.map((e) => (
                <li key={e.eventId}>
                  <details className="rounded border border-border/60 bg-muted/20 p-1.5">
                    <summary className="cursor-pointer font-mono text-[11px] text-foreground">
                      {e.type} <span className="text-muted-foreground">· {e.eventId}</span>
                    </summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-background p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                      {JSON.stringify({ timestamp: e.timestamp, sessionId: e.sessionId, payload: e.payload }, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ol>
          </div>
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

function describeInspectorEvent(e: { type: string; payload: Record<string, unknown> }): string {
  const p = e.payload ?? {};
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = p[k];
      if (typeof v === "string" && v) return v.slice(0, 300);
    }
    return "";
  };
  switch (e.type) {
    case "agent.tool.started":
      return `Run ${String(p.tool ?? "tool")} ${pick("command")}`.trim().slice(0, 300);
    case "agent.tool.completed":
    case "agent.tool.output":
    case "agent.command.output":
      return pick("message", "output").slice(0, 300);
    case "agent.tool.failed":
    case "agent.error":
      return `Error: ${pick("message").slice(0, 300)}`;
    case "agent.file.changed":
      return pick("file", "target", "path") || "File changed";
    case "agent.diff.updated": {
      const files = Array.isArray(p.files) ? p.files : [];
      return files.length ? `Changed ${files.length} file(s)` : "Changes updated";
    }
    case "agent.message.delta":
      return pick("delta").slice(0, 300);
    case "agent.todo.updated": {
      const todos = Array.isArray(p.todos) ? p.todos : [];
      return todos.length ? `${todos.length} planned task(s)` : "Plan updated";
    }
    case "agent.context.updated":
      return `Context: ${Number(p.input ?? 0) + Number(p.output ?? 0)} tokens`;
    default:
      return pick("message", "file", "command", "delta").slice(0, 300) || e.type;
  }
}

function renderQuestionPayload(payload: Record<string, unknown>): React.ReactNode {
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  if (!questions.length) return <p className="text-[11px] text-muted-foreground">No details.</p>;
  return (
    <div className="space-y-1.5">
      {questions.map((q, i) => {
        const qq = (q ?? {}) as Record<string, unknown>;
        const options = Array.isArray(qq.options) ? qq.options : [];
        return (
          <div key={i}>
            <p className="text-[11px] font-medium text-foreground">
              {typeof qq.header === "string" && qq.header ? `${qq.header}: ` : ""}
              {typeof qq.question === "string" ? qq.question.slice(0, 300) : ""}
            </p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {options.map((o, j) => {
                const oo = (o ?? {}) as Record<string, unknown>;
                return (
                  <span key={j} className="rounded border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {String(oo.label ?? "?").slice(0, 120)}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Live terminal surface: command, streaming output, exit code. Real engine data only. */
const TerminalPanel: React.FC<{ events: Array<{ eventId: string; type: string; timestamp: string; payload: Record<string, unknown> }> }> = ({ events }) => {
  const blocks = React.useMemo(() => {
    const out: Array<{ id: string; command?: string; output: string[]; exitCode?: number; done: boolean; at: string }> = [];
    let cur: { id: string; command?: string; output: string[]; exitCode?: number; done: boolean; at: string } | null = null;
    for (const e of events) {
      if (e.type === "agent.terminal.started" || e.type === "agent.command.requested") {
        if (cur) out.push(cur);
        cur = {
          id: e.eventId,
          command: typeof e.payload.command === "string" ? e.payload.command : undefined,
          output: [],
          done: false,
          at: e.timestamp,
        };
      } else if (e.type === "agent.terminal.output" || e.type === "agent.command.output") {
        const text =
          typeof e.payload.output === "string" ? e.payload.output : typeof e.payload.message === "string" ? e.payload.message : "";
        if (!cur) {
          cur = { id: e.eventId, output: [], done: false, at: e.timestamp };
        }
        if (text) cur.output.push(text.slice(0, 8000));
      } else if (e.type === "agent.terminal.completed") {
        if (!cur) {
          cur = { id: e.eventId, output: [], done: false, at: e.timestamp };
        }
        cur.done = true;
        if (typeof e.payload.exitCode === "number") cur.exitCode = e.payload.exitCode;
        if (!cur.command && typeof e.payload.command === "string") cur.command = e.payload.command;
        const tail = typeof e.payload.output === "string" && e.payload.output ? [e.payload.output.slice(0, 8000)] : [];
        cur.output.push(...tail);
        out.push(cur);
        cur = null;
      }
    }
    if (cur) out.push(cur);
    return out.slice(-20);
  }, [events]);

  if (!blocks.length) return <p className="text-xs text-muted-foreground">No terminal activity yet.</p>;
  return (
    <ol className="space-y-2">
      {blocks.map((b) => (
        <li key={b.id} className="overflow-hidden rounded-lg border border-border/60 bg-[#0d1117]">
          <div className="border-b border-white/10 bg-[#161b22] px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
            {b.command ? <span className="break-all text-foreground">$ {b.command.slice(0, 500)}</span> : "Terminal"}
            <span className="ml-2 text-[10px] opacity-60">{new Date(b.at).toLocaleTimeString()}</span>
            {b.done && typeof b.exitCode === "number" && (
              <span className={cn("ml-2 text-[10px]", b.exitCode === 0 ? "text-emerald-400" : "text-red-400")}>
                exit {b.exitCode}
              </span>
            )}
            {!b.done && <span className="ml-2 text-[10px] text-amber-400">running…</span>}
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {b.output.length ? b.output.join("\n").slice(-20000) : "Waiting for output…"}
          </pre>
        </li>
      ))}
    </ol>
  );
};

/** Engine-reported file changes with inline patches (from session.diff). */
const ChangesPanel: React.FC<{ events: Array<{ eventId: string; type: string; payload: Record<string, unknown> }> }> = ({ events }) => {
  const files = React.useMemo(() => {
    const map = new Map<string, { status: string; additions: number; deletions: number; patch?: string }>();
    for (const e of events) {
      if (e.type === "agent.diff.updated" && Array.isArray(e.payload.files)) {
        for (const f of e.payload.files as Array<Record<string, unknown>>) {
          const name = typeof f.file === "string" ? f.file : typeof f.path === "string" ? f.path : null;
          if (!name) continue;
          map.set(name, {
            status: typeof f.status === "string" ? f.status : "modified",
            additions: Number(f.additions ?? 0) || 0,
            deletions: Number(f.deletions ?? 0) || 0,
            patch: typeof f.patch === "string" ? f.patch : undefined,
          });
        }
      } else if (e.type === "agent.file.changed") {
        const name =
          typeof e.payload.file === "string" ? e.payload.file : typeof e.payload.target === "string" ? e.payload.target : null;
        if (name && !map.has(name)) map.set(name, { status: "modified", additions: 0, deletions: 0 });
      }
    }
    return [...map.entries()];
  }, [events]);

  if (!files.length) return <p className="text-xs text-muted-foreground">No file changes yet.</p>;
  return (
    <ul className="space-y-2">
      {files.map(([path, info]) => (
        <li key={path} className="rounded border border-border/60 bg-muted/20 p-2">
          <p className="font-mono text-[11px] text-foreground">
            <span className="mr-1.5 inline-block w-16 shrink-0 text-muted-foreground">{info.status}</span>
            {path}{" "}
            {(info.additions || info.deletions) && (
              <>
                <span className="text-emerald-600 dark:text-emerald-400">+{info.additions}</span>{" "}
                <span className="text-destructive">-{info.deletions}</span>
              </>
            )}
          </p>
          {info.patch && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                Review diff
              </summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono text-[10px] leading-relaxed">
                {info.patch.slice(0, 20000)}
              </pre>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
};
