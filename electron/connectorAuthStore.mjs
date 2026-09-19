/**
 * Phase 7 — Enterprise connector OAuth token vault (main process ONLY).
 *
 * Per-connector tokens live in OS-encrypted vault files
 * (userData/.secrets/oauth-<connectorId>.blob, 0600, dir 0700) following the
 * secretVault/zoteroSecretStore precedent. Tokens NEVER enter SQLite, IPC
 * payloads (except main-internal use), renderer state, logs, or audit rows.
 *
 * Exposed over IPC as safe metadata only:
 *   status(connectorId) -> { connected, accountLabel, scopes, expiresAt,
 *                            encryptionAvailable, fallback, lastError }
 *
 * CONNECTED is reported only when a vault token exists AND a real
 * authenticated provider verify request succeeded (verifiedAt fresh).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Electron safeStorage is available only in the desktop runtime. Under plain
 * node (unit tests) the electron package resolves to a path string, so
 * resolve lazily and degrade to the restricted-permission fallback file.
 */
const require = createRequire(import.meta.url);
let electronSafeStorage;
try {
  electronSafeStorage = require("electron")?.safeStorage;
} catch {
  electronSafeStorage = undefined;
}
const safeStorage = {
  isEncryptionAvailable: () => Boolean(electronSafeStorage?.isEncryptionAvailable?.()),
  encryptString: (s) => electronSafeStorage.encryptString(s),
  decryptString: (b) => electronSafeStorage.decryptString(b),
};

export const ENTERPRISE_CONNECTOR_IDS = [
  "google-drive",
  "gmail",
  "google-calendar",
  "slack",
  "github",
  "notion",
];

export function isEnterpriseConnectorId(id) {
  return ENTERPRISE_CONNECTOR_IDS.includes(id);
}

function fileStemFor(connectorId) {
  return `oauth-${connectorId}`;
}

export function oauthTokenPaths(app, connectorId) {
  if (!isEnterpriseConnectorId(connectorId)) throw new Error(`Unknown connector: ${connectorId}`);
  const dir = path.join(app.getPath("userData"), ".secrets");
  const stem = fileStemFor(connectorId);
  return {
    dir,
    encrypted: path.join(dir, `${stem}.blob`),
    fallback: path.join(dir, `${stem}.secret`),
  };
}

async function ensureSecretsDir(paths) {
  await fsp.mkdir(paths.dir, { recursive: true, mode: 0o700 });
}

/** Stored token envelope (JSON, never logged). */
export function readOAuthTokenMaybe(app, connectorId) {
  return (async () => {
    const paths = oauthTokenPaths(app, connectorId);
    let raw = "";
    try {
      if (fs.existsSync(paths.encrypted) && safeStorage.isEncryptionAvailable()) {
        const buf = await fsp.readFile(paths.encrypted);
        raw = safeStorage.decryptString(buf);
      }
    } catch (e) {
      console.warn(`[connectorAuth] decrypt failed (${connectorId}):`, e?.message ?? e);
    }
    if (!raw) {
      try {
        if (fs.existsSync(paths.fallback)) raw = (await fsp.readFile(paths.fallback, "utf8")).trim();
      } catch {
        /* empty */
      }
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || typeof parsed.accessToken !== "string") return null;
      return parsed;
    } catch {
      return null;
    }
  })();
}

export async function writeOAuthToken(app, connectorId, token) {
  const paths = oauthTokenPaths(app, connectorId);
  await ensureSecretsDir(paths);
  await fsp.unlink(paths.encrypted).catch(() => {});
  await fsp.unlink(paths.fallback).catch(() => {});
  if (!token) return { ok: true, mode: "cleared" };
  const envelope = JSON.stringify({
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? undefined,
    expiresAt: token.expiresAt ?? undefined,
    scopes: Array.isArray(token.scopes) ? token.scopes.slice(0, 32) : [],
    accountLabel: typeof token.accountLabel === "string" ? token.accountLabel.slice(0, 256) : undefined,
    tokenType: "Bearer",
    storedAt: new Date().toISOString(),
  });
  if (safeStorage.isEncryptionAvailable()) {
    await fsp.writeFile(paths.encrypted, safeStorage.encryptString(envelope), { mode: 0o600 });
    return { ok: true, mode: "encrypted" };
  }
  console.warn(`[connectorAuth] safeStorage unavailable for ${connectorId}; restricted-permission fallback.`);
  await fsp.writeFile(paths.fallback, envelope, { mode: 0o600 });
  return { ok: true, mode: "fallback-plain" };
}

