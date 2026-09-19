/**
 * Phase 8 — Action approval card (chat + Approval Center).
 * Renders the EXACT provider preview from validated tool arguments, the
 * bound fingerprint, risk, and expiry. Approve/Reject originate from trusted
 * UI state. After approval the action executes with the bound approval id;
 * success is shown only after the provider confirms.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { actionApi, type ActionApproval } from "@/lib/actions/actionApi";
import { toolApi } from "@/lib/tools/toolApi";

interface Props {
  approval: ActionApproval;
  onChanged?: (approval: ActionApproval | null) => void;
  /** When set, approving also resumes the suspended agent run. */
  onApprovedForRun?: (approval: ActionApproval) => void;
}

function riskBadge(risk: string) {
  if (risk === "HIGH") {
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="h-3 w-3" /> High risk
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <AlertTriangle className="h-3 w-3" /> {risk === "LOW" ? "Low" : "Medium"} risk
    </Badge>
  );
}

export function ActionApprovalCard({ approval, onChanged, onApprovedForRun }: Props) {
  const [busy, setBusy] = useState<"approve" | "reject" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const expired = approval.status === "expired" || Date.parse(approval.expiresAt) < Date.now();

  async function doApprove() {
    setBusy("approve");
    setError(null);
    try {
      const next = await actionApi.approve(approval.id);
      onChanged?.(next);
      if (onApprovedForRun) {
        onApprovedForRun(next);
      } else {
        await doExecute(next.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
      setBusy(null);
    }
  }

  async function doExecute(approvalId: string) {
    setBusy("execute");
    setError(null);
    try {
      const res = await toolApi.execute(approval.toolId, approval.input, {
        projectId: approval.projectId ?? undefined,
        userInitiated: true,
        userConfirmed: true,
        confirmedToolId: approval.toolId,
        confirmedApprovalId: approvalId,
        source: approval.runId ? `agent:${approval.runId}` : "approval-center",
      });
      if (res.ok) {
        const data = (res.data ?? {}) as Record<string, unknown>;
        setResult(describeSuccess(approval.toolId, data));
        const refreshed = await actionApi.get(approval.id).catch(() => null);
        onChanged?.(refreshed);
      } else if (res.decision === "CONFIRM") {
        setError("Approval was not accepted (action changed or expired). Review the new proposal.");
        const refreshed = await actionApi.get(approval.id).catch(() => null);
        onChanged?.(refreshed);
      } else {
        setError(typeof res.error === "string" ? res.error : "Execution failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setBusy(null);
    }
  }

  async function doReject() {
    setBusy("reject");
    setError(null);
    try {
      const next = await actionApi.reject(approval.id);
      onChanged?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rejection failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-amber-500/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <span>Action requires approval</span>
          {riskBadge(approval.risk)}
          <Badge variant="outline">{approval.toolId}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="space-y-1.5">
          {approval.preview.map((line, i) => (
            <div key={i} className="grid grid-cols-[7rem_1fr] gap-2">
              <dt className="text-muted-foreground">{line.label}</dt>
              <dd className="break-words">{line.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Bound to this exact action{approval.projectId ? ` in project ${approval.projectId}` : ""}.
          {expired ? " This approval has expired." : ` Expires ${new Date(approval.expiresAt).toLocaleTimeString()}.`}
        </p>
        {result && (
          <p className="flex items-start gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{result}</span>
          </p>
        )}
        {error && (
          <p className="flex items-start gap-1.5 text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
        {(approval.status === "proposed" || approval.status === "approved") && !result && (
          <div className="flex gap-2">
            {approval.status === "proposed" && (
              <Button size="sm" variant="outline" disabled={busy !== null || expired} onClick={doReject}>
                {busy === "reject" ? "Rejecting…" : "Reject"}
              </Button>
            )}
            {approval.status === "proposed" ? (
              <Button size="sm" disabled={busy !== null || expired} onClick={doApprove}>
                {busy === "approve" ? "Approving…" : onApprovedForRun ? "Approve & continue" : "Approve & execute"}
              </Button>
            ) : (
              <Button size="sm" disabled={busy !== null} onClick={() => doExecute(approval.id)}>
                {busy === "execute" ? "Executing…" : "Execute approved action"}
              </Button>
            )}
          </div>
        )}
        {(approval.status === "consumed" || approval.status === "rejected" || approval.status === "expired") && !result && (
          <Badge variant="outline">Status: {approval.status}</Badge>
        )}
      </CardContent>
    </Card>
  );
}

function describeSuccess(toolId: string, data: Record<string, unknown>): string {
  const pick = (obj: unknown, keys: string[]): string | undefined => {
    if (!obj || typeof obj !== "object") return undefined;
    for (const k of keys) {
      const v = (obj as Record<string, unknown>)[k];
      if (typeof v === "string" && v) return v;
      if (typeof v === "number") return String(v);
    }
    return undefined;
  };
  switch (toolId) {
    case "gmail.create_draft":
      return `Draft created${pick(data.draft, ["draftId"]) ? ` (${pick(data.draft, ["draftId"])})` : ""}. Nothing was sent.`;
    case "gmail.send":
      return `Email sent${pick(data.message, ["messageId"]) ? ` (${pick(data.message, ["messageId"])})` : ""}.`;
    case "calendar.create_event":
      return `Calendar event created${pick(data.event, ["eventId"]) ? ` (${pick(data.event, ["eventId"])})` : ""}.`;
    case "slack.send_message":
      return `Slack message posted${pick(data.message, ["ts"]) ? ` (ts ${pick(data.message, ["ts"])})` : ""}.`;
    case "github.create_issue":
      return `GitHub issue ${pick(data.issue, ["number"]) ? `#${pick(data.issue, ["number"])} ` : ""}created${pick(data.issue, ["url"]) ? `: ${pick(data.issue, ["url"])}` : ""}.`;
    case "github.create_pull_request":
      return `Pull request ${pick(data.pullRequest, ["number"]) ? `#${pick(data.pullRequest, ["number"])} ` : ""}created${pick(data.pullRequest, ["url"]) ? `: ${pick(data.pullRequest, ["url"])}` : ""}.`;
    case "notion.create_page":
      return `Notion page created${pick(data.page, ["pageId"]) ? ` (${pick(data.page, ["pageId"])})` : ""}.`;
    default:
      return "Action completed and verified by the provider.";
  }
}
