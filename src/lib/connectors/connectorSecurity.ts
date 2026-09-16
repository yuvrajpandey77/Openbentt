/**
 * Phase 4 — Connector security boundary (hostile external data).
 * Reuses the Phase 1/2 SSRF-safe URL policy; adds bounded fetch,
 * sanitization, and credential redaction. No secrets are logged.
 */
import {
  CONNECTOR_LIMITS,
  validateExternalUrl as coreValidateUrl,
} from "@/lib/connectors/connectorCore.mjs";
import { sanitizeText as coreSanitize } from "@/lib/connectors/connectorCore.mjs";
import { ConnectorError, httpStatusToError, toConnectorError } from "@/lib/connectors/connectorErrors";

export const CONNECTOR_FETCH_TIMEOUT_MS = CONNECTOR_LIMITS.maxFetchTimeoutMs as number;
export const CONNECTOR_MAX_RESPONSE_BYTES = CONNECTOR_LIMITS.maxResponseBytes as number;
export const CONNECTOR_MAX_REDIRECTS = CONNECTOR_LIMITS.maxRedirects as number;

export function validateConnectorUrl(raw: string): string {
  try {
    return coreValidateUrl(raw) as string;
  } catch {
    throw new ConnectorError("ssrf_blocked");
  }
}

/** Validate without throwing (for normalization that must not fail hard). */
export function tryValidateConnectorUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    return coreValidateUrl(raw) as string;
  } catch {
    return undefined;
  }
}

export function sanitizeConnectorText(raw: unknown, maxChars: number): string {
  return coreSanitize(raw, maxChars) as string;
}

/** Redact anything credential-shaped from log/error strings. */
export function redactConnectorSecrets(text: string): string {
  return String(text ?? "")
    .replace(/([A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password|authorization)[A-Za-z0-9_-]*\s*[:=]\s*)([^\s&;,"'}]+)/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[^\s;,"'}]+/gi, "$1[redacted]")
    .replace(/(api_key=[^&\s]*)/gi, "api_key=[redacted]")
    .slice(0, 500);
}

export interface BoundedFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

/**
 * Bounded fetch for connector providers: timeout, size cap, manual
 * redirects (per-hop SSRF revalidation), JSON content-type check.
 * Never sends credentials unless the caller supplies them explicitly.
 */
export async function fetchConnectorJson(
  url: string,
  fetchImpl: typeof fetch = fetch,
  opts?: BoundedFetchOptions
): Promise<{ json: unknown; finalUrl: string; status: number }> {
  const start = validateConnectorUrl(url);
  const timeoutMs = opts?.timeoutMs ?? CONNECTOR_FETCH_TIMEOUT_MS;
  const maxBytes = opts?.maxBytes ?? CONNECTOR_MAX_RESPONSE_BYTES;
  const maxRedirects = opts?.maxRedirects ?? CONNECTOR_MAX_REDIRECTS;
  const safeHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts?.headers ?? {})) {
    if (/authorization|api[_-]?key|token|secret|cookie/i.test(k)) continue;
    safeHeaders[k] = v;
  }
  let current = start;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(current, { signal: ctrl.signal, redirect: "manual", headers: safeHeaders });
    } catch (err) {
      clearTimeout(timer);
      throw toConnectorError(err, "network_error");
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || hop === maxRedirects) throw new ConnectorError("ssrf_blocked", "redirect");
      try {
        current = coreValidateUrl(new URL(loc, current).toString()) as string;
      } catch {
        throw new ConnectorError("ssrf_blocked", "redirect");
      }
      continue;
    }
    if (res.status === 429) throw new ConnectorError("rate_limited");
    if (!res.ok) throw httpStatusToError(res.status);
    const contentType = res.headers.get("content-type") ?? "";
    if (!/application\/json/i.test(contentType)) throw new ConnectorError("invalid_response", "content-type");
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new ConnectorError("response_too_large");
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(buf));
    } catch {
      throw new ConnectorError("invalid_response", "json");
    }
    if (JSON.stringify(parsed)?.length !== undefined && buf.length === 0) {
      throw new ConnectorError("invalid_response", "empty");
    }
    return { json: parsed, finalUrl: current, status: res.status };
  }
  throw new ConnectorError("ssrf_blocked", "redirects");
}

/** Depth/size guard for arbitrary provider JSON before normalization. */
export function assertBoundedProviderJson(value: unknown, seen = new Set<object>(), depth = 0): void {
  if (depth > 8) throw new ConnectorError("invalid_response", "depth");
  if (value !== null && typeof value === "object") {
    if (seen.has(value as object)) throw new ConnectorError("invalid_response", "cycle");
    seen.add(value as object);
    if (Array.isArray(value)) {
      if (value.length > 2000) throw new ConnectorError("invalid_response", "array");
      for (const v of value) assertBoundedProviderJson(v, seen, depth + 1);
    } else {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > 500) throw new ConnectorError("invalid_response", "object");
      for (const [, v] of entries) assertBoundedProviderJson(v, seen, depth + 1);
    }
    seen.delete(value as object);
  }
}
