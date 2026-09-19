/**
 * Phase 8 — Renderer MCP-server API (opt-in exposure management).
 * The bearer token is returned ONCE on rotate for the user to copy;
 * it is never stored in renderer state longer than the display.
 */

export interface McpServerStatus {
  enabled: boolean;
  port: number;
  allowedTools: string[];
  running: boolean;
}

function bridge(): { mcpserver: (op: string, payload?: unknown) => Promise<unknown> } | undefined {
  try {
    const w = window as unknown as {
      openbenttResearch?: { mcpserver?: (op: string, payload?: unknown) => Promise<unknown> };
    };
    return w.openbenttResearch?.mcpserver ? { mcpserver: w.openbenttResearch.mcpserver } : undefined;
  } catch {
    return undefined;
  }
}

export function hasMcpServerDesktopApi(): boolean {
  return Boolean(bridge());
}

function needDesktop(): Promise<never> {
  return Promise.reject(new Error("MCP server management requires the desktop app."));
}

export const mcpServerApi = {
  status(): Promise<McpServerStatus> {
    const b = bridge();
    if (!b) return Promise.resolve({ enabled: false, port: 3877, allowedTools: [], running: false });
    return b.mcpserver("status") as Promise<McpServerStatus>;
  },
  configure(patch: { enabled?: boolean; port?: number; allowedTools?: string[] }): Promise<McpServerStatus> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.mcpserver("configure", patch) as Promise<McpServerStatus>;
  },
  rotateToken(): Promise<{ token: string }> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.mcpserver("rotateToken") as Promise<{ token: string }>;
  },
  start(): Promise<{ ok: boolean; port: number; tools: string[] }> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.mcpserver("start") as Promise<{ ok: boolean; port: number; tools: string[] }>;
  },
  stop(): Promise<{ ok: boolean }> {
    const b = bridge();
    if (!b) return needDesktop();
    return b.mcpserver("stop") as Promise<{ ok: boolean }>;
  },
};
