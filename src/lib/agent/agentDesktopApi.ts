/**
 * Phase 8 — Renderer agent-roles API (static registry over IPC).
 * Execution still routes through toolApi/agent runtime; this surface only
 * lists role configurations. Web fallback uses the local registry.
 */
import { listAgentRoles } from "@/lib/agent/agentRoles";
import type { AgentRoleMeta } from "@/lib/agent/agentRoles";

function bridge(): { agents: (op: string, payload?: unknown) => Promise<unknown> } | undefined {
  try {
    const w = window as unknown as {
      openbenttResearch?: { agents?: (op: string, payload?: unknown) => Promise<unknown> };
    };
    return w.openbenttResearch?.agents ? { agents: w.openbenttResearch.agents } : undefined;
  } catch {
    return undefined;
  }
}

export function hasAgentsDesktopApi(): boolean {
  return Boolean(bridge());
}

export const agentRolesApi = {
  list(): Promise<AgentRoleMeta[]> {
    const b = bridge();
    if (!b) return Promise.resolve(listAgentRoles());
    return b.agents("list") as Promise<AgentRoleMeta[]>;
  },
  get(agentId: string): Promise<AgentRoleMeta> {
    const b = bridge();
    if (!b) {
      const found = listAgentRoles().find((r) => r.id === agentId);
      if (!found) return Promise.reject(new Error("Unknown agent"));
      return Promise.resolve(found);
    }
    return b.agents("get", { agentId }) as Promise<AgentRoleMeta>;
  },
};
