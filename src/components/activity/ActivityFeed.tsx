/**
 * Phase 8 — Tasks / Activity: agent runs, actions, approvals, failures,
 * syncs, workflows — everything traceable from the central audit ledger.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { toolApi } from "@/lib/tools/toolApi";
import { actionApi, type ActionExecution } from "@/lib/actions/actionApi";
import { workflowApi, type WorkflowRunView } from "@/lib/workflows/workflowApi";
import type { ToolAuditEvent } from "@/lib/tools/toolTypes";

export function ActivityFeed({ projectId }: { projectId?: string }) {
  const [events, setEvents] = useState<ToolAuditEvent[] | null>(null);
  const [executions, setExecutions] = useState<ActionExecution[]>([]);
  const [runs, setRuns] = useState<WorkflowRunView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [audit, execs, wf] = await Promise.all([
        toolApi.audit({ projectId, limit: 60 }),
        actionApi.executions({ projectId, limit: 20 }),
        workflowApi.runs({ limit: 10 }),
      ]);
      setEvents(audit);
      setExecutions(execs);
      setRuns(wf);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity");
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 20000);
    return () => clearInterval(t);
  }, [refresh]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (events === null) return <p className="text-sm text-muted-foreground">Loading activity…</p>;

  return (
    <div className="space-y-4">
      {executions.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Verified actions</h4>
          {executions.map((x) => (
            <div key={x.idempotencyKey} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge>{x.status}</Badge>
              <span>{x.toolId}</span>
              <span className="text-muted-foreground">
                {x.provider}
                {x.externalId ? ` · ${x.externalId.slice(0, 60)}` : ""} · {new Date(x.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </section>
      )}
      {runs.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Workflow runs</h4>
          {runs.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "outline"}>
                {r.status}
              </Badge>
              <span className="text-muted-foreground">
                {r.triggerKind} · step {r.currentStep} · {new Date(r.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </section>
      )}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Audit trail</h4>
        {events.length === 0 && <p className="text-sm text-muted-foreground">No audited events yet.</p>}
        {events.map((e) => (
          <div key={e.eventId} className="flex flex-wrap items-center gap-2 text-sm">
            <Badge
              variant={e.status === "ok" ? "default" : e.status === "confirm_required" ? "outline" : "destructive"}
            >
              {e.status}
            </Badge>
            <span>{e.toolId}</span>
            <span className="text-muted-foreground">
              {e.decision} · {e.source}
              {lifecycleOf(e) ? ` · ${lifecycleOf(e)}` : ""} · {new Date(e.timestamp).toLocaleString()}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

function lifecycleOf(e: ToolAuditEvent): string | undefined {
  const summary = e.resourceSummary as Record<string, unknown> | undefined;
  const lc = summary?.lifecycle;
  return typeof lc === "string" ? lc : undefined;
}
