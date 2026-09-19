/**
 * Phase 8 — Renderer actions API (approvals + executions, metadata only).
 * Desktop IPC on the openbenttResearch bridge. Approval decisions originate
 * from trusted UI state here; the model can never call these paths.
 * Web fallback: approvals require the desktop ledger — honestly reported.
 */

export interface ActionPreviewLine {
  label: string;
  value: string;
}

export interface ActionApproval {
  id: string;
  toolId: string;
  fingerprint: string;
  projectId: string | null;
  runId: string | null;
  requestId: string;
  input: Record<string, unknown>;
  preview: ActionPreviewLine[];
  risk: string;
  status: "proposed" | "approved" | "rejected" | "expired" | "consumed";
  createdAt: string;
  decidedAt: string | null;
  consumedAt: string | null;
  expiresAt: string;
}

export interface ActionExecution {
  idempotencyKey: string;
  toolId: string;
  fingerprint: string;
  projectId: string | null;
  status: string;
  provider: string;
  externalId: string | null;
  result: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function bridge(): { actions: (op: string, payload?: unknown) => Promise<unknown> } | undefined {
  try {
    const w = window as unknown as {
      openbenttResearch?: { actions?: (op: string, payload?: unknown) => Promise<unknown> };
    };
    return w.openbenttResearch?.actions ? { actions: w.openbenttResearch.actions } : undefined;
  } catch {
    return undefined;
  }
}

export function hasActionsDesktopApi(): boolean {
  return Boolean(bridge());
}

function needDesktop(): Promise<never> {
  return Promise.reject(new Error("Approvals require the desktop app."));
}

export const actionApi = {
  get(approvalId: string): Promise<ActionApproval | null> {
    const b = bridge();
    if (!b) return Promise.resolve(null);
    return b.actions("get", { approvalId }) as Promise<ActionApproval | null>;
  },
  list(opts?: { status?: string; projectId?: string; limit?: number }): Promise<ActionApproval[]> {
    const b = bridge();
    if (!b) return Promise.resolve([]);
    return b.actions("list", opts ?? {}) as Promise<ActionApproval[]>;
  },
  approve(approvalId: string): Promise<ActionApproval> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.actions("approve", { approvalId }) as Promise<ActionApproval>;
  },
  reject(approvalId: string): Promise<ActionApproval> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.actions("reject", { approvalId }) as Promise<ActionApproval>;
  },
  executions(opts?: { projectId?: string; toolId?: string; limit?: number }): Promise<ActionExecution[]> {
    const b = bridge();
    if (!b) return Promise.resolve([]);
    return b.actions("executions", opts ?? {}) as Promise<ActionExecution[]>;
  },
  writeGrant(connectorId: string): Promise<{
    connectorId: string;
    hasWriteGrant: boolean;
    grantedScopes: string[];
    requiredScopes: string[];
  }> {
    const b = bridge();
    if (!b) {
      return Promise.resolve({ connectorId, hasWriteGrant: false, grantedScopes: [], requiredScopes: [] });
    }
    return b.actions("writeGrant", { connectorId }) as Promise<{
      connectorId: string;
      hasWriteGrant: boolean;
      grantedScopes: string[];
      requiredScopes: string[];
    }>;
  },
};
