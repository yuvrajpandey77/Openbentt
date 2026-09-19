/**
 * Phase 8 — MCP server exposure policy (single source of truth, deterministic).
 * Plain JS shared by the Electron MCP server and UI. No network, no secrets.
 *
 * Rules:
 * - Only registered tools can be exposed; the exposed set is configured by
 *   the user from READ-ONLY tools. Write/mutating tools are NEVER exposed:
 *   external MCP clients cannot supply trusted-UI confirmation.
 * - Server is OFF by default, loopback-only, bearer-authenticated.
 */

export const MCP_SERVER_DEFAULT_PORT = 3877;
export const MCP_SERVER_RATE_LIMIT_PER_MINUTE = 60;

/** Read-only tool ids eligible for exposure (mirrors toolCore registry). */
export const MCP_EXPOSABLE_TOOL_IDS = [
  "knowledge.search",
  "knowledge.get_entity",
  "knowledge.get_relationships",
  "knowledge.get_evidence",
  "document.search",
  "document.get",
  "document.inspect",
  "connector.list",
  "connector.get",
  "connector.preview",
  "connector.search",
  "connector.unified_search",
  "project.get",
  "export.create",
  "utility.calculate",
];

export function isExposableTool(tool) {
  if (!tool || typeof tool.id !== "string") return false;
  if (!MCP_EXPOSABLE_TOOL_IDS.includes(tool.id)) return false;
  if (tool.mutation === true) return false;
  if (tool.permission !== "READ_ONLY") return false;
  return true;
}

/**
 * Intersect user-configured allowlist with the exposable set.
 * Unknown or non-read-only entries are dropped (fail closed).
 */
export function resolveExposedTools(configured, registry) {
  const wanted = new Set(Array.isArray(configured) ? configured : []);
  const out = [];
  for (const tool of registry ?? []) {
    if (wanted.has(tool.id) && isExposableTool(tool)) out.push(tool.id);
  }
  return out;
}

export function validateServerConfig(raw) {
  if (!raw || typeof raw !== "object") return "config must be an object";
  if (raw.port !== undefined) {
    const p = Number(raw.port);
    if (!Number.isInteger(p) || p < 1024 || p > 65535) return "port must be 1024–65535";
  }
  if (raw.allowedTools !== undefined) {
    if (!Array.isArray(raw.allowedTools)) return "allowedTools must be an array";
    for (const t of raw.allowedTools) {
      if (typeof t !== "string" || !MCP_EXPOSABLE_TOOL_IDS.includes(t)) {
        return `tool not exposable: ${String(t).slice(0, 80)}`;
      }
    }
  }
  return null;
}

/** Constant-time bearer comparison (both sides already hashed upstream). */
export function bearerMatches(provided, expected) {
  const a = String(provided ?? "");
  const b = String(expected ?? "");
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseJsonRpc(raw) {
  let body;
  try {
    body = JSON.parse(String(raw ?? ""));
  } catch {
    return { error: "invalid JSON" };
  }
  if (!body || typeof body !== "object") return { error: "invalid request" };
  if (body.jsonrpc !== "2.0") return { error: "jsonrpc 2.0 required", id: body.id ?? null };
  if (body.method !== "tools/list" && body.method !== "tools/call") {
    return { error: "unknown method", id: body.id ?? null };
  }
  return { id: body.id ?? null, method: body.method, params: body.params ?? {} };
}
