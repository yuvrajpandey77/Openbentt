import React, { useState } from "react";
import { useChat } from "@/context/ChatContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getDesktopApi } from "@/lib/desktopApi";
import type { Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2 } from "lucide-react";

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
  const pendingPermission = [...events]
    .reverse()
    .find((e) => e.type === "agent.permission.requested");

  const approvalId =
    pendingPermission && typeof pendingPermission.payload.approvalId === "string"
      ? String(pendingPermission.payload.approvalId)
      : null;

  const visible = showAll ? trace : trace.slice(-6);
  const active = status === "running" || status === "starting" || status === "queued";

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
          {status ? STATUS_LABEL[status] : askPermissions.length > 0 ? "Needs your call" : "Activity"}
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

      {pendingPermission && status === "waiting_for_permission" && taskId && (
        <div
          role="dialog"
          aria-label="Permission request"
          className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5"
        >
          <p className="text-xs font-medium text-foreground">Agent is requesting permission</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {String(pendingPermission.payload.description ?? pendingPermission.payload.capability ?? "")}
          </p>
          {pendingPermission.payload.target != null &&
            String(pendingPermission.payload.target) && (
              <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                Target: {String(pendingPermission.payload.target)}
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
            Voice, models, and documents can never approve — only you, here.
          </p>
        </div>
      )}
    </div>
  );
};
