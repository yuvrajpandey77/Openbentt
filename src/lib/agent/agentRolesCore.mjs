/**
 * Phase 8 — Role agent configurations (single source of truth).
 * Plain JS so the renderer (via agentRoles.ts facade) and Electron
 * (researchProjectService.mjs) share role metadata with zero divergence.
 * Roles are configurations, NOT runtimes: every role runs on the Phase 6
 * driveLoop. Write tools stay confirmation-gated regardless of role.
 */

const READ_TOOLS = [
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
  "connector.unified_search",
  "project.get",
  "utility.calculate",
];

const DRAFT_TOOLS = ["gmail.create_draft"];

const STANDARD_WRITE_TOOLS = [
  "gmail.create_draft",
  "calendar.create_event",
  "slack.send_message",
  "github.create_issue",
  "notion.create_page",
];

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

export const AGENT_ROLE_DEFINITIONS = [
  {
    id: "research-assistant",
    name: "Research assistant",
    description: "Answers research questions using knowledge, documents, and connectors with provenance.",
    toolAllowlist: [...READ_TOOLS, "connector.import", "mcp.resource.read", "mcp.tool.execute", "export.create"],
    modelTask: "chat_lightweight",
    systemPolicy: `You are Openbentt's research assistant. Answer the user's research
question using the approved tools. Ground claims in retrieved evidence and
cite sources (titles, DOIs, document sections) when the tools provide them.
Say what you could not verify. Distinguish FACT (retrieved), SOURCE (where it
came from), and INFERENCE (your synthesis). Keep answers focused and skimmable.`,
    limits: { ...DEFAULT_LIMITS },
    taskCategories: ["ask", "search", "analyze", "summarize"],
    suggestedConnectors: ["crossref", "zotero", "google-drive", "notion"],
    accessLevel: "read-only",
  },
  {
    id: "executive-assistant",
    name: "Executive assistant",
    description: "Briefings across mail, calendar, chat, and docs. Drafts first; sends only with explicit approval.",
    toolAllowlist: [...READ_TOOLS, "mcp.resource.read", "export.create", ...DRAFT_TOOLS, "calendar.create_event", "gmail.send"],
    modelTask: "chat_synthesis",
    systemPolicy: `You are an executive assistant. Brief the user from connected
sources with provenance. Prefer DRAFT over SEND: propose drafts and calendar
holds, show exact previews, and wait for explicit approval. Never send
external mail without an approved action. Distinguish FACT, SOURCE, INFERENCE.`,
    limits: { ...DEFAULT_LIMITS, maxToolCalls: 8, maxSteps: 10 },
    taskCategories: ["briefing", "triage", "draft", "schedule"],
    suggestedConnectors: ["gmail", "google-calendar", "slack", "google-drive", "notion"],
    accessLevel: "read-draft",
  },
  {
    id: "marketing-assistant",
    name: "Marketing assistant",
    description: "Research plus drafts for outreach and content. External sends stay approval-gated.",
    toolAllowlist: [...READ_TOOLS, "mcp.resource.read", "export.create", ...DRAFT_TOOLS, "slack.send_message", "notion.create_page"],
    modelTask: "chat_drafting",
    systemPolicy: `You are a marketing assistant. Research from approved sources,
draft outreach and content, and propose actions with exact previews. External
publishing or sending always requires explicit user approval. Never publish,
spend, or delete. Distinguish FACT, SOURCE, INFERENCE.`,
    limits: { ...DEFAULT_LIMITS },
    taskCategories: ["research", "draft", "outreach", "content"],
    suggestedConnectors: ["google-drive", "notion", "slack", "gmail", "github"],
    accessLevel: "read-actions",
  },
  {
    id: "engineering-assistant",
    name: "Engineering assistant",
    description: "Code-adjacent research: issues, PRs, docs. Proposes issues and draft PRs; never merges or deletes.",
    toolAllowlist: [...READ_TOOLS, "mcp.resource.read", "export.create", "github.create_issue", "github.create_pull_request", "notion.create_page"],
    modelTask: "chat_lightweight",
    systemPolicy: `You are an engineering assistant. Investigate across repos,
docs, and discussions with evidence. Propose GitHub issues and pull requests
with exact title/body/base/head previews and wait for approval. Never merge,
close, or delete. Distinguish FACT, SOURCE, INFERENCE.`,
    limits: { ...DEFAULT_LIMITS, maxToolCalls: 8, maxSteps: 10 },
    taskCategories: ["investigate", "triage", "issue", "pull-request"],
    suggestedConnectors: ["github", "slack", "google-drive", "notion"],
    accessLevel: "read-actions",
  },
  {
    id: "operations-assistant",
    name: "Operations assistant",
    description: "Meetings, follow-ups, and coordination across calendar, mail, and chat. Acts only with approval.",
    toolAllowlist: [...READ_TOOLS, "mcp.resource.read", "export.create", ...STANDARD_WRITE_TOOLS, "gmail.send"],
    modelTask: "chat_synthesis",
    systemPolicy: `You are an operations assistant. Coordinate across calendar,
mail, chat, and docs. Draft first, show exact previews, and act only after
explicit approval. Never infer approval from tone or history. Distinguish
FACT, SOURCE, INFERENCE.`,
    limits: { ...DEFAULT_LIMITS, maxToolCalls: 8, maxSteps: 10 },
    taskCategories: ["coordinate", "schedule", "follow-up", "summarize"],
    suggestedConnectors: ["google-calendar", "gmail", "slack", "notion", "github"],
    accessLevel: "read-actions",
  },
];

export function getAgentRoleDefinition(id) {
  const found = AGENT_ROLE_DEFINITIONS.find((r) => r.id === id);
  if (!found) throw new Error(`Unknown agent role: ${String(id ?? "").slice(0, 80)}`);
  return found;
}

export function listAgentRoleDefinitions() {
  return AGENT_ROLE_DEFINITIONS.map((r) => ({ ...r, toolAllowlist: [...r.toolAllowlist] }));
}
