/**
 * Phase 7 — MCP client (JSON-RPC 2.0 over Streamable HTTP).
 *
 * Real MCP protocol framing: initialize → notifications/initialized →
 * tools.list / resources.list / tools.call / resources.read, with
 * per-request timeouts, size caps, allowlisted HTTPS endpoints.
 * stdio-local transport is executed ONLY by the main process
 * (electron/mcpStore.mjs spawns the allowlisted command); this module
 * implements the HTTP transport usable from either runtime with an
 * injected fetch.
 *
 * Protocol reference: https://modelcontextprotocol.io (JSON-RPC 2.0).
 */
import type {
  JsonRpcResponse,
  McpResource,
  McpServerConfig,
  McpTool,
} from "@/lib/mcp/mcpTypes";
import { MCP_MAX_RESOURCES, MCP_MAX_RESPONSE_BYTES, MCP_MAX_TOOLS, MCP_TIMEOUT_MS } from "@/lib/mcp/mcpSecurity";

export type McpFetch = (url: string, init?: RequestInit) => Promise<Response>;

const MCP_PROTOCOL_VERSION = "2025-06-18";

let rpcId = 0;
function nextId(): number {
  rpcId += 1;
  return rpcId;
}

function rpcBody(method: string, params?: Record<string, unknown>) {
  return JSON.stringify({ jsonrpc: "2.0", id: nextId(), method, params: params ?? {} });
}

async function postRpc(
  config: McpServerConfig,
  fetchImpl: McpFetch,
  method: string,
  params: Record<string, unknown> | undefined,
  authToken: string | undefined,
  opts?: { timeoutMs?: number }
): Promise<unknown> {
  const timeoutMs = opts?.timeoutMs ?? MCP_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(config.endpoint, {
      method: "POST",
      signal: ctrl.signal,
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: rpcBody(method, params),
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error)?.name === "AbortError") throw new Error("mcp-timeout");
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
  // Streamable HTTP may return SSE; accept a single JSON object or the last
  // data: line of an event stream (bounded, deterministic).
  let payload = text;
  if (text.startsWith("event:") || text.includes("\ndata:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    if (lines.length === 0) throw new Error("mcp-invalid-response");
    payload = lines[lines.length - 1].slice(5).trim();
  }
  let parsed: JsonRpcResponse;
  try {
    parsed = JSON.parse(payload) as JsonRpcResponse;
  } catch {
    throw new Error("mcp-invalid-response");
  }
  if (parsed?.error) throw new Error(`mcp-error:${String(parsed.error.message ?? parsed.error.code).slice(0, 120)}`);
  return parsed?.result;
}

export async function mcpInitialize(
  config: McpServerConfig,
  fetchImpl: McpFetch,
  authToken?: string,
  opts?: { timeoutMs?: number }
): Promise<{ serverName?: string }> {
  const result = (await postRpc(
    config,
    fetchImpl,
    "initialize",
    {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {}, resources: {} },
      clientInfo: { name: "openbentt", version: "2.2.5" },
    },
    authToken,
    opts
  )) as { serverInfo?: { name?: string } };
  // Best-effort initialized notification (failure is non-fatal).
  try {
    await postRpc(config, fetchImpl, "notifications/initialized", {}, authToken, opts);
  } catch {
    /* non-fatal */
  }
  return { serverName: result?.serverInfo?.name };
}

export async function mcpListTools(
  config: McpServerConfig,
  fetchImpl: McpFetch,
  authToken?: string,
  opts?: { timeoutMs?: number }
): Promise<McpTool[]> {
  const result = (await postRpc(config, fetchImpl, "tools/list", {}, authToken, opts)) as {
    tools?: McpTool[];
  };
  const tools = Array.isArray(result?.tools) ? result.tools : [];
  return tools.slice(0, MCP_MAX_TOOLS).map((t) => ({
    name: String(t?.name ?? "").slice(0, 128),
    description: typeof t?.description === "string" ? t.description.slice(0, 1000) : undefined,
    inputSchema:
      t?.inputSchema && typeof t.inputSchema === "object"
        ? (t.inputSchema as Record<string, unknown>)
        : { type: "object" },
  }));
}

export async function mcpListResources(
  config: McpServerConfig,
  fetchImpl: McpFetch,
  authToken?: string,
  opts?: { timeoutMs?: number }
): Promise<McpResource[]> {
  const result = (await postRpc(config, fetchImpl, "resources/list", {}, authToken, opts)) as {
    resources?: McpResource[];
  };
  const resources = Array.isArray(result?.resources) ? result.resources : [];
  return resources.slice(0, MCP_MAX_RESOURCES).map((r) => ({
    uri: String(r?.uri ?? "").slice(0, 2000),
    name: typeof r?.name === "string" ? r.name.slice(0, 256) : undefined,
    mimeType: typeof r?.mimeType === "string" ? r.mimeType.slice(0, 128) : undefined,
  }));
}

export async function mcpCallTool(
  config: McpServerConfig,
  fetchImpl: McpFetch,
  toolName: string,
  args: Record<string, unknown>,
  authToken?: string,
  opts?: { timeoutMs?: number }
): Promise<unknown> {
  if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(toolName)) throw new Error("mcp-unknown-tool");
  const bounded = JSON.parse(JSON.stringify(args ?? {}).slice(0, 20000)) as Record<string, unknown>;
  const result = await postRpc(config, fetchImpl, "tools/call", { name: toolName, arguments: bounded }, authToken, opts);
  return result;
}

export async function mcpReadResource(
  config: McpServerConfig,
  fetchImpl: McpFetch,
  uri: string,
  authToken?: string,
  opts?: { timeoutMs?: number }
): Promise<unknown> {
  if (!uri || uri.length > 2000) throw new Error("mcp-invalid-uri");
  const result = await postRpc(config, fetchImpl, "resources/read", { uri }, authToken, opts);
  return result;
}
