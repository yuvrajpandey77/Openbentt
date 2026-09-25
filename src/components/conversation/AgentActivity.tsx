import React, { useState } from "react";
import { useChat } from "@/context/ChatContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getDesktopApi } from "@/lib/desktopApi";
import type { Message } from "@/types/chat";
import { deriveExecutionStatus, pendingPermission, pendingQuestion } from "@/lib/agent/executionView";
import type { OpenCodeQuestion } from "@/lib/agent/openCodeTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2, FolderOpen, FileCode, ExternalLink } from "lucide-react";

interface CompileResult {
  ok: boolean;
  pdf: string | null;
  pdfSize: number;
  errors: Array<{ file: string; line: number; message: string }>;
  warnings: string[];
}

/**
 * Reusable inline execution timeline for the unified conversation.
 * Renders thinking / tool activity / file changes / commands /
 * permission requests / test results / errors / completion natively
 * inside a conversation message. Advanced details stay expandable;
 * full internals live in the ExecutionInspector drawer.
 */

const STATUS_LABEL: Record<NonNullable<Message["executionStatus"]>, string> = {
  queued: "Queued",
  starting: "Starting…",
  running: "Working…",
  waiting_for_permission: "Waiting for permission",
  waiting_for_user: "Waiting for your input",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  crashed: "Crashed",
};

function stepIcon(step: string): string {
  if (step.includes("permission")) return "⚠";
  if (step.startsWith("computer.")) return "🖥";
  if (step.includes("verified")) return "✓";
  if (step.includes("compiler") || step.includes("latex")) return "▸";
  if (step.includes("research")) return "▸";
  if (step.includes("file.changed")) return "▸";
  if (step.includes("command")) return "▸";
  if (step.includes("completed")) return "✓";
  if (step.includes("failed") || step.includes("error")) return "✕";
  if (step.includes("cancelled")) return "■";
  if (step.includes("thinking")) return "◇";
  return "▸";
}

export const AgentActivity: React.FC<{ message: Message; compact?: boolean }> = ({
  message,
  compact,
}) => {
  const {
    executionEvents,
    executionTasks,
    respondToExecutionPermission,
    respondToExecutionQuestion,
    rejectExecutionQuestion,
    cancelExecutionTask,
    setExecutionDrawerTaskId,
    escalateAskToTask,
    dismissAskPermissions,
    queuePromptInComposer,
  } = useChat();
  const { workspace } = useWorkspace();
  const [showAll, setShowAll] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);

  const taskId = message.taskId;
  const status = message.executionStatus;
  const trace = message.agentTrace ?? [];
  const askPermissions = message.askPermissionRequests ?? [];
  if (!taskId && !status && trace.length === 0 && askPermissions.length === 0) return null;

  const events = taskId ? (executionEvents[taskId] ?? []) : [];
  const task = taskId ? executionTasks[taskId] : undefined;
  // Pending requests pair request↔reply events so answered history stays
  // visible without looking actionable.
  const pendingPerm = pendingPermission(events);
  const pendingQ = pendingQuestion(events);

  const approvalId =
    pendingPerm && typeof pendingPerm.approvalId === "string"
      ? String(pendingPerm.approvalId)
      : null;
  const questionRequestId =
    pendingQ && typeof pendingQ.serverRequestId === "string"
      ? String(pendingQ.serverRequestId)
      : null;
  const questions: OpenCodeQuestion[] = Array.isArray(pendingQ?.questions)
    ? (pendingQ.questions as OpenCodeQuestion[])
    : [];

  // Live headline: what is OpenCode doing right now?
  const snapshot = task ? deriveExecutionStatus(task, events) : null;

