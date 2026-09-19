/**
 * Phase 8 — Role agent configurations (typed facade; data owned by
 * agentRolesCore.mjs, shared with Electron main).
 */
import {
  AGENT_ROLE_DEFINITIONS,
  getAgentRoleDefinition,
  listAgentRoleDefinitions,
} from "@/lib/agent/agentRolesCore.mjs";
import type { AgentDefinition } from "@/lib/agent/agentTypes";

export interface AgentRoleMeta extends AgentDefinition {
  /** Human task categories shown in the Agents UI. */
  taskCategories: string[];
  /** Connector ids this role is expected to use (advisory; access still gated). */
  suggestedConnectors: string[];
  /** Read-only when no write tool is allowlisted. */
  accessLevel: "read-only" | "read-draft" | "read-actions";
}

function toMeta(raw: (typeof AGENT_ROLE_DEFINITIONS)[number]): AgentRoleMeta {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    toolAllowlist: [...raw.toolAllowlist],
    modelTask: raw.modelTask as AgentRoleMeta["modelTask"],
    systemPolicy: raw.systemPolicy,
    limits: { ...raw.limits },
    taskCategories: [...raw.taskCategories],
    suggestedConnectors: [...raw.suggestedConnectors],
    accessLevel: raw.accessLevel as AgentRoleMeta["accessLevel"],
  };
}

const ROLES: AgentRoleMeta[] = AGENT_ROLE_DEFINITIONS.map(toMeta);

export const AGENT_ROLES: AgentRoleMeta[] = ROLES;

export const RESEARCH_ASSISTANT_ROLE: AgentRoleMeta = ROLES.find(
  (r) => r.id === "research-assistant"
)!;

export const EXECUTIVE_ASSISTANT_ROLE: AgentRoleMeta = ROLES.find(
  (r) => r.id === "executive-assistant"
)!;

export const MARKETING_ASSISTANT_ROLE: AgentRoleMeta = ROLES.find(
  (r) => r.id === "marketing-assistant"
)!;

export const ENGINEERING_ASSISTANT_ROLE: AgentRoleMeta = ROLES.find(
  (r) => r.id === "engineering-assistant"
)!;

export const OPERATIONS_ASSISTANT_ROLE: AgentRoleMeta = ROLES.find(
  (r) => r.id === "operations-assistant"
)!;

export function getAgentRole(id: string): AgentRoleMeta {
  return toMeta(getAgentRoleDefinition(id));
}

export function listAgentRoles(): AgentRoleMeta[] {
  return listAgentRoleDefinitions().map(toMeta);
}
