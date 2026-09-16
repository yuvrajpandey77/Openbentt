/**
 * Phase 5 — Tool type model (provider-neutral, deterministic).
 * Additive only. No agents, no MCP, no autonomous behavior.
 */

export type ToolCategory =
  | "READ"
  | "SEARCH"
  | "KNOWLEDGE"
  | "DOCUMENT"
  | "CONNECTOR"
  | "EXPORT"
  | "UTILITY"
  | "WRITE";

export type ToolCapability =
  | "knowledge.read"
  | "knowledge.search"
  | "knowledge.traverse"
  | "document.read"
  | "document.search"
  | "connector.read"
  | "connector.search"
  | "connector.preview"
  | "connector.import"
  | "project.read"
  | "export.create"
  | "utility.compute";

export type ToolPermission =
  | "READ_ONLY"
  | "USER_CONFIRMATION"
  | "USER_INITIATED_WRITE"
  | "SYSTEM_INTERNAL";

export type ToolRisk = "LOW" | "MEDIUM" | "HIGH";

export type ToolExecutionMode = "local" | "backend";

export type PolicyDecision = "ALLOW" | "DENY" | "CONFIRM";

export interface FieldSchema {
  type: string | string[];
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  maxItems?: number;
  enum?: string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  fields?: Record<string, FieldSchema>;
  items?: FieldSchema;
}

export interface ObjectSchema {
  fields: Record<string, FieldSchema>;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  category: ToolCategory;
  inputSchema: ObjectSchema;
  outputSchema: ObjectSchema;
  capabilities: ToolCapability[];
  permission: ToolPermission;
  risk: ToolRisk;
  executionMode: ToolExecutionMode;
  /** True when the tool can reach the external network (allowlisted hosts only). */
  externalNetwork: boolean;
  /** True when the tool can mutate persistent state. */
  mutation: boolean;
}

export interface ToolExecutionContext {
  projectId?: string;
  userInitiated?: boolean;
  userConfirmed?: boolean;
  confirmedToolId?: string;
  systemInternal?: boolean;
  source?: string;
  requestId?: string;
  timestamp?: string;
}

export interface ToolRequest {
  toolId: string;
  toolVersion: string;
  summary: string;
  riskLevel: ToolRisk;
  requestedCapabilities: ToolCapability[];
  affectedResources: string[];
  confirmationRequired: boolean;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  toolId: string;
  toolVersion: string;
  requestId: string;
  data?: T;
  error?: string;
  errorKind?: string;
  decision: PolicyDecision;
  durationMs: number;
}

export interface ToolAuditEvent {
  eventId: string;
  toolId: string;
  toolVersion: string;
  requestId: string;
  timestamp: string;
  source: string;
  projectId?: string;
  permission: ToolPermission;
  risk: ToolRisk;
  decision: PolicyDecision;
  status: "ok" | "denied" | "confirm_required" | "failed";
  durationMs: number;
  resourceSummary: Record<string, unknown>;
  errorCategory?: string;
}
