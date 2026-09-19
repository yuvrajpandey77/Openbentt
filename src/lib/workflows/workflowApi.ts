/**
 * Phase 8 — Renderer workflows API. Desktop IPC; web fallback is empty
 * (workflows execute in the desktop main process) — honestly reported.
 */

export interface WorkflowView {
  id: string;
  name: string;
  description: string;
  trigger: Record<string, unknown>;
  steps: Record<string, unknown>[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunView {
  id: string;
  workflowId: string;
  triggerKind: string;
  status: string;
  currentStep: number;
  state: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

function bridge(): { workflows: (op: string, payload?: unknown) => Promise<unknown> } | undefined {
  try {
    const w = window as unknown as {
      openbenttResearch?: { workflows?: (op: string, payload?: unknown) => Promise<unknown> };
    };
    return w.openbenttResearch?.workflows ? { workflows: w.openbenttResearch.workflows } : undefined;
  } catch {
    return undefined;
  }
}

export function hasWorkflowsDesktopApi(): boolean {
  return Boolean(bridge());
}

function needDesktop(): Promise<never> {
  return Promise.reject(new Error("Workflows require the desktop app."));
}

export const workflowApi = {
  list(): Promise<WorkflowView[]> {
    const b = bridge();
    if (!b) return Promise.resolve([]);
    return b.workflows("list") as Promise<WorkflowView[]>;
  },
  get(workflowId: string): Promise<WorkflowView | null> {
    const b = bridge();
    if (!b) return Promise.resolve(null);
    return b.workflows("get", { workflowId }) as Promise<WorkflowView | null>;
  },
  create(workflow: Record<string, unknown>): Promise<WorkflowView> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.workflows("create", { workflow }) as Promise<WorkflowView>;
  },
  update(workflowId: string, patch: Record<string, unknown>): Promise<WorkflowView> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.workflows("update", { workflowId, patch }) as Promise<WorkflowView>;
  },
  remove(workflowId: string): Promise<{ ok: boolean }> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.workflows("delete", { workflowId }) as Promise<{ ok: boolean }>;
  },
  start(workflowId: string, projectId?: string): Promise<WorkflowRunView> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.workflows("start", { workflowId, projectId }) as Promise<WorkflowRunView>;
  },
  resume(runId: string): Promise<WorkflowRunView> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.workflows("resume", { runId }) as Promise<WorkflowRunView>;
  },
  cancel(runId: string): Promise<WorkflowRunView> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.workflows("cancel", { runId }) as Promise<WorkflowRunView>;
  },
  runs(opts?: { workflowId?: string; status?: string; limit?: number }): Promise<WorkflowRunView[]> {
    const b = bridge();
    if (!b) return Promise.resolve([]);
    return b.workflows("runs", opts ?? {}) as Promise<WorkflowRunView[]>;
  },
};
