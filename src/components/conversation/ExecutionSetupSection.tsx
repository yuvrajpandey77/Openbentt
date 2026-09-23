import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasOpenCodeDesktopApi, openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";
import { executionDisplayLabel } from "@/lib/agent/executionRuntime";
import { AGENT_WORKSPACE_KEY, resolveExecutionWorkspace } from "@/context/ChatContext";
import { useWorkspaceFolderPicker } from "@/hooks/useWorkspaceFolderPicker";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, Loader2 } from "lucide-react";

/**
 * Deterministic first-run execution setup (never an AI conversation):
 * OpenCode → AI runtime (OmniRoute) → workspace → ready.
 * Auto-detects existing installations and uses them; never installs
 * another copy unnecessarily. No raw shell commands in the main flow.
 */

type RowState = "checking" | "ready" | "missing" | "error" | "unavailable";

function Dot({ state }: { state: RowState }) {
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        state === "ready" && "bg-emerald-500",
        state === "checking" && "animate-pulse bg-muted-foreground",
        (state === "missing" || state === "error") && "bg-amber-500",
        state === "unavailable" && "bg-muted-foreground"
      )}
    />
  );
}

export const ExecutionSetupSection: React.FC<{ onContinue: () => void }> = ({ onContinue }) => {
  const [code, setCode] = useState<{ state: RowState; detail: string }>({ state: "checking", detail: "Detecting…" });
  const [runtime, setRuntime] = useState<{ state: RowState; detail: string }>({ state: "checking", detail: "Detecting…" });
  const [busy, setBusy] = useState(false);
  const [workspace, setWorkspace] = useState(() => resolveExecutionWorkspace(null));
  const { pick, picking, supported } = useWorkspaceFolderPicker();

  const refresh = useCallback(async () => {
    if (!isDesktopApp() || !hasOpenCodeDesktopApi()) {
      setCode({ state: "unavailable", detail: "Desktop app only" });
      setRuntime({ state: "unavailable", detail: "Desktop app only" });
      return;
    }
    setCode((s) => ({ ...s, state: "checking", detail: "Detecting…" }));
    try {
      const d = await openCodeAgentApi.detectOpenCode();
      setCode(
        d.installed
          ? { state: "ready", detail: `Ready${d.version ? ` · v${d.version}` : ""}${d.source === "managed" ? " · managed by Openbentt" : ""}` }
          : { state: "missing", detail: "Not installed yet" }
      );
    } catch {
      setCode({ state: "error", detail: "Detection failed — retry below" });
    }
    setRuntime((s) => ({ ...s, state: "checking", detail: "Detecting…" }));
    try {
      const s = await openCodeAgentApi.getRuntimeStatus();
      const omni = s.omniRoute.status;
      setRuntime(
        omni === "READY"
          ? { state: "ready", detail: `Ready · ${s.omniRoute.baseUrl || "local gateway"}` }
          : omni === "NOT_INSTALLED"
            ? { state: "missing", detail: "Local runtime not set up" }
            : { state: "error", detail: `Status: ${omni}` }
      );
    } catch {
      setRuntime({ state: "error", detail: "Detection failed — retry below" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ensureRuntime = async () => {
    setBusy(true);
    try {
      await openCodeAgentApi.ensureRuntime();
    } catch {
      /* surfaced via refresh */
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const saveWorkspace = () => {
    try {
      if (workspace.trim()) localStorage.setItem(AGENT_WORKSPACE_KEY, workspace.trim());
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Let's get your local agent ready</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Openbentt performs coding and computer tasks through {executionDisplayLabel()} running underneath.
        </p>
        <ul className="mt-3 space-y-2.5">
          <li className="flex items-center gap-2 text-sm">
            <Dot state={code.state} />
            <span className="font-medium text-foreground">{executionDisplayLabel()}</span>
            <span className="text-xs text-muted-foreground">· {code.detail}</span>
          </li>
          <li className="flex items-center gap-2 text-sm">
            <Dot state={runtime.state} />
            <span className="font-medium text-foreground">AI runtime</span>
            <span className="text-xs text-muted-foreground">· {runtime.detail}</span>
          </li>
          <li className="flex items-center gap-2 text-sm">
            <Dot state={workspace.trim() ? "ready" : "missing"} />
            <span className="font-medium text-foreground">Workspace</span>
            <span className="text-xs text-muted-foreground">
              · {workspace.trim() || "choose a default folder below"}
            </span>
          </li>
        </ul>

        {code.state === "missing" && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
            <p className="font-medium text-foreground">OpenCode isn't installed yet</p>
            <p className="mt-0.5 text-muted-foreground">
              Openbentt needs OpenCode to perform coding and computer tasks. Install OpenCode, then
              come back and use “Check again”.
            </p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Check again
              </Button>
            </div>
          </div>
        )}
        {runtime.state !== "ready" && runtime.state !== "checking" && runtime.state !== "unavailable" && (
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
            <p className="font-medium text-foreground">AI runtime isn't ready</p>
            <p className="mt-0.5 text-muted-foreground">Start the local runtime to enable execution.</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void ensureRuntime()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Set up local runtime
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void refresh()}>
                Refresh
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="setup-workspace" className="text-sm font-medium">
          Default workspace folder
        </Label>
        <div className="flex gap-2">
          <Input
            id="setup-workspace"
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            onBlur={saveWorkspace}
            placeholder="/home/you/projects/my-app"
            className="font-mono text-xs"
          />
          {supported && (
            <Button
              type="button"
              variant="outline"
              disabled={picking}
              onClick={() =>
                void pick(workspace || undefined).then((p) => {
                  if (p) setWorkspace(p);
                })
              }
            >
              {picking ? "…" : "Browse…"}
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Execution tasks run inside this folder unless a project overrides it. You can change it any time.
        </p>
      </div>

      <Button
        className="w-full gap-2"
        onClick={() => {
          saveWorkspace();
          onContinue();
        }}
      >
        Continue <ArrowRight size={16} />
      </Button>
      <p className="flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
        <Check size={12} /> You can skip — anything missing is detected again automatically.
      </p>
    </div>
  );
};
