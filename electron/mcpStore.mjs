/**
 * Phase 7 — MCP server registry (main process).
 *
 * Server configs persist as metadata in SQLite (mcp_servers table, v11);
 * auth tokens (if any) live in the OS vault via the connectorAuth pattern
 * (oauth-mcp-<id>.blob) — never in SQLite, logs, or audit rows.
 * Tool discovery results are cached in memory with TTL; every tool call
 * still passes through the Phase 5 policy gate in toolStore (the store
 * only executes; it never authorizes).
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

/** Lazy Electron resolution (see connectorAuthStore.mjs): test-safe. */
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

const VALID_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const VALID_TOOL = /^[a-zA-Z0-9_.-]{1,128}$/;

export function validateMcpServerConfig(raw) {
  if (!raw || typeof raw !== "object") throw new Error("invalid-mcp-config");
  const id = String(raw.id ?? "").trim();
  const name = String(raw.name ?? "").trim().slice(0, 128);
  const transport = raw.transport;
  const endpoint = String(raw.endpoint ?? "").trim().slice(0, 2000);
  if (!VALID_ID.test(id)) throw new Error("invalid-mcp-id");
  if (!name) throw new Error("invalid-mcp-name");
  if (transport !== "streamable-http" && transport !== "stdio-local") {
    throw new Error("invalid-mcp-transport");
  }
  if (!endpoint) throw new Error("invalid-mcp-endpoint");
  if (transport === "streamable-http") {
    let parsed;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new Error("invalid-mcp-endpoint");
    }
    if (parsed.protocol !== "https:") throw new Error("mcp-https-only");
    if (parsed.username || parsed.password) throw new Error("mcp-endpoint-blocked");
  }
  if (raw.allowedTools !== undefined) {
    if (!Array.isArray(raw.allowedTools)) throw new Error("invalid-mcp-tool-allowlist");
    for (const t of raw.allowedTools) {
      if (typeof t !== "string" || !VALID_TOOL.test(t)) throw new Error("invalid-mcp-tool-allowlist");
    }
  }
  return {
    id,
    name,
    transport,
    endpoint,
    enabled: raw.enabled !== false,
    allowedTools: Array.isArray(raw.allowedTools) ? [...raw.allowedTools] : undefined,
  };
}

/** Remote HTTPS hosts must be operator-allowlisted (SSRF protection). */
export function assertMcpHostAllowlisted(config, allowlist) {
  if (config.transport === "stdio-local") return;
  const host = new URL(config.endpoint).hostname.toLowerCase();
  const allowed = allowlist.map((a) => String(a).toLowerCase().replace(/\.$/, ""));
  if (!allowed.includes(host)) throw new Error("mcp-endpoint-not-allowlisted");
}

/* ---------------- SQLite metadata ---------------- */

export function listMcpServers(db) {
  return db.prepare("SELECT id, name, transport, endpoint, enabled, allowed_tools_json, created_at, updated_at FROM mcp_servers ORDER BY name").all().map(fromRow);
}

export function getMcpServer(db, id) {
  const row = db.prepare("SELECT id, name, transport, endpoint, enabled, allowed_tools_json, created_at, updated_at FROM mcp_servers WHERE id = ?").get(id);
  return row ? fromRow(row) : null;
}

