/**
 * Phase 4 — Connector error taxonomy (maps onto the existing AppError codes).
 * Errors exposed to UI are safe generics; details never carry secrets/payloads.
 */
import { AppError, type AppErrorCode } from "@/lib/appError";

export type ConnectorErrorKind =
  | "invalid_connector"
  | "unsupported_capability"
  | "invalid_input"
  | "authentication_failed"
  | "rate_limited"
  | "network_error"
  | "timeout"
  | "provider_error"
  | "invalid_response"
  | "response_too_large"
  | "ssrf_blocked"
  | "normalization_failed"
  | "identity_conflict"
  | "storage_error";

const KIND_TO_CODE: Record<ConnectorErrorKind, AppErrorCode> = {
  invalid_connector: "validation",
  unsupported_capability: "validation",
  invalid_input: "validation",
  authentication_failed: "authentication",
  rate_limited: "rate-limit",
  network_error: "network",
  timeout: "network",
  provider_error: "provider",
  invalid_response: "provider",
  response_too_large: "validation",
  ssrf_blocked: "security",
  normalization_failed: "document-processing",
  identity_conflict: "validation",
  storage_error: "storage",
};

const SAFE_MESSAGE: Record<ConnectorErrorKind, string> = {
  invalid_connector: "Unknown connector.",
  unsupported_capability: "Operation not supported by this connector.",
  invalid_input: "Invalid connector input.",
  authentication_failed: "Connector authentication failed.",
  rate_limited: "Provider rate limit reached. Try again later.",
  network_error: "Connector network request failed.",
  timeout: "Connector request timed out.",
  provider_error: "Provider returned an error.",
  invalid_response: "Provider returned an invalid response.",
  response_too_large: "Provider response exceeded the size limit.",
  ssrf_blocked: "Blocked unsafe URL.",
  normalization_failed: "Could not normalize provider data.",
  identity_conflict: "Conflicting identity for external item.",
  storage_error: "Connector storage failed.",
};

export class ConnectorError extends AppError {
  readonly kind: ConnectorErrorKind;
  constructor(kind: ConnectorErrorKind, detail?: string, opts?: { cause?: unknown }) {
    super(KIND_TO_CODE[kind], detail ? `${SAFE_MESSAGE[kind]} ${detail}` : SAFE_MESSAGE[kind], {
      cause: opts?.cause,
      details: { connectorKind: kind },
    });
    this.name = "ConnectorError";
    this.kind = kind;
  }
}

export function connectorError(kind: ConnectorErrorKind, detail?: string): ConnectorError {
  return new ConnectorError(kind, detail);
}

/** Map arbitrary throws into a safe ConnectorError (never leaks payloads). */
export function toConnectorError(err: unknown, fallback: ConnectorErrorKind = "provider_error"): ConnectorError {
  if (err instanceof ConnectorError) return err;
  if (err instanceof AppError) {
    const map: Partial<Record<AppErrorCode, ConnectorErrorKind>> = {
      validation: "invalid_input",
      network: "network_error",
      provider: "provider_error",
      authentication: "authentication_failed",
      "rate-limit": "rate_limited",
      security: "ssrf_blocked",
      storage: "storage_error",
    };
    return new ConnectorError(map[err.code] ?? fallback);
  }
  if (err instanceof DOMException && err.name === "AbortError") return new ConnectorError("timeout");
  if (err instanceof TypeError) return new ConnectorError("network_error");
  if (err instanceof Error) {
    const m = err.message;
    if (m === "url-blocked") return new ConnectorError("ssrf_blocked");
    if (m === "url-timeout") return new ConnectorError("timeout");
    if (m === "url-too-large") return new ConnectorError("response_too_large");
    if (m === "url-bad-content") return new ConnectorError("invalid_response");
    if (/429|rate/i.test(m)) return new ConnectorError("rate_limited");
    if (/401|403|unauthorized|forbidden/i.test(m)) return new ConnectorError("authentication_failed");
  }
  return new ConnectorError(fallback);
}

/** Sanitize provider HTTP status into a typed error (no body included). */
export function httpStatusToError(status: number): ConnectorError {
  if (status === 401 || status === 403) return new ConnectorError("authentication_failed");
  if (status === 429) return new ConnectorError("rate_limited");
  if (status >= 500) return new ConnectorError("provider_error", `HTTP ${status}`);
  if (status === 404) return new ConnectorError("invalid_response", "Not found");
  return new ConnectorError("provider_error", `HTTP ${status}`);
}
