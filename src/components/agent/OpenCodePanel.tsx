import { useCallback, useEffect, useRef, useState } from "react";
import { openCodeAgentApi, hasOpenCodeDesktopApi } from "@/lib/agent/openCodeAgentApi";
import type { CombinedAgentStatus, OpenCodeAgentEvent, OpenCodeTask, RuntimeModel } from "@/lib/agent/openCodeTypes";
import { decideRoute } from "@/lib/agent/openCodeHarness";
import { VoiceControl } from "@/components/agent/VoiceControl";

/**
 * Phase 2 — OpenCode execution panel + local runtime (OmniRoute) status.
 * Structured state only (never terminal scraping). Collapsed when idle,
 * expanded while a task runs or waits for permission.
 */
export function OpenCodePanel({
  workspaceRoot,
  onWorkspaceRootChange,
}: {
  workspaceRoot: string;
  onWorkspaceRootChange: (v: string) => void;
}) {
  const available = hasOpenCodeDesktopApi();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"plan" | "build">("plan");
  const [task, setTask] = useState<OpenCodeTask | null>(null);
  const [events, setEvents] = useState<OpenCodeAgentEvent[]>([]);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [detection, setDetection] = useState<{ installed: boolean; version?: string } | null>(null);
  const [runtime, setRuntime] = useState<CombinedAgentStatus | null>(null);
  const [models, setModels] = useState<RuntimeModel[]>([]);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const eventsRef = useRef<OpenCodeAgentEvent[]>([]);
  eventsRef.current = events;

  const refreshRuntime = useCallback(async () => {
    try {
      const s = await openCodeAgentApi.getRuntimeStatus();
      setRuntime(s);
    } catch { /* degraded */ }
    try {
      const m = await openCodeAgentApi.getModels(false);
      setModels(m.models ?? []);
    } catch { /* no models */ }
  }, []);

  useEffect(() => {
    if (!available) return;
    openCodeAgentApi.detectOpenCode().then(setDetection).catch(() => setDetection(null));
    void refreshRuntime();
    return openCodeAgentApi.onEvent((evt) => {
      setEvents((prev) => {
        if (task && evt.taskId !== task.id) return prev;
        if (prev.some((e) => e.eventId === evt.eventId)) return prev;
        return [...prev.slice(-499), evt];
      });
      if (evt.type === "agent.permission.requested") setExpanded(true);
      if (evt.type === "agent.completed" || evt.type === "agent.failed" || evt.type === "agent.cancelled") {
        setStatus(evt.type === "agent.completed" ? "completed" : "ended");
      }
    });
  }, [available, task, refreshRuntime]);

  const refreshTask = useCallback(async (taskId: string) => {
    try {
      const res = await openCodeAgentApi.getTask(taskId);
      setTask(res.task);
      setEvents(res.events);
      setStatus(res.task.status.toLowerCase());
      if (["RUNNING", "WAITING_FOR_PERMISSION"].includes(res.task.status)) setExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "refresh failed");
    }
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    if (!prompt.trim()) {
      setError("Describe the task first.");
      return;
    }
    if (!workspaceRoot.trim()) {
      setError("Select a workspace directory first.");
      return;
    }
    const decision = decideRoute(prompt);
    if (!decision.routeToOpenCode) {
      setError(`Not routed to OpenCode (${decision.category}). ${decision.reason}`);
      return;
    }
    try {
      setStatus("starting");
      setExpanded(true);
      const created = await openCodeAgentApi.createTask({
        prompt: prompt.trim(),
        workspaceRoot: workspaceRoot.trim(),
        mode,
      });
      setTask(created);
      setEvents([]);
      const started = await openCodeAgentApi.startTask(created.id);
      setTask(started);
      setStatus(started.status.toLowerCase());
      void refreshTask(created.id);
    } catch (e) {
      setStatus("failed");
      setError(e instanceof Error ? e.message : "submit failed");
    }
  }, [prompt, workspaceRoot, mode, refreshTask]);

  const cancel = useCallback(async () => {
    if (!task) return;
    try {
      const t = await openCodeAgentApi.cancelTask(task.id);
      setTask(t);
      setStatus("cancelled");
    } catch (e) {
      setError(e instanceof Error ? e.message : "cancel failed");
    }
  }, [task]);

  const respond = useCallback(
    async (approvalId: string, decision: "allow-once" | "allow-task" | "deny") => {
      if (!task) return;
      try {
        const t = await openCodeAgentApi.respondToPermission({ taskId: task.id, approvalId, decision });
        setTask(t);
        setStatus(t.status.toLowerCase());
        void refreshTask(task.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "permission response failed");
      }
    },
    [task, refreshTask],
  );

  const ensureRuntime = useCallback(async () => {
    setRuntimeBusy(true);
    setError(null);
    try {
      await openCodeAgentApi.ensureRuntime();
      await refreshRuntime();
    } catch (e) {
      setError(e instanceof Error ? e.message : "runtime start failed");
    } finally {
      setRuntimeBusy(false);
    }
  }, [refreshRuntime]);

  const retryRuntime = useCallback(async () => {
    setRuntimeBusy(true);
    setError(null);
    try {
      await openCodeAgentApi.restartRuntime();
      await refreshRuntime();
    } catch (e) {
      setError(e instanceof Error ? e.message : "runtime retry failed");
    } finally {
      setRuntimeBusy(false);
    }
  }, [refreshRuntime]);

  if (!available) {
    return (
      <section aria-label="OpenCode agent (unavailable)" className="rounded-lg border p-3 text-sm opacity-80">
        <h3 className="font-semibold">Openbentt Agent</h3>
        <p className="mt-1 text-muted-foreground">Desktop execution is available in the Electron app.</p>
      </section>
    );
  }

  const pendingPermission = [...events].reverse().find((e) => e.type === "agent.permission.requested");

  const omni = runtime?.omniRoute;
  const code = runtime?.opencode;
  const omniLabel = !omni ? "Checking…" : omni.status === "READY" ? "Connected" : omni.status === "NOT_INSTALLED" ? "Not installed" : omni.status === "DEGRADED" ? "Degraded" : omni.status === "CRASHED" ? "Crashed" : omni.status.charAt(0) + omni.status.slice(1).toLowerCase();
  const codeLabel = !code ? (detection ? (detection.installed ? "Detected" : "Not installed") : "Checking…") : code.status === "READY" ? "Ready" : code.status === "DEGRADED" ? "Degraded" : code.status === "CRASHED" ? "Crashed" : code.status.charAt(0) + code.status.slice(1).toLowerCase();
  const currentModel = task?.model ?? models[0]?.id ?? "auto";
  const providerLabel = omni?.provider?.available ? `Free route · ${omni.provider.modelCount ?? 0} model(s)` : omni?.status === "READY" ? "No models reported" : "Unavailable";
  const gatewayDown = omni && ["CRASHED", "DEGRADED", "NOT_INSTALLED", "STOPPED"].includes(omni.status);

  return (
    <section aria-label="OpenCode agent execution" className="rounded-lg border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Openbentt Agent</h3>
          <p className="text-xs text-muted-foreground">
            Engine: OpenCode — {codeLabel} · Gateway: OmniRoute (local) · Model: {currentModel}
          </p>
        </div>
        <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="mt-2 grid gap-2">
        <VoiceControl workspaceRoot={workspaceRoot} onTaskCreated={(id) => refreshTask(id)} />
        <label className="grid gap-1 text-xs">
          Workspace (explicit, contained)
          <input
            value={workspaceRoot}
            onChange={(e) => onWorkspaceRootChange(e.target.value)}
            placeholder="/home/user/projects/foo"
            className="rounded border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="grid gap-1 text-xs">
          Task
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Inspect this project and fix the failing tests."
            rows={3}
            className="rounded border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <input type="radio" checked={mode === "plan"} onChange={() => setMode("plan")} /> Plan (read-only)
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={mode === "build"} onChange={() => setMode("build")} /> Build (confirm writes)
          </label>
          <span className="ml-auto">Status: <strong>{task?.status ?? status}</strong></span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={submit} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground">
            Run with OpenCode
          </button>
          {task && ["RUNNING", "WAITING_FOR_PERMISSION", "STARTING", "QUEUED"].includes(task.status) && (
            <button type="button" onClick={cancel} className="rounded border px-3 py-1.5 text-xs">
              Cancel
            </button>
          )}
          {task && (
            <button type="button" onClick={() => refreshTask(task.id)} className="rounded border px-3 py-1.5 text-xs">
              Refresh
            </button>
          )}
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>

      <div aria-label="Execution runtime" className="mt-3 rounded border p-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold">Execution Runtime</h4>
          <div className="flex gap-1">
            <button type="button" disabled={runtimeBusy} onClick={() => refreshRuntime()} className="rounded border px-2 py-0.5 text-[11px] disabled:opacity-50">
              Refresh
            </button>
            {gatewayDown ? (
              <button type="button" disabled={runtimeBusy} onClick={() => retryRuntime()} className="rounded border px-2 py-0.5 text-[11px] disabled:opacity-50">
                Retry
              </button>
            ) : (
              <button type="button" disabled={runtimeBusy} onClick={() => ensureRuntime()} className="rounded border px-2 py-0.5 text-[11px] disabled:opacity-50">
                Start
              </button>
            )}
          </div>
        </div>
        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-muted-foreground">OpenCode</dt>
          <dd>● {codeLabel}</dd>
          <dt className="text-muted-foreground">OmniRoute</dt>
          <dd>● {omniLabel}</dd>
          <dt className="text-muted-foreground">Model</dt>
          <dd className="truncate">{currentModel}</dd>
          <dt className="text-muted-foreground">Provider</dt>
          <dd className="truncate">{providerLabel}</dd>
          <dt className="text-muted-foreground">Gateway</dt>
          <dd>Local</dd>
          <dt className="text-muted-foreground">Endpoint</dt>
          <dd className="truncate font-mono">{omni?.baseUrl ?? "—"}</dd>
        </dl>
        {models.length > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Available models: {models.slice(0, 5).map((m) => m.id).join(", ")}{models.length > 5 ? ` (+${models.length - 5} more)` : ""}
          </p>
        )}
        {models.length > 0 && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">Limitations: provider limits may apply.</p>
        )}
        {gatewayDown && (
          <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
            AI execution is currently unavailable ({omniLabel.toLowerCase()}). Tasks run in degraded inspection mode and pause before any change.
          </p>
        )}
      </div>

      {expanded && (
        <div className="mt-3 border-t pt-2">
          {pendingPermission && task?.status === "WAITING_FOR_PERMISSION" && (
            <div role="dialog" aria-label="Permission request" className="rounded border border-amber-500/50 bg-amber-500/10 p-2">
              <p className="font-medium">OpenCode wants {String(pendingPermission.payload.capability ?? "access")}:</p>
              <p className="mt-1 text-xs">{String(pendingPermission.payload.description ?? "")}</p>
              <p className="mt-1 text-xs text-muted-foreground">Target: {String(pendingPermission.payload.target ?? "")}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground" onClick={() => respond(String(pendingPermission.payload.approvalId ?? ""), "allow-once")}>
                  Allow once
                </button>
                <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => respond(String(pendingPermission.payload.approvalId ?? ""), "allow-task")}>
                  Allow for task
                </button>
                <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => respond(String(pendingPermission.payload.approvalId ?? ""), "deny")}>
                  Deny
                </button>
              </div>
            </div>
          )}
          <ol className="mt-2 grid max-h-64 gap-1 overflow-auto" aria-label="Task timeline">
            {events.map((e) => (
              <li key={e.eventId} className="flex gap-2 text-xs">
                <span className="shrink-0 text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
                <span className="shrink-0 font-mono">{e.type}</span>
                <span className="truncate text-muted-foreground">
                  {typeof e.payload.message === "string" ? e.payload.message : typeof e.payload.file === "string" ? e.payload.file : ""}
                </span>
              </li>
            ))}
            {!events.length && <li className="text-xs text-muted-foreground">No activity yet — submit a task.</li>}
          </ol>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer">Advanced details</summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">
              {JSON.stringify({ task, eventCount: events.length, runtime, modelCount: models.length }, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}
