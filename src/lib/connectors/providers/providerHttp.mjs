/**
 * Phase 7 — shared provider-client plumbing (plain-JS SSOT).
 * Imported by BOTH the renderer (via TS) and Electron main (relative path).
 * No secrets here: the OAuth bearer token is attached by the main-process
 * executor (connectorAuthStore.authorizedFetchFor) against allowlisted hosts.
 */
/**
 * ProviderError carries a stable machine-readable kind; safe messages only.
 * Renderer code maps kinds onto ConnectorError via toConnectorError.
 */
export class ProviderError extends Error {
  constructor(kind, detail) {
    super(detail ? `${kind}: ${String(detail).slice(0, 80)}` : kind);
    this.name = "ProviderError";
    this.kind = kind;
  }
}
const ConnectorError = ProviderError;

export function isAuthFailure(err) {
  return err instanceof ProviderError && err.kind === "authentication_failed";
}

export const PROVIDER_TIMEOUT_MS = 15000;
export const PROVIDER_MAX_PAGE = 100;
export const PROVIDER_MAX_SNIPPET = 2000;
export const PROVIDER_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const PROVIDER_HOST_SUFFIXES = ["googleapis.com", "slack.com"];
const PROVIDER_HOSTS = new Set([
  "www.googleapis.com",
  "gmail.googleapis.com",
  "drive.google.com",
  "slack.com",
  "api.github.com",
  "api.notion.com",
  "github.com",
]);

export function assertProviderUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new ConnectorError("ssrf_blocked", "url");
  }
  if (parsed.protocol !== "https:") throw new ConnectorError("ssrf_blocked", "scheme");
  if (parsed.username || parsed.password) throw new ConnectorError("ssrf_blocked", "creds");
  const host = parsed.hostname.toLowerCase();
  if (PROVIDER_HOSTS.has(host)) return parsed.toString();
  for (const suffix of PROVIDER_HOST_SUFFIXES) {
    if (host.endsWith(`.${suffix}`)) return parsed.toString();
  }
  throw new ConnectorError("ssrf_blocked", "host");
}

export function truncateSnippet(raw, max = PROVIDER_MAX_SNIPPET) {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  return s.slice(0, max);
}

export function clampPageSize(n, def = 50, max = PROVIDER_MAX_PAGE) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(1, Math.floor(v)));
}

/** Bounded GET+JSON with a single Retry-After-honoring retry on 429/5xx. */
export async function providerGetJson(url, fetchImpl, opts) {
  assertProviderUrl(url);
  const timeoutMs = opts?.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, { signal: ctrl.signal, redirect: "manual" });
    } catch (err) {
      clearTimeout(timer);
      if (err?.name === "AbortError") throw new ConnectorError("timeout");
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError("network_error");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempt === 0) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "1");
        const waitMs = Math.min(30_000, Math.max(0, (Number.isFinite(retryAfter) ? retryAfter : 1) * 1000));
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (res.status === 429) throw new ConnectorError("rate_limited");
      throw new ConnectorError("provider_unavailable");
    }
    if (res.status === 401) throw new ConnectorError("authentication_failed");
    if (res.status === 403) throw new ConnectorError("permission_denied");
    if (res.status === 404) throw new ConnectorError("not_found");
    if (!res.ok) throw new ConnectorError("provider_error", `http-${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!/application\/json/i.test(ct)) throw new ConnectorError("invalid_response", "content-type");
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > PROVIDER_MAX_RESPONSE_BYTES) throw new ConnectorError("response_too_large");
    try {
      return JSON.parse(new TextDecoder().decode(buf));
    } catch {
      throw new ConnectorError("invalid_response", "json");
    }
  }
  throw new ConnectorError("provider_error");
}

/** Bounded POST+JSON (Notion search/query) with the same guards. */
export async function providerPostJson(url, fetchImpl, body, opts) {
  assertProviderUrl(url);
  const timeoutMs = opts?.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const payload = JSON.stringify(body ?? {}).slice(0, 20000);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      signal: ctrl.signal,
      redirect: "manual",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === "AbortError") throw new ConnectorError("timeout");
    if (err instanceof ConnectorError) throw err;
    throw new ConnectorError("network_error");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) throw new ConnectorError("authentication_failed");
  if (res.status === 403 || res.status === 404) throw new ConnectorError("permission_denied");
  if (res.status === 429) throw new ConnectorError("rate_limited");
  if (!res.ok) throw new ConnectorError("provider_error", `http-${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > PROVIDER_MAX_RESPONSE_BYTES) throw new ConnectorError("response_too_large");
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new ConnectorError("invalid_response", "json");
  }
}
