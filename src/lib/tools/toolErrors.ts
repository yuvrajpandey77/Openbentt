/**
 * Phase 5 — Tool error taxonomy (maps onto the existing AppError codes).
 * Errors exposed to callers/UI are safe generics; details never carry
 * secrets, paths, SQL, payloads, or stack traces.
 */
import { AppError, type AppErrorCode } from "@/lib/appError";

export type ToolErrorKind =
  | "unknown_tool"
  | "unknown_capability"
  | "invalid_input"
  | "input_too_large"
  | "permission_denied"
  | "confirmation_required"
  | "invalid_context"
  | "invalid_output"
  | "execution_failed"
  | "timeout"
  | "rate_limited"
  | "network_error"
  | "storage_error";

const KIND_TO_CODE: Record<ToolErrorKind, AppErrorCode> = {
  unknown_tool: "validation",
  unknown_capability: "validation",
  invalid_input: "validation",
  input_too_large: "validation",
  permission_denied: "security",
  confirmation_required: "security",
  invalid_context: "validation",
  invalid_output: "provider",
  execution_failed: "provider",
  timeout: "network",
  rate_limited: "rate-limit",
  network_error: "network",
  storage_error: "storage",
};

const SAFE_MESSAGE: Record<ToolErrorKind, string> = {
  unknown_tool: "Unknown tool.",
  unknown_capability: "Tool capability is not recognized.",
  invalid_input: "Invalid tool input.",
  input_too_large: "Tool input exceeds size limits.",
  permission_denied: "Tool execution is not permitted in this context.",
  confirmation_required: "User confirmation is required before execution.",
  invalid_context: "Invalid execution context.",
  invalid_output: "Tool produced an invalid result.",
  execution_failed: "Tool execution failed.",
  timeout: "Tool execution timed out.",
  rate_limited: "Provider rate limit reached. Try again later.",
  network_error: "Tool network request failed.",
  storage_error: "Tool storage failed.",
};

export class ToolError extends AppError {
  readonly kind: ToolErrorKind;
  constructor(kind: ToolErrorKind, detail?: string, opts?: { cause?: unknown }) {
    super(KIND_TO_CODE[kind], detail ? `${SAFE_MESSAGE[kind]} ${detail}` : SAFE_MESSAGE[kind], {
      cause: opts?.cause,
      details: { toolKind: kind },
    });
    this.name = "ToolError";
    this.kind = kind;
  }
}

/** Map arbitrary throws into a safe ToolError (never leaks internals). */
export function toToolError(err: unknown, fallback: ToolErrorKind = "execution_failed"): ToolError {
  if (err instanceof ToolError) return err;
  if (err instanceof AppError) {
    if (err.code === "rate-limit") return new ToolError("rate_limited");
    if (err.code === "network") return new ToolError("network_error");
    if (err.code === "storage") return new ToolError("storage_error");
    if (err.code === "security") return new ToolError("permission_denied");
    if (err.code === "validation") return new ToolError("invalid_input");
    return new ToolError(fallback);
  }
  if (err instanceof DOMException && err.name === "AbortError") return new ToolError("timeout");
  if (err instanceof TypeError) return new ToolError("network_error");
  if (err instanceof Error) {
    const m = err.message;
    if (m === "calc-error") return new ToolError("invalid_input", "expression");
    if (/timed out/i.test(m)) return new ToolError("timeout");
  }
  return new ToolError(fallback);
}
