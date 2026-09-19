/**
 * Phase 7 — OAuth core (pure functions, no network, no storage).
 *
 * Actual token storage lives in electron/connectorAuthStore.mjs (OS vault).
 * This module covers: CSRF state, PKCE (S256), scope validation, authorize
 * URL building, callback validation, token expiry. All deterministic and
 * unit-testable.
 */
import { getEnterpriseMeta } from "@/lib/connectors/enterpriseConnectors";

/** OAuth state payload (single-use, short-lived; store hashed server-side). */
export interface OAuthState {
  raw: string;
  connectorId: string;
  codeVerifier?: string;
  codeChallenge?: string;
  createdAt: number;
  projectId?: string;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_BYTES = 32;

export function newOAuthState(connectorId: string, projectId?: string): OAuthState {
  const bytes = new Uint8Array(STATE_BYTES);
  crypto.getRandomValues(bytes);
  const raw = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { raw, connectorId, createdAt: Date.now(), projectId };
}

export function isOAuthStateExpired(state: OAuthState, now = Date.now()): boolean {
  return now - state.createdAt > STATE_TTL_MS || now < state.createdAt - 60_000;
}

/** Constant-time-ish state comparison (both hex strings). */
export function validateOAuthState(expected: OAuthState, returned: string, now = Date.now()): boolean {
  if (!expected || typeof returned !== "string") return false;
  if (expected.connectorId == null) return false;
  if (isOAuthStateExpired(expected, now)) return false;
  const a = expected.raw;
  const b = returned;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** PKCE S256 challenge. Async (SubtleCrypto); falls back to plain verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newCodeVerifier(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 128);
}

/**
 * Build the provider authorize URL. Scopes ALWAYS come from the
 * enterprise metadata registry — callers cannot invent scopes.
 */
export function buildAuthorizeUrl(args: {
  connectorId: string;
  clientId: string;
  redirectUri: string;
  state: OAuthState;
  extraParams?: Record<string, string>;
}): string {
  const meta = getEnterpriseMeta(args.connectorId);
  if (!args.clientId || !args.redirectUri) throw new Error("oauth-misconfigured");
  const url = new URL(meta.oauth.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state.raw);
  if (meta.scopes.length > 0) {
    const sep = args.connectorId === "slack" ? "," : " ";
    url.searchParams.set("scope", meta.scopes.join(sep));
  }
  if (args.connectorId.startsWith("google") || args.connectorId === "gmail") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    if (args.state.codeChallenge) {
      url.searchParams.set("code_challenge", args.state.codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }
  }
  for (const [k, v] of Object.entries(args.extraParams ?? {})) {
    if (/scope|client_id|redirect_uri|state|code/i.test(k)) continue;
    url.searchParams.set(k, v);
  }
  return url.toString();
}

/** Validate the loopback callback query. Returns the code or throws. */
export function parseOAuthCallback(args: {
  expected: OAuthState;
  query: Record<string, string | undefined>;
  now?: number;
}): string {
  const { expected, query, now } = args;
  if (query.error) throw new Error(`oauth-provider-error:${String(query.error).slice(0, 64)}`);
  const state = query.state ?? "";
  if (!validateOAuthState(expected, state, now)) throw new Error("oauth-state-mismatch");
  const code = query.code ?? "";
  if (!code || code.length > 512) throw new Error("oauth-missing-code");
  return code;
}

/** True when the stored token must be refreshed (60s clock skew buffer). */
export function isTokenExpired(expiresAt: number | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true;
  return now >= expiresAt - 60_000;
}

/** Safe connection-status view: metadata only, never token values. */
export function redactTokenForStatus(token: {
  expiresAt?: number;
  scopes?: string[];
  accountLabel?: string;
}): { hasToken: boolean; expiresAt?: number; scopes: string[]; accountLabel?: string } {
  return {
    hasToken: true,
    expiresAt: token.expiresAt,
    scopes: [...(token.scopes ?? [])],
    accountLabel: token.accountLabel,
  };
}

/** Map provider HTTP failures to stable error kinds (no secret leakage). */
export function providerErrorKind(status: number): string {
  if (status === 401) return "reauth_required";
  if (status === 403) return "permission_denied";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_error";
}