export function isTokenExpired(token, now = Date.now()) {
  if (!token?.expiresAt) return false; // no expiry info: attempt use, provider decides
  return now >= token.expiresAt - 60_000;
}

/**
 * Phase 8 — write scopes for controlled actions. These are NEVER requested
 * silently: the ConnectionWizard / IntegrationsHub must show an explicit
 * "Enable actions" step, and existing read-only connections must re-authorize.
 * Mirrors deferredWriteScopes in enterpriseConnectors.ts.
 */
export const WRITE_SCOPES = {
  "google-drive": [],
  gmail: ["https://www.googleapis.com/auth/gmail.send"],
  "google-calendar": ["https://www.googleapis.com/auth/calendar"],
  slack: ["chat:write"],
  github: ["repo"],
  notion: [],
};

export function writeScopesFor(connectorId) {
  if (!isEnterpriseConnectorId(connectorId)) throw new Error(`Unknown connector: ${connectorId}`);
  return [...(WRITE_SCOPES[connectorId] ?? [])];
}

/** Scopes currently granted (persisted at token-write time). */
export async function grantedScopesFor(app, connectorId) {
  const token = await readOAuthTokenMaybe(app, connectorId);
  return Array.isArray(token?.scopes) ? token.scopes : [];
}

/** True when the stored grant covers the write scopes for an action tool. */
export async function hasWriteGrant(app, connectorId) {
  const needed = writeScopesFor(connectorId);
  if (needed.length === 0) return true; // no extra scope required by provider model
  const granted = await grantedScopesFor(app, connectorId);
  return needed.every((s) => granted.includes(s));
}

const REFRESH_TOKEN_URL = {
  "google-drive": "https://oauth2.googleapis.com/token",
  gmail: "https://oauth2.googleapis.com/token",
  "google-calendar": "https://oauth2.googleapis.com/token",
  slack: "https://slack.com/api/oauth.v2.access",
  github: "https://github.com/login/oauth/access_token",
  notion: "https://api.notion.com/v1/oauth/token",
};

/**
 * Phase 8 — OAuth refresh grant (main process only). Uses the stored
 * refresh_token with the operator-configured client id/secret (env).
 * Returns the updated envelope, or throws a safe generic error.
 * Providers without refresh support (GitHub OAuth, Notion bot tokens)
 * fail honestly → caller must surface needs_reauth.
 */