export function upsertMcpServer(db, config) {
  const valid = validateMcpServerConfig(config);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mcp_servers (id, name, transport, endpoint, enabled, allowed_tools_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, transport = excluded.transport,
       endpoint = excluded.endpoint, enabled = excluded.enabled,
       allowed_tools_json = excluded.allowed_tools_json, updated_at = excluded.updated_at`
  ).run(
    valid.id, valid.name, valid.transport, valid.endpoint, valid.enabled ? 1 : 0,
    valid.allowedTools ? JSON.stringify(valid.allowedTools) : null, now, now
  );
  return valid;
}

export function removeMcpServer(db, id) {
  if (!VALID_ID.test(String(id))) throw new Error("invalid-mcp-id");
  db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id);
  return { ok: true };
}

export function setMcpServerEnabled(db, id, enabled) {
  if (!VALID_ID.test(String(id))) throw new Error("invalid-mcp-id");
  db.prepare("UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?").run(enabled ? 1 : 0, new Date().toISOString(), id);
  return { ok: true };
}

function fromRow(row) {
  let allowedTools;
  try {
    allowedTools = row.allowed_tools_json ? JSON.parse(row.allowed_tools_json) : undefined;
  } catch {
    allowedTools = undefined;
  }
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    endpoint: row.endpoint,
    enabled: row.enabled === 1,
    allowedTools,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ---------------- per-server auth token vault ---------------- */

export function mcpTokenPaths(app, serverId) {
  if (!VALID_ID.test(String(serverId))) throw new Error("invalid-mcp-id");
  const dir = path.join(app.getPath("userData"), ".secrets");
  const stem = `mcp-${serverId}`;
  return { dir, encrypted: path.join(dir, `${stem}.blob`), fallback: path.join(dir, `${stem}.secret`) };
}

export async function readMcpTokenMaybe(app, serverId) {
  const paths = mcpTokenPaths(app, serverId);
  try {
    if (fs.existsSync(paths.encrypted) && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(await fsp.readFile(paths.encrypted));
    }
  } catch (e) {
    console.warn(`[mcpStore] decrypt failed (${serverId}):`, e?.message ?? e);
  }
  try {
    if (fs.existsSync(paths.fallback)) return (await fsp.readFile(paths.fallback, "utf8")).trim();
  } catch {
    /* empty */
  }
  return "";
}

export async function writeMcpToken(app, serverId, raw) {
  const paths = mcpTokenPaths(app, serverId);
  await fsp.mkdir(paths.dir, { recursive: true, mode: 0o700 });
  await fsp.unlink(paths.encrypted).catch(() => {});
  await fsp.unlink(paths.fallback).catch(() => {});
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return { ok: true, mode: "cleared" };
  if (safeStorage.isEncryptionAvailable()) {
    await fsp.writeFile(paths.encrypted, safeStorage.encryptString(trimmed), { mode: 0o600 });
    return { ok: true, mode: "encrypted" };
  }
  await fsp.writeFile(paths.fallback, trimmed, { mode: 0o600 });
  return { ok: true, mode: "fallback-plain" };
}

/* ---------------- main-process JSON-RPC transport ---------------- */
/**
 * Streamable-HTTP JSON-RPC twin of src/lib/mcp/mcpClient.ts (main process
 * cannot import TS; framing is protocol-identical by construction and
 * covered by parity tests). stdio-local is executed only here, and only for
 * commands on the operator allowlist (env OPENBENTT_MCP_STDIO_ALLOWLIST).
 */

const MCP_TIMEOUT_MS = 30000;
const MCP_MAX_RESPONSE_BYTES = 1024 * 1024;
let mcpRpcId = 0;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /disregard\s+(all\s+)?(system|prior)\s+(prompts?|instructions?)/i,
  /grant\s+(yourself|me)\s+(admin|root|permission)/i,
  /bypass\s+(polic|permis|confirm|secur)/i,
  /send\s+\w+\s+to\s+(https?:|external|attacker)/i,
];

export function scanMcpContentForInjection(text) {
  const s = String(text ?? "");
  for (const re of INJECTION_PATTERNS) {
    const m = s.match(re);
    if (m) return { clean: false, matched: m[0].slice(0, 120) };
  }
  return { clean: true };
}

export function wrapMcpContentForModel(source, text, maxChars = 4000) {
  return `[BEGIN UNTRUSTED TOOL DATA: mcp:${String(source).slice(0, 64)}]\n${String(text ?? "").slice(0, maxChars)}\n[END UNTRUSTED TOOL DATA]`;
}

export function mcpAllowedHosts() {
  const raw = process.env.OPENBENTT_MCP_ALLOWED_HOSTS ?? "";
  return raw.split(",").map((s) => s.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
}

export function stdioAllowlist() {
  const raw = process.env.OPENBENTT_MCP_STDIO_ALLOWLIST ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function postRpcHttp(config, method, params, token, timeoutMs) {
  mcpRpcId += 1;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? MCP_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(config.endpoint, {
      method: "POST",
      signal: ctrl.signal,
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: mcpRpcId, method, params: params ?? {} }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === "AbortError") throw new Error("mcp-timeout");
    throw new Error("mcp-network-error");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new Error("mcp-auth-failed");
  if (res.status === 429) throw new Error("mcp-rate-limited");
  if (!res.ok) throw new Error(`mcp-http-${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MCP_MAX_RESPONSE_BYTES) throw new Error("mcp-response-too-large");
  const text = new TextDecoder().decode(buf).trim();
  let payload = text;
  if (text.startsWith("event:") || text.includes("\ndata:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    if (!lines.length) throw new Error("mcp-invalid-response");
    payload = lines[lines.length - 1].slice(5).trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("mcp-invalid-response");
  }
  if (parsed?.error) throw new Error(`mcp-error:${String(parsed.error.message ?? parsed.error.code).slice(0, 120)}`);
  return parsed?.result;
}

export async function mcpRpc(config, method, params, opts) {
  const valid = validateMcpServerConfig(config);
  if (!valid.enabled) throw new Error("mcp-server-disabled");
  if (valid.transport === "streamable-http") {
    assertMcpHostAllowlisted(valid, mcpAllowedHosts());
    const token = opts?.token;
    return postRpcHttp(valid, method, params, token, opts?.timeoutMs);
  }
  // stdio-local: only exact-allowlisted commands, spawned with timeout.
  const allowed = stdioAllowlist();
  if (!allowed.includes(valid.endpoint)) throw new Error("mcp-stdio-not-allowlisted");
  const { spawnSync } = await import("node:child_process");
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? {} });
  if (body.length > MCP_MAX_RESPONSE_BYTES) throw new Error("mcp-request-too-large");
  const proc = spawnSync(valid.endpoint, [], {
    input: body,
    timeout: opts?.timeoutMs ?? MCP_TIMEOUT_MS,
    maxBuffer: MCP_MAX_RESPONSE_BYTES,
    shell: false,
  });
  if (proc.error) throw new Error("mcp-stdio-failed");
  const out = (proc.stdout ?? Buffer.alloc(0)).toString("utf8").trim().slice(-MCP_MAX_RESPONSE_BYTES);
  let parsed;
  try {
    parsed = JSON.parse(out.split("\n").filter(Boolean).pop() ?? "");
  } catch {
    throw new Error("mcp-invalid-response");
  }
  if (parsed?.error) throw new Error(`mcp-error:${String(parsed.error.message ?? parsed.error.code).slice(0, 120)}`);
  return parsed?.result;
}
