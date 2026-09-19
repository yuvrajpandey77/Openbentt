/**
 * Phase 8 — Opt-in Openbentt MCP server (main process only).
 *
 * Exposes approved READ-ONLY Openbentt tools to external MCP clients over
 * loopback HTTP (127.0.0.1) with vault-backed bearer auth. OFF by default.
 *
 *   External MCP client → bearer check → tool registry → policy →
 *   executeToolMain → audit
 *
 * Never exposed: internal services, write/mutating tools, secrets, tokens.
 * Rate-limited (60 req/min), bounded bodies (64 KiB), audited per call.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { getDb } from "./researchDb.mjs";
import { createLogger } from "./log.mjs";
import { executeToolMain, listToolDefinitions } from "./toolStore.mjs";
import {
  bearerMatches,
  isExposableTool,
  MCP_SERVER_DEFAULT_PORT,
  MCP_SERVER_RATE_LIMIT_PER_MINUTE,
  parseJsonRpc,
  resolveExposedTools,
  validateServerConfig,
} from "../src/lib/mcp/mcpServerCore.mjs";

const require = createRequire(import.meta.url);
let electronSafeStorage;
try {
  electronSafeStorage = require("electron")?.safeStorage;
} catch {
  electronSafeStorage = undefined;
}

const log = createLogger("mcp-server");
const MAX_BODY_BYTES = 64 * 1024;

function fail(message) {
  throw new Error(`MCP server: ${message}`);
}

function tokenPaths(app) {
  const dir = path.join(app.getPath("userData"), ".secrets");
  return {
    dir,
    encrypted: path.join(dir, "mcp-server.blob"),
    fallback: path.join(dir, "mcp-server.secret"),
  };
}

async function readServerToken(app) {
  const paths = tokenPaths(app);
  let raw = "";
  try {
    if (fs.existsSync(paths.encrypted) && electronSafeStorage?.isEncryptionAvailable?.()) {
      raw = electronSafeStorage.decryptString(await fsp.readFile(paths.encrypted));
    }
  } catch {
    /* fall through */
  }
  if (!raw) {
    try {
      if (fs.existsSync(paths.fallback)) raw = (await fsp.readFile(paths.fallback, "utf8")).trim();
    } catch {
      /* empty */
    }
  }
  return raw || null;
}

async function writeServerToken(app, raw) {
  const paths = tokenPaths(app);
  await fsp.mkdir(paths.dir, { recursive: true, mode: 0o700 });
  await fsp.unlink(paths.encrypted).catch(() => {});
  await fsp.unlink(paths.fallback).catch(() => {});
  if (!raw) return;
  if (electronSafeStorage?.isEncryptionAvailable?.()) {
    await fsp.writeFile(paths.encrypted, electronSafeStorage.encryptString(raw), { mode: 0o600 });
    return;
  }
  await fsp.writeFile(paths.fallback, raw, { mode: 0o600 });
}

/* ---------------- config ---------------- */

function rowToConfig(row) {
  let allowed = [];
  try {
    allowed = JSON.parse(row?.allowed_tools_json ?? "[]");
  } catch {
    allowed = [];
  }
  return {
    enabled: row ? row.enabled === 1 : false,
    port: row?.port ?? MCP_SERVER_DEFAULT_PORT,
    allowedTools: Array.isArray(allowed) ? allowed.filter((t) => typeof t === "string") : [],
  };
}

export function getMcpServerConfig(app) {
  const db = getDb(app);
  const row = db.prepare("SELECT * FROM mcp_server_config WHERE id = 'default'").get();
  return { ...rowToConfig(row), running: Boolean(server) };
}

export function setMcpServerConfig(app, patch = {}) {
  const current = getMcpServerConfig(app);
  const next = {
    enabled: patch.enabled === undefined ? current.enabled : patch.enabled === true,
    port: patch.port === undefined ? current.port : Number(patch.port),
    allowedTools: patch.allowedTools === undefined ? current.allowedTools : patch.allowedTools,
  };
  const err = validateServerConfig(next);
  if (err) fail(err);
  const now = new Date().toISOString();
  const db = getDb(app);
  db.prepare(
    `INSERT INTO mcp_server_config (id, enabled, port, allowed_tools_json, created_at, updated_at)
     VALUES ('default', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       enabled = excluded.enabled, port = excluded.port,
       allowed_tools_json = excluded.allowed_tools_json, updated_at = excluded.updated_at`
  ).run(next.enabled ? 1 : 0, next.port, JSON.stringify(next.allowedTools), now, now);
  return getMcpServerConfig(app);
}

