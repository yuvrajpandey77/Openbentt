/**
 * Phase 7 — Renderer enterprise auth + MCP API (metadata only).
 * Desktop IPC on the existing openbenttResearch bridge; token values never
 * cross IPC and never enter renderer state. Web fallback reports
 * DISCONNECTED (OAuth requires the desktop vault) — honestly, not faked.
 */

export interface ConnectionStatusView {
  connectorId: string;
  hasToken: boolean;
  expired?: boolean;
  accountLabel?: string;
  scopes: string[];
  expiresAt?: number;
  verifiedAt?: string;
  connected: boolean;
  needsReauth: boolean;
  encryptionAvailable?: boolean;
  fallback?: boolean;
  lastError?: string;
}

function authBridge(): { connectorAuth: (op: string, payload?: unknown) => Promise<unknown> } | undefined {
  try {
    const w = window as unknown as {
      openbenttResearch?: { connectorAuth?: (op: string, payload?: unknown) => Promise<unknown> };
    };
    return w.openbenttResearch?.connectorAuth ? { connectorAuth: w.openbenttResearch.connectorAuth } : undefined;
  } catch {
    return undefined;
  }
}

function mcpBridge(): { mcp: (op: string, payload?: unknown) => Promise<unknown> } | undefined {
  try {
    const w = window as unknown as {
      openbenttResearch?: { mcp?: (op: string, payload?: unknown) => Promise<unknown> };
    };
    return w.openbenttResearch?.mcp ? { mcp: w.openbenttResearch.mcp } : undefined;
  } catch {
    return undefined;
  }
}

export function hasConnectorAuthDesktopApi(): boolean {
  return Boolean(authBridge());
}

export function hasMcpDesktopApi(): boolean {
  return Boolean(mcpBridge());
}

export const connectorAuthApi = {
  status(connectorId: string): Promise<ConnectionStatusView> {
    const b = authBridge();
    if (b) return b.connectorAuth("status", { connectorId }) as Promise<ConnectionStatusView>;
    return Promise.resolve({
      connectorId,
      hasToken: false,
      scopes: [],
      connected: false,
      needsReauth: false,
      lastError: "Desktop app required for OAuth connections.",
    });
  },
  beginOAuth(
    connectorId: string, projectId?: string, mode?: "read" | "actions"
  ): Promise<{ authorizeUrl: string; state: string }> {
    const b = authBridge();
    if (!b) return Promise.reject(new Error("Desktop app required for OAuth connections."));
    return b.connectorAuth("beginOAuth", { connectorId, projectId, mode }) as Promise<{
      authorizeUrl: string;
      state: string;
    }>;
  },
  disconnect(connectorId: string): Promise<{ ok: boolean }> {
    const b = authBridge();
    if (!b) return Promise.reject(new Error("Desktop app required."));
    return b.connectorAuth("disconnect", { connectorId }) as Promise<{ ok: boolean }>;
  },
  connectionMeta(connectorId: string): Promise<Record<string, unknown>> {
    const b = authBridge();
    if (!b) return Promise.resolve({ connectorId, status: "DISCONNECTED" });
    try {
      const w = window as unknown as {
        openbenttResearch?: { connectors?: (op: string, payload?: unknown) => Promise<unknown> };
      };
      if (!w.openbenttResearch?.connectors) return Promise.resolve({ connectorId, status: "DISCONNECTED" });
      return w.openbenttResearch.connectors("connectionMeta", { connectorId }) as Promise<Record<string, unknown>>;
    } catch {
      return Promise.resolve({ connectorId, status: "DISCONNECTED" });
    }
  },
};

export interface McpServerView {
  id: string;
  name: string;
  transport: string;
  endpoint: string;
  enabled: boolean;
  allowedTools?: string[];
}

export const mcpApi = {
  list(): Promise<McpServerView[]> {
    const b = mcpBridge();
    if (!b) return Promise.resolve([]);
    return b.mcp("list") as Promise<McpServerView[]>;
  },
  add(config: Record<string, unknown>): Promise<McpServerView> {
    const b = mcpBridge();
    if (!b) return Promise.reject(new Error("Desktop app required for MCP servers."));
    return b.mcp("add", { config }) as Promise<McpServerView>;
  },
  remove(serverId: string): Promise<{ ok: boolean }> {
    const b = mcpBridge();
    if (!b) return Promise.reject(new Error("Desktop app required."));
    return b.mcp("remove", { serverId }) as Promise<{ ok: boolean }>;
  },
  setEnabled(serverId: string, enabled: boolean): Promise<{ ok: boolean }> {
    const b = mcpBridge();
    if (!b) return Promise.reject(new Error("Desktop app required."));
    return b.mcp("setEnabled", { serverId, enabled }) as Promise<{ ok: boolean }>;
  },
  setToken(serverId: string, token: string): Promise<{ ok: boolean }> {
    const b = mcpBridge();
    if (!b) return Promise.reject(new Error("Desktop app required."));
    return b.mcp("setToken", { serverId, token }) as Promise<{ ok: boolean }>;
  },
};
