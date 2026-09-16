/**
 * Minimal internal error taxonomy (Phase 1 observability foundation).
 *
 * Additive only: existing user-visible messages are preserved. New and touched
 * code should raise/translate to AppError so boundaries, logs, and toasts can
 * branch on `code` instead of string-matching. No rewrites of existing flows.
 */

export type AppErrorCode =
  | "validation"
  | "network"
  | "provider"
  | "authentication"
  | "rate-limit"
  | "local-model"
  | "document-processing"
  | "storage"
  | "ipc"
  | "security"
  | "configuration"
  | "unknown";

const RETRYABLE: ReadonlySet<AppErrorCode> = new Set([
  "network",
  "rate-limit",
  "provider",
  "local-model",
]);

export interface AppErrorOptions {
  cause?: unknown;
  /** Extra safe-to-log context (never secrets — enforced by the logger). */
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, opts: AppErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.retryable = opts.retryable ?? RETRYABLE.has(code);
    this.details = opts.details;
  }
}

/** Structural StreamHttpError check without importing the streaming layer. */
function streamHttpStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const named = err as { name?: unknown; status?: unknown };
  if (named.name !== "StreamHttpError" || typeof named.status !== "number") return null;
  return named.status;
}

/**
 * Best-effort translation of arbitrary throws into the taxonomy.
 * Never throws; unknown shapes become code "unknown" with a safe message.
 */
export function toAppError(err: unknown, fallbackCode: AppErrorCode = "unknown"): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return new AppError("validation", "Aborted", { cause: err, retryable: false });
  }
  const status = streamHttpStatus(err);
  if (status !== null) {
    const message = err instanceof Error && err.message ? err.message : `Request failed (${status})`;
    if (status === 429) return new AppError("rate-limit", message, { cause: err });
    if (status === 401 || status === 403) return new AppError("authentication", message, { cause: err });
    if (status >= 500) return new AppError("provider", message, { cause: err });
    return new AppError("provider", message, { cause: err });
  }
  if (err instanceof TypeError) {
    return new AppError("network", err.message || "Network request failed", { cause: err });
  }
  if (err instanceof Error) {
    return new AppError(fallbackCode, err.message || "Something went wrong", { cause: err });
  }
  if (typeof err === "string" && err.trim()) {
    return new AppError(fallbackCode, err);
  }
  return new AppError(fallbackCode, "Something went wrong");
}
