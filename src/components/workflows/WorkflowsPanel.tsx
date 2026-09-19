/**
 * Phase 8 — Workflows: list, create (trigger + tool steps), runs, history.
 * Triggers are real only: manual, schedule, sync_completed. Tool steps that
 * need confirmation suspend as awaiting_approval — nothing executes silently.
 */
import { useCallback, useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { workflowApi, type WorkflowRunView, type WorkflowView } from "@/lib/workflows/workflowApi";

const TOOL_CHOICES = [
  "connector.unified_search",
  "knowledge.search",
  "gmail.create_draft",
  "calendar.create_event",
  "slack.send_message",
  "github.create_issue",
  "notion.create_page",
];

const SYNC_SOURCES = ["google-drive", "gmail", "google-calendar", "slack", "github", "notion"];

export function WorkflowsPanel() {
  const [workflows, setWorkflows] = useState<WorkflowView[] | null>(null);
  const [runs, setRuns] = useState<WorkflowRunView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [triggerKind, setTriggerKind] = useState<"manual" | "schedule" | "sync_completed">("manual");
  const [interval, setInterval] = useState(60);
  const [syncSource, setSyncSource] = useState("gmail");
  const [toolId, setToolId] = useState(TOOL_CHOICES[0]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [w, r] = await Promise.all([workflowApi.list(), workflowApi.runs({ limit: 20 })]);
      setWorkflows(w);
      setRuns(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workflows");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    try {
      const trigger: Record<string, unknown> =
        triggerKind === "schedule"
          ? { kind: "schedule", intervalMinutes: Math.min(1440, Math.max(5, Math.floor(interval) || 60)) }
          : triggerKind === "sync_completed"
            ? { kind: "sync_completed", connectorId: syncSource }
            : { kind: "manual" };
      await workflowApi.create({
        name: name.trim(),
        description: "",
        trigger,
        steps: [{ kind: "tool_call", toolId, input: {} }],
        enabled: true,
      });
      setName("");
      setCreating(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && workflows === null) return <p className="text-sm text-destructive">{error}</p>;
  if (workflows === null) return <p className="text-sm text-muted-foreground">Loading workflows…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Trigger → condition → tool → approval → action → audit. Approval-gated tools suspend for your decision.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        {!creating ? (
          <Button size="sm" onClick={() => setCreating(true)}>New workflow</Button>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">New workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Input placeholder="Name (e.g. Triage new mail)" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-md border bg-background px-2 py-1.5"
                  value={triggerKind}
                  onChange={(e) => setTriggerKind(e.target.value as typeof triggerKind)}
                >
                  <option value="manual">Manual</option>
                  <option value="schedule">Schedule</option>
                  <option value="sync_completed">On sync completed</option>
                </select>
                {triggerKind === "schedule" && (
                  <Input
                    type="number" min={5} max={1440} value={interval}
                    onChange={(e) => setInterval(Number(e.target.value))} className="w-28"
                  />
                )}
                {triggerKind === "sync_completed" && (
                  <select
                    className="rounded-md border bg-background px-2 py-1.5"
                    value={syncSource} onChange={(e) => setSyncSource(e.target.value)}
                  >
                    {SYNC_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                <select
                  className="rounded-md border bg-background px-2 py-1.5"
                  value={toolId} onChange={(e) => setToolId(e.target.value)}
                >
                  {TOOL_CHOICES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
                <Button size="sm" disabled={busy} onClick={() => void create()}>Create</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      {workflows.map((w) => (
        <Card key={w.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <span>{w.name}</span>
              <Badge variant="outline">{String((w.trigger as { kind?: string }).kind ?? "manual")}</Badge>
              {!w.enabled && <Badge variant="secondary">Disabled</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {w.steps.length} step{w.steps.length === 1 ? "" : "s"} · Updated {new Date(w.updatedAt).toLocaleString()}
            </span>
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => workflowApi.update(w.id, { enabled: !w.enabled }))}>
                {w.enabled ? "Disable" : "Enable"}
              </Button>
              <Button size="sm" disabled={busy} className="gap-1" onClick={() => void act(() => workflowApi.start(w.id))}>
                <Play className="h-3.5 w-3.5" /> Run now
              </Button>
            </span>
          </CardContent>
        </Card>
      ))}
      {runs.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Execution history</h4>
          {runs.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "outline"}>
                {r.status}
              </Badge>
              <span className="text-muted-foreground">
                {r.triggerKind} · step {r.currentStep} · {new Date(r.createdAt).toLocaleString()}
              </span>
              {r.error && <span className="text-xs text-destructive">{r.error.slice(0, 160)}</span>}
              {r.status === "awaiting_approval" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => workflowApi.resume(r.id))}>
                  Resume
                </Button>
              )}
              {(r.status === "running" || r.status === "awaiting_approval") && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => workflowApi.cancel(r.id))}>
                  Cancel
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