const visible = showAll ? trace : trace.slice(-6);
  const isTerminalStatus = status === "completed" || status === "failed" || status === "cancelled";
  const active = !isTerminalStatus && (status === "running" || status === "starting" || status === "queued");

  return (
    <div
      className={cn(
        "mt-2 rounded-lg border border-border/60 bg-muted/20",
        compact ? "p-2" : "p-3"
      )}
      aria-label="Agent activity"
    >
      <div className="flex items-center gap-2">
        {active && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        <span className="text-xs font-medium text-foreground">
          {isTerminalStatus
            ? STATUS_LABEL[status]
            : snapshot && (snapshot.status === "terminal_running" || snapshot.status === "tool_running" || snapshot.status === "editing" || snapshot.status === "thinking")
            ? snapshot.headline
            : status
            ? STATUS_LABEL[status]
            : askPermissions.length > 0
            ? "Needs your call"
            : "Activity"}
        </span>
        {task && (
          <span className="truncate text-[11px] text-muted-foreground">
            · {task.title || task.id.slice(0, 8)}
          </span>
        )}
        {task?.mode && (
          <span
            className="shrink-0 rounded-full border border-border/60 px-1.5 py-px text-[10px] text-muted-foreground"
            title={task.mode === "plan" ? "Read-only plan (default)" : "Build — writes ask for approval"}
          >
            {task.mode === "plan" ? "Plan" : "Build"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {taskId && (
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setExecutionDrawerTaskId(taskId)}
            >
              Details
            </button>
          )}
          {taskId && active && (
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => void cancelExecutionTask(taskId)}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {visible.length > 0 && (
        <ol className="mt-2 space-y-1" aria-label="Execution timeline">
          {visible.map((t, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0 select-none">{stepIcon(t.step)}</span>
              <span className="min-w-0 break-words">{t.detail}</span>
            </li>
          ))}
        </ol>
      )}

      {trace.length > 6 && (
        <button
          type="button"
          className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setShowAll((v) => !v)}
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", showAll && "rotate-180")} />
          {showAll ? "Show less" : `Show all ${trace.length} steps`}
        </button>
      )}

      {/* Open created files/folders directly from the chat. */}
      {taskId && (() => {
        const fileEvents = (executionEvents[taskId] ?? []).filter(
          (e) => e.type === "agent.file.changed" && e.payload?.path
        );
        const filePaths = fileEvents.map((e) => String(e.payload.path));
        if (!filePaths.length) return null;
        const api = getDesktopApi();
        return (
          <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-2">
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Created files</p>
            <div className="flex flex-wrap gap-1.5">
              {filePaths.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    if (api?.openPath) void api.openPath(p);
                  }}
                >
                  <FileCode size={12} />
                  <span className="truncate max-w-[200px]">{p}</span>
                </button>
              ))}
              <button
                type="button"
                className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  const dir = filePaths[0]?.split("/").slice(0, -1).join("/");
                  if (dir && api?.openPath) void api.openPath(dir);
                }}
              >
                <FolderOpen size={12} />
                <span>Open folder</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Real LaTeX compile loop for latex workspaces (verified artifact, never faked). */}
      {workspace?.latex && taskId && (
        <div className="mt-2 rounded-md border border-border/60 bg-background/60 p-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              LaTeX: {workspace.latex.mainTex} → {workspace.latex.buildDir}/
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-xs"
              disabled={compiling}
              onClick={() => {
                const api = getDesktopApi();
                if (!api?.latexCompile || !workspace.rootPath) return;
                setCompiling(true);
                setCompileResult(null);
                api
                  .latexCompile(workspace.rootPath)
                  .then((r) => setCompileResult(r))
                  .catch(() =>
                    setCompileResult({ ok: false, pdf: null, pdfSize: 0, errors: [{ file: "", line: 0, message: "Compile request failed." }], warnings: [] })
                  )
                  .finally(() => setCompiling(false));
              }}
            >
              {compiling ? "Compiling…" : "Compile"}
            </Button>
          </div>
          {compileResult && (
            <div className="mt-1.5 text-xs">
              {compileResult.ok ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ✓ {compileResult.pdf} ({Math.round(compileResult.pdfSize / 1024)} KB, verified on disk)
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px]"
                    onClick={() => {
                      const api = getDesktopApi();
                      if (api?.latexOpenPdf && workspace.rootPath && compileResult.pdf) {
                        void api.latexOpenPdf(workspace.rootPath, compileResult.pdf);
                      }
                    }}
                  >
                    View PDF
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="font-medium text-destructive">Build failed — {compileResult.errors.length} error(s)</p>
                  <ul className="mt-1 space-y-0.5">
                    {compileResult.errors.slice(0, 5).map((e, i) => (
                      <li key={i} className="break-words font-mono text-[11px] text-muted-foreground">
                        {e.file ? `${e.file}:${e.line} ` : ""}{e.message}
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-1.5 h-7 text-xs"
                    onClick={() =>
                      queuePromptInComposer(
                        `Fix these LaTeX diagnostics in ${workspace.latex?.mainTex}:\n` +
                          compileResult.errors.slice(0, 8).map((e) => `${e.file}:${e.line}: ${e.message}`).join("\n")
                      )
                    }
                  >
                    Send diagnostics to OpenCode
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {askPermissions.length > 0 && (
        <div
          role="dialog"
          aria-label="OpenCode question"
          className="mt-2 rounded-md border border-primary/40 bg-primary/5 p-2.5"
        >
          <p className="text-xs font-medium text-foreground">OpenCode is asking for a decision</p>
          <ul className="mt-1 space-y-0.5">
            {askPermissions.map((p, i) => (
              <li key={i} className="break-words font-mono text-[11px] text-muted-foreground">
                • {p}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Quick answers never auto-approve. Run it as a task and approve each step yourself.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={escalating}
              onClick={() => {
                setEscalating(true);
                void escalateAskToTask(message.id).finally(() => setEscalating(false));
              }}
            >
              {escalating ? "Starting…" : "Run as task"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => dismissAskPermissions(message.id)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {pendingPerm && (status === "waiting_for_permission" || status === "running") && taskId && (
        <div
          role="dialog"
          aria-label="Permission request"
          className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5"
        >
          <p className="text-xs font-medium text-foreground">Agent is requesting permission</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {String(pendingPerm.description ?? pendingPerm.serverAction ?? pendingPerm.capability ?? "")}
          </p>
          {pendingPerm.target != null &&
            String(pendingPerm.target) && (
              <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                Target: {String(pendingPerm.target)}
              </p>
            )}
          {pendingPerm.serverAction != null && String(pendingPerm.serverAction) && (
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              Engine action: {String(pendingPerm.serverAction)}
              {pendingPerm.risk != null && String(pendingPerm.risk) ? ` · risk ${String(pendingPerm.risk)}` : ""}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={!approvalId}
              onClick={() => approvalId && void respondToExecutionPermission(taskId, approvalId, "allow-once")}
            >
              Allow once
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!approvalId}
              title="Saves a rule with the engine — persists across sessions"
              onClick={() => approvalId && void respondToExecutionPermission(taskId, approvalId, "allow-task")}
            >
              Allow for task
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!approvalId}
              onClick={() => approvalId && void respondToExecutionPermission(taskId, approvalId, "deny")}
            >
              Deny
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Allow once approves this request only. Allow for task saves an engine rule that persists —
            manage saved rules in Setup → Execution. Nothing is ever auto-approved.
          </p>
        </div>
      )}

      {pendingQ && questionRequestId && taskId && (
        <QuestionCard
          taskId={taskId}
          requestId={questionRequestId}
          questions={questions}
          onAnswer={(answers) => void respondToExecutionQuestion(taskId, questionRequestId, answers)}
          onReject={() => void rejectExecutionQuestion(taskId, questionRequestId)}
        />
      )}
    </div>
  );
};

/**
 * First-class engine question UI. Execution is paused (WAITING_FOR_USER)
 * until an answer is submitted — the paused state is explicit, never shown
 * as still-executing.
 */
const QuestionCard: React.FC<{
  taskId: string;
  requestId: string;
  questions: OpenCodeQuestion[];
  onAnswer: (answers: string[][]) => void;
  onReject: () => void;
}> = ({ questions, onAnswer, onReject }) => {
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [busy, setBusy] = useState(false);

  if (!questions.length) return null;

  const toggle = (qi: number, label: string, multi: boolean) => {
    setSelected((prev) => {
      const cur = prev[qi] ?? [];
      if (multi) {
        return { ...prev, [qi]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] };
      }
      return { ...prev, [qi]: [label] };
    });
  };

  const ready = questions.every((_, qi) => (selected[qi] ?? []).length > 0);

  return (
    <div
      role="dialog"
      aria-label="Agent question"
      className="mt-2 rounded-md border border-primary/40 bg-primary/5 p-2.5"
    >
      <p className="text-xs font-medium text-foreground">
        Agent is waiting for your input
        <span className="ml-1.5 font-normal text-muted-foreground">· execution paused</span>
      </p>
      <div className="mt-2 space-y-2.5">
        {questions.map((q, qi) => (
          <fieldset key={qi}>
            <legend className="text-xs font-medium text-foreground">
              {q.header ? `${q.header}: ` : ""}{q.question || "Choose an option"}
            </legend>
            <div className="mt-1 flex flex-wrap gap-1.5" role={q.multi ? "group" : "radiogroup"} aria-label={q.header || `Question ${qi + 1}`}>
              {q.options.map((o) => {
                const on = (selected[qi] ?? []).includes(o.label);
                return (
                  <button
                    key={o.label}
                    type="button"
                    role={q.multi ? "checkbox" : "radio"}
                    aria-checked={on}
                    title={o.description}
                    disabled={busy}
                    onClick={() => toggle(qi, o.label, q.multi)}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                      on
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span className="font-medium">{o.label}</span>
                    {o.description && (
                      <span className="mt-0.5 block max-w-64 text-[11px] opacity-80">{o.description}</span>
                    )}
                  </button>
                );
              })}
              {!q.options.length && (
                <span className="text-[11px] text-muted-foreground">No options provided.</span>
              )}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          disabled={!ready || busy}
          onClick={() => {
            setBusy(true);
            try {
              onAnswer(questions.map((_, qi) => selected[qi] ?? []));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Sending…" : "Send answer"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={busy}
          onClick={onReject}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
};
