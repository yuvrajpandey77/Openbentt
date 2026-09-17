/**
 * Phase 6 — Structured agent errors (states, not crashes).
 * A tool failure never crashes the run; limits fail closed.
 */
import { AppError } from "@/lib/appError";

export type AgentErrorKind =
  | "AGENT_TIMEOUT"
  | "AGENT_STEP_LIMIT"
  | "AGENT_TOOL_LIMIT"
  | "TOOL_DENIED"
  | "TOOL_CONFIRMATION_REQUIRED"
  | "TOOL_INVALID_INPUT"
  | "TOOL_FAILED"
  | "MODEL_FAILURE"
  | "CONTEXT_LIMIT"
  | "OUTPUT_LIMIT"
  | "PROJECT_SCOPE_FAILURE"
  | "RUN_CANCELLED";

const SAFE_MESSAGE: Record<AgentErrorKind, string> = {
  AGENT_TIMEOUT: "Agent run exceeded its time budget.",
  AGENT_STEP_LIMIT: "Agent run exceeded its step budget.",
  AGENT_TOOL_LIMIT: "Agent run exceeded its tool-call budget.",
  TOOL_DENIED: "A proposed tool action was denied by policy.",
  TOOL_CONFIRMATION_REQUIRED: "A proposed tool action needs user confirmation.",
  TOOL_INVALID_INPUT: "A proposed tool call had invalid input.",
  TOOL_FAILED: "A tool execution failed.",
  MODEL_FAILURE: "The model request failed.",
  CONTEXT_LIMIT: "The request exceeds the agent context budget.",
  OUTPUT_LIMIT: "The agent response exceeds the output budget.",
  PROJECT_SCOPE_FAILURE: "Cross-project access was blocked.",
  RUN_CANCELLED: "The agent run was cancelled.",
};

export class AgentError extends AppError {
  readonly kind: AgentErrorKind;
  constructor(kind: AgentErrorKind, detail?: string, opts?: { cause?: unknown }) {
    super("validation", detail ? `${SAFE_MESSAGE[kind]} ${detail}` : SAFE_MESSAGE[kind], {
      cause: opts?.cause,
      details: { agentKind: kind },
    });
    this.name = "AgentError";
    this.kind = kind;
  }
}

export function toAgentError(err: unknown, fallback: AgentErrorKind = "TOOL_FAILED"): AgentError {
  if (err instanceof AgentError) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return new AgentError("RUN_CANCELLED");
  }
  if (err instanceof Error && /timed out/i.test(err.message)) {
    return new AgentError("AGENT_TIMEOUT");
  }
  return new AgentError(fallback);
}
