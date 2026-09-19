/**
 * Phase 8 — Agent-run approvals inline in chat.
 * When the agent suspends on a controlled action, the executor auto-proposes
 * a fingerprint-bound approval (runId attached). This component surfaces the
 * exact preview in chat; approving resumes the suspended run.
 */
import { useCallback, useEffect, useState } from "react";
import { useChat } from "@/context/ChatContext";
import { actionApi, type ActionApproval } from "@/lib/actions/actionApi";
import { ActionApprovalCard } from "@/components/actions/ActionApprovalCard";

export function AgentRunApprovals({ runId }: { runId: string }) {
  const { confirmAgentRun } = useChat();
  const [approvals, setApprovals] = useState<ActionApproval[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await actionApi.list({ limit: 50 });
      setApprovals(
        list.filter((a) => a.runId === runId && (a.status === "proposed" || a.status === "approved"))
      );
    } catch {
      setApprovals([]);
    }
  }, [runId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!approvals || approvals.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {approvals.map((a) => (
        <ActionApprovalCard
          key={a.id}
          approval={a}
          onChanged={() => void refresh()}
          onApprovedForRun={() => void confirmAgentRun(runId)}
        />
      ))}
    </div>
  );
}
