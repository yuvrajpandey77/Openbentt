/**
 * Phase 6 — Agent contracts (types only).
 * The agent reasons; the Phase 5 policy decides. The model is never the
 * security boundary. No autonomous behavior is represented here.
 */

export type AgentRunStatus =
  | "running"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentStepKind =
  | "model_reasoning"
  | "tool_call"
  | "tool_observation"
  | "policy_block"
  | "confirmation_request"
  | "final_answer"
  | "error";

export interface AgentToolProposal {
  tool: string;
  input: Record<string, unknown>;
}

export interface AgentStep {
  index: number;
  kind: AgentStepKind;
  /** Safe activity label (shown in UI trace). Never chain-of-thought. */
  label: string;
  detail?: string;
  toolId?: string;
  decision?: "ALLOW" | "DENY" | "CONFIRM";
  durationMs?: number;
  timestamp: string;
}

export interface AgentToolCallRecord {
  toolId: string;
  requestId?: string;
  decision: string;
  ok: boolean;
  errorKind?: string;
  durationMs: number;
  timestamp: string;
}

export interface AgentRequest {
  request: string;
  projectId?: string;
  chatId?: string;
  source?: string;
}

export interface AgentContext {
  projectId?: string;
  requestId: string;
  runId: string;
  userInitiated: boolean;
  source: string;
}

export interface AgentLimits {
  maxSteps: number;
  maxToolCalls: number;
  maxTimeMs: number;
  maxToolTimeMs: number;
  maxRequestChars: number;
  maxFinalChars: number;
  maxContextChars: number;
  maxObservationsChars: number;
}

export interface AgentRun {
  runId: string;
  requestId: string;
  projectId?: string;
  request: string;
  agentId: string;
  status: AgentRunStatus;
  steps: AgentStep[];
  toolCalls: AgentToolCallRecord[];
  /** Bounded DATA observations (never instructions). */
  observations: { toolId: string; summary: string }[];
  finalText?: string;
  errorKind?: string;
  error?: string;
  pendingConfirmation?: {
    toolId: string;
    requestId: string;
    summary: string;
  };
  modelRoute?: string;
  startedAt: string;
  updatedAt: string;
  durationMs?: number;
}

export interface AgentDecision {
  type: "final" | "tool" | "abort";
  finalText?: string;
  proposal?: AgentToolProposal;
  reason?: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  /** Subset of Phase 5 tool ids the agent may propose. */
  toolAllowlist: string[];
  /** Task routed through the existing model router. */
  modelTask: "chat_general" | "chat_lightweight" | "chat_drafting" | "chat_synthesis";
  systemPolicy: string;
  limits: AgentLimits;
}

/** Model function injected for testability (default wraps streamRoutedTask). */
export interface AgentModelCallbacks {
  onDelta?: (text: string) => void;
}

export interface AgentModelResult {
  text: string;
  route?: string;
}

export type AgentModelFn = (
  messages: Array<{ role: string; content: unknown }>,
  opts: { signal: AbortSignal; streamFinal: boolean; onDelta?: (text: string) => void }
) => Promise<AgentModelResult>;

export interface AgentActivityEvent {
  runId: string;
  step: number;
  kind: AgentStepKind;
  label: string;
  detail?: string;
}

export type AgentActivityCallback = (event: AgentActivityEvent) => void;