export async function refreshOAuthToken(app, connectorId) {
  if (!isEnterpriseConnectorId(connectorId)) throw new Error(`Unknown connector: ${connectorId}`);
  const current = await readOAuthTokenMaybe(app, connectorId);
  if (!current?.refreshToken) throw new Error("Token refresh unavailable; reconnect the provider.");
  const envPrefix = `OPENBENTT_${connectorId.toUpperCase().replace(/-/g, "_")}`;
  const clientId = process.env[`${envPrefix}_CLIENT_ID`];
  const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`];
  if (!clientId) throw new Error("Token refresh unavailable; reconnect the provider.");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: current.refreshToken,
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let tokenJson;
  try {
    const res = await fetch(REFRESH_TOKEN_URL[connectorId], {
      method: "POST",
      signal: ctrl.signal,
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error("refresh_failed");
    tokenJson = await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && /refresh_failed/.test(err.message)) {
      throw new Error("Stored session expired; reconnect the provider.");
    }
    throw new Error("Token refresh unreachable; retry or reconnect.");
  }
  const accessToken = tokenJson.access_token ?? tokenJson.authed_user?.access_token;
  if (!accessToken) throw new Error("Stored session expired; reconnect the provider.");
  const updated = {
    accessToken,
    refreshToken: tokenJson.refresh_token ?? tokenJson.authed_user?.refresh_token ?? current.refreshToken,
    expiresAt: tokenJson.expires_in ? Date.now() + Number(tokenJson.expires_in) * 1000 : current.expiresAt,
    scopes: Array.isArray(current.scopes) ? current.scopes : [],
    accountLabel: current.accountLabel,
  };
  await writeOAuthToken(app, connectorId, updated);
  return updated;
}

/**
 * Authorized fetch with a single refresh-and-retry on 401. On success the
 * retried response is returned; when refresh is unavailable the original
 * authentication failure surfaces (needs_reauth upstream).
 */
export function authorizedFetchWithRefreshFor(app, connectorId, allowedHosts) {
  const base = authorizedFetchFor(app, connectorId, allowedHosts);
  return async (url, init) => {
    const res = await base(url, init);
    if (res.status !== 401) return res;
    await refreshOAuthToken(app, connectorId);
    return base(url, init);
  };
}

/** Safe status view — metadata only. */
export async function connectorAuthStatus(app, connectorId, metaStore) {
  if (!isEnterpriseConnectorId(connectorId)) throw new Error(`Unknown connector: ${connectorId}`);
  const paths = oauthTokenPaths(app, connectorId);
  const token = await readOAuthTokenMaybe(app, connectorId);
  const meta = metaStore?.getConnectionMeta?.(connectorId) ?? {};
  return {
    connectorId,
    hasToken: Boolean(token?.accessToken),
    expired: token ? isTokenExpired(token) : undefined,
    accountLabel: token?.accountLabel ?? meta.accountLabel,
    scopes: token?.scopes ?? meta.scopes ?? [],
    expiresAt: token?.expiresAt,
    verifiedAt: meta.verifiedAt,
    connected: Boolean(token?.accessToken) && Boolean(meta.verifiedAt) && !isTokenExpired(token),
    needsReauth: Boolean(token) && (isTokenExpired(token) || meta.authRequired === true),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    fallback: fs.existsSync(paths.fallback),
    lastError: meta.lastError,
  };
}

/**
 * Build an authorized fetch for provider clients. Attaches Bearer token for
 * allowlisted provider hosts only; refuses all other hosts (SSRF guard).
 */
export function authorizedFetchFor(app, connectorId, allowedHosts) {
  return async (url, init) => {
    const parsed = new URL(String(url));
    const host = parsed.hostname.toLowerCase();
    const ok = allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
    if (!ok) throw new Error("connector-host-blocked");
    if (parsed.protocol !== "https:") throw new Error("connector-host-blocked");
    const token = await readOAuthTokenMaybe(app, connectorId);
    if (!token?.accessToken) {
      const err = new Error("authentication_failed");
      err.code = "authentication_failed";
      throw err;
    }
    const headers = { ...(init?.headers ?? {}), Authorization: `Bearer ${token.accessToken}` };
    if (connectorId === "notion") headers["Notion-Version"] = "2022-06-28";
    if (connectorId === "github") headers.Accept = "application/vnd.github+json";
    return fetch(url, { ...init, headers, redirect: "manual" });
  };
}

/** Single-use OAuth state store (CSRF protection, 10-min TTL). */
const pendingStates = new Map();

export function issueOAuthState(connectorId, projectId, mode) {
  const raw = crypto.randomBytes(32).toString("hex");
  const verifierBytes = crypto.randomBytes(48).toString("base64url").slice(0, 128);
  const challenge = crypto.createHash("sha256").update(verifierBytes).digest("base64url");
  const state = {
    raw, connectorId, codeVerifier: verifierBytes, codeChallenge: challenge,
    createdAt: Date.now(), projectId,
    // Phase 8: "actions" mode requests incremental write scopes for
    // controlled actions (explicit user step, never silent).
    mode: mode === "actions" ? "actions" : "read",
  };
  pendingStates.set(raw, state);
  if (pendingStates.size > 100) {
    const oldest = [...pendingStates.keys()][0];
    pendingStates.delete(oldest);
  }
  return state;
}

export function consumeOAuthState(raw, connectorId, now = Date.now()) {
  const state = pendingStates.get(String(raw));
  if (!state) return null;
  pendingStates.delete(String(raw));
  if (state.connectorId !== connectorId) return null;
  if (now - state.createdAt > 10 * 60 * 1000) return null;
  return state;
}

export function clearOAuthStatesForTest() {
  pendingStates.clear();
}
