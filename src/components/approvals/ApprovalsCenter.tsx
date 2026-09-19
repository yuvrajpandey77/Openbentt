/**
 * Phase 8 — Approvals center: centralized pending-action queue.
 * Shows agent, provider, action, target, risk, created, expiry.
 * Approve / Reject / Inspect via trusted UI state.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionApi, type ActionApproval } from "@/lib/actions/actionApi";
import { ActionApprovalCard } from "@/components/actions/ActionApprovalCard";

export function ApprovalsCenter() {
  const [pending, setPending] = useState<ActionApproval[] | null>(null);
  const [history, setHistory] = useState<ActionApproval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [p, a] = await Promise.all([
        actionApi.list({ status: "proposed", limit: 50 }),
        actionApi.list({ limit: 20 }),
      ]);
      setPending(p);
      setHistory(a.filter((x) => x.status !== "proposed").slice(0, 10));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load approvals");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
  }, [refresh]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (pending === null) return <p className="text-sm text-muted-foreground">Loading approvals…</p>;

  const shown = filter === "pending" ? pending : [...pending, ...history];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {pending.length === 0
            ? "No pending actions. Proposed actions appear here for your decision."
            : `${pending.length} action${pending.length === 1 ? "" : "s"} waiting for your decision.`}
        </p>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant={filter === "pending" ? "default" : "outline"} onClick={() => setFilter("pending")}>
            Pending
          </Button>
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            Recent
          </Button>
        </div>
      </div>
      {shown.length === 0 && <Badge variant="outline">Empty</Badge>}
      {shown.map((a) => (
        <div key={a.id} className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {a.runId ? `Agent run ${a.runId.slice(0, 18)}… · ` : "Manual · "}
            Created {new Date(a.createdAt).toLocaleString()}
          </p>
          <ActionApprovalCard approval={a} onChanged={() => void refresh()} />
        </div>
      ))}
    </div>
  );
}