/** Generate (rotating) the bearer token. Returns the token ONCE for the UI to show. */
export async function rotateMcpServerToken(app) {
  const token = `obmcp_${crypto.randomBytes(32).toString("hex")}`;
  await writeServerToken(app, token);
  return { token };
}

export async function clearMcpServerToken(app) {
  await writeServerToken(app, null);
  return { ok: true };
}

/* ---------------- server ---------------- */

let server = null;
let serverApp = null;
const hits = [];

function rateLimited() {
  const now = Date.now();
  while (hits.length && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= MCP_SERVER_RATE_LIMIT_PER_MINUTE) return true;
  hits.push(now);
  return false;
}

function sendJson(res, status, payload, id) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: id ?? null,
    ...(status === 200 ? { result: payload } : { error: payload }),
  }).slice(0, 128 * 1024);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

export async function startMcpServer(app) {
  const cfg = getMcpServerConfig(app);
  if (!cfg.enabled) fail("MCP server is disabled (opt-in only)");
  if (server) stopMcpServer();
  const token = await readServerToken(app);
  if (!token) fail("no server token; rotate a token first");
  const exposed = resolveExposedTools(cfg.allowedTools, listToolDefinitions());
  const srv = http.createServer((req, res) => {
    void (async () => {
      try {
        if (req.method !== "POST" || req.url !== "/mcp") {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "not found" }));
          return;
        }
        if (rateLimited()) {
          sendJson(res, 429, { code: -32000, message: "rate limited" }, null);
          return;
        }
        const auth = String(req.headers.authorization ?? "");
        const provided = auth.startsWith("Bearer ") ? auth.slice(7, 200) : "";
        const expected = await readServerToken(app);
        if (!expected || !bearerMatches(provided, expected)) {
          sendJson(res, 401, { code: -32001, message: "unauthorized" }, null);
          return;
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            sendJson(res, 413, { code: -32002, message: "body too large" }, null);
            return;
          }
          chunks.push(chunk);
        }
        const parsed = parseJsonRpc(Buffer.concat(chunks).toString("utf8"));
        if (parsed.error) {
          sendJson(res, 400, { code: -32600, message: parsed.error }, parsed.id);
          return;
        }
        if (parsed.method === "tools/list") {
          sendJson(res, 200, {
            tools: exposed.map((id) => {
              const def = listToolDefinitions().find((d) => d.id === id);
              return {
                name: id,
                description: def ? String(def.description).slice(0, 500) : id,
                inputSchema: def?.inputSchema ?? { fields: {} },
              };
            }),
          }, parsed.id);
          return;
        }
        // tools/call — read-only exposed tools only (defense in depth).
        const name = parsed.params?.name ?? parsed.params?.tool;
        const args = parsed.params?.arguments ?? parsed.params?.input ?? {};
        const def = listToolDefinitions().find((d) => d.id === name);
        if (!def || !exposed.includes(def.id) || !isExposableTool(def)) {
          sendJson(res, 200, { content: [{ type: "text", text: "tool not exposed" }], isError: true }, parsed.id);
          return;
        }
        const projectId = typeof args?.projectId === "string"
          && /^[a-zA-Z0-9_-]{1,128}$/.test(args.projectId) ? args.projectId : undefined;
        const result = await executeToolMain(app, def.id, args, {
          projectId, source: "mcp-server",
        });
        if (!result.ok) {
          sendJson(res, 200, {
            content: [{ type: "text", text: String(result.error ?? "failed").slice(0, 500) }],
            isError: true,
          }, parsed.id);
          return;
        }
        sendJson(res, 200, {
          content: [{ type: "text", text: JSON.stringify(result.data ?? {}).slice(0, 8000) }],
        }, parsed.id);
      } catch (err) {
        log.warn("mcp request failed", { error: err instanceof Error ? err.message : "unknown" });
        try {
          sendJson(res, 500, { code: -32603, message: "internal error" }, null);
        } catch {
          /* closed */
        }
      }
    })();
  });
  await new Promise((resolve, reject) => {
    srv.once("error", reject);
    // Loopback-only: never 0.0.0.0.
    srv.listen(cfg.port, "127.0.0.1", () => resolve());
  });
  server = srv;
  serverApp = app;
  log.info("mcp server listening", { port: cfg.port, tools: exposed.length });
  return { ok: true, port: cfg.port, tools: exposed };
}

export function stopMcpServer() {
  if (server) {
    try {
      server.close();
    } catch {
      /* ignore */
    }
    server = null;
    serverApp = null;
  }
  return { ok: true };
}

export function mcpServerStatus() {
  return { running: Boolean(server) };
}
