/**
 * Phase 6 — Built-in agent definitions.
 * Phase 8 — role configurations register here; the runtime is unchanged.
 * No autonomous permissions; allowlists mirror the Phase 5/8 registry and
 * write tools stay confirmation-gated regardless of role.
 */
import type { AgentDefinition } from "@/lib/agent/agentTypes";
import { AGENT_ROLES } from "@/lib/agent/agentRoles";

const DEFAULT_LIMITS = {
  maxSteps: 8,
  maxToolCalls: 6,
  maxTimeMs: 120000,
  maxToolTimeMs: 30000,
  maxRequestChars: 4000,
  maxFinalChars: 8000,
  maxContextChars: 24000,
  maxObservationsChars: 12000,
};

export const RESEARCH_ASSISTANT_DEFINITION: AgentDefinition = {
  id: "research-assistant",
  name: "Research assistant",
  description: "Answers research questions using knowledge, documents, and connectors with provenance.",
  toolAllowlist: [
    "knowledge.search",
    "knowledge.get_entity",
    "knowledge.get_relationships",
    "knowledge.get_evidence",
    "document.search",
    "document.get",
    "document.inspect",
    "connector.list",
    "connector.get",
    "connector.preview",
    "connector.search",
    "connector.import",
    "connector.unified_search",
    "mcp.resource.read",
    "mcp.tool.execute",
    "project.get",
    "export.create",
    "utility.calculate",
  ],
  modelTask: "chat_lightweight",
  systemPolicy: `You are Openbentt's research assistant. Answer the user's research
question using the approved tools. Ground claims in retrieved evidence and
cite sources (titles, DOIs, document sections) when the tools provide them.
Say what you could not verify. Keep answers focused and skimmable.`,
  limits: { ...DEFAULT_LIMITS },
};

const DEFINITIONS = new Map<string, AgentDefinition>([
  [RESEARCH_ASSISTANT_DEFINITION.id, RESEARCH_ASSISTANT_DEFINITION],
  /* Phase 8 roles: same AgentDefinition shape, same runtime. */
  ...AGENT_ROLES.filter((r) => r.id !== RESEARCH_ASSISTANT_DEFINITION.id).map(
    (r): [string, AgentDefinition] => [r.id, {
      id: r.id,
      name: r.name,
      description: r.description,
      toolAllowlist: [...r.toolAllowlist],
      modelTask: r.modelTask,
      systemPolicy: r.systemPolicy,
      limits: { ...r.limits },
    }]
  ),
]);

export function getAgentDefinition(id: string): AgentDefinition {
  const def = DEFINITIONS.get(id);
  if (!def) throw new Error(`Unknown agent: ${String(id ?? "").slice(0, 80)}`);
  return def;
}

export function listAgentDefinitions(): AgentDefinition[] {
  return [...DEFINITIONS.values()];
}
