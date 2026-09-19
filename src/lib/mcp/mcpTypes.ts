/**
 * Phase 7 — MCP type model (protocol-neutral, no transport here).
 * Model Context Protocol: JSON-RPC 2.0 messages for tools/resources.
 * This module is pure types + validation. Transport lives in mcpClient;
 * policy mapping lives in mcpAdapter; network guards in mcpSecurity.
 */

export type McpTransport = "streamable-http" | "stdio-local";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  /** HTTPS URL for streamable-http; command for stdio-local (main-process only). */
  endpoint: string;
  enabled: boolean;
  allowedTools?: string[];
  authHeaderName?: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name?: string;
  mimeType?: string;
}

export interface McpServerStatus {
  id: string;
  name: string;
  transport: McpTransport;
  enabled: boolean;
  connectionState: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
  toolCount?: number;
  resourceCount?: number;
  lastError?: string;
  lastCheckedAt?: string;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function validateServerConfig(raw: unknown): McpServerConfig {
  if (!raw || typeof raw !== "object") throw new Error("invalid-mcp-config");
  const c = raw as Record<string, unknown>;
  const id = String(c.id ?? "").trim();
  const name = String(c.name ?? "").trim().slice(0, 128);
  const transport = c.transport;
  const endpoint = String(c.endpoint ?? "").trim().slice(0, 2000);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("invalid-mcp-id");
  if (!name) throw new Error("invalid-mcp-name");
  if (transport !== "streamable-http" && transport !== "stdio-local") throw new Error("invalid-mcp-transport");
  if (!endpoint) throw new Error("invalid-mcp-endpoint");
  if (transport === "streamable-http") {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new Error("invalid-mcp-endpoint");
    }
    if (parsed.protocol !== "https:") throw new Error("mcp-https-only");
  }
  if (Array.isArray(c.allowedTools)) {
    for (const t of c.allowedTools) {
      if (typeof t !== "string" || !/^[a-zA-Z0-9_.-]{1,128}$/.test(t)) throw new Error("invalid-mcp-tool-allowlist");
    }
  }
  return {
    id,
    name,
    transport,
    endpoint,
    enabled: c.enabled !== false,
    allowedTools: Array.isArray(c.allowedTools) ? (c.allowedTools as string[]) : undefined,
    authHeaderName: typeof c.authHeaderName === "string" ? c.authHeaderName.slice(0, 64) : undefined,
  };
}

export function sanitizeMcpText(raw: unknown, max = 2000): string {
  // Strip ASCII control characters without a literal control-range regex
  // (lint-clean): iterate code points instead.
  const s = String(raw ?? "");
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 32;
    out += code < 32 || code === 127 ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, max);
}
