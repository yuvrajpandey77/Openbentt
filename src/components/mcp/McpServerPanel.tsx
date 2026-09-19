/**
 * Phase 8 — MCP server exposure management (opt-in, OFF by default).
 * Read-only tools only; bearer token shown ONCE on rotation.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { mcpServerApi, type McpServerStatus } from "@/lib/mcp/mcpServerApi";
import { MCP_EXPOSABLE_TOOL_IDS } from "@/lib/mcp/mcpServerCore.mjs";

export function McpServerPanel() {
  const [status, setStatus] = useState<McpServerStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [port, setPort] = useState(3877);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const s = await mcpServerApi.status();
      setStatus(s);
      setPort(s.port);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load MCP server status");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <p className="text-sm text-muted-foreground">{error ?? "Loading MCP server…"}</p>;

  const toggleTool = (id: string, on: boolean) => {
    const next = on ? [...status.allowedTools, id] : status.allowedTools.filter((t) => t !== id);
    void act(() => mcpServerApi.configure({ allowedTools: next }));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Expose approved read-only tools to external MCP clients on loopback only. Write tools can never be
        exposed — external clients cannot supply trusted-UI confirmation.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span>Openbentt MCP server</span>
            {status.running ? <Badge>Running</Badge> : <Badge variant="outline">Stopped</Badge>}
            {status.enabled ? <Badge variant="outline">Enabled</Badge> : <Badge variant="secondary">Disabled</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <Switch
              checked={status.enabled}
              disabled={busy}
              onCheckedChange={(v) => void act(() => mcpServerApi.configure({ enabled: v }))}
            />
            <span className="text-muted-foreground">Enabled (opt-in)</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Port</span>
            <Input
              type="number" min={1024} max={65535} className="w-24" defaultValue={port}
              key={port} disabled={busy}
              onBlur={(e) => {
                const p = Number(e.target.value);
                if (Number.isInteger(p) && p >= 1024 && p <= 65535) void act(() => mcpServerApi.configure({ port: p }));
              }}
            />
          </label>
          <span className="ml-auto flex gap-2">
            <Button
              size="sm" variant="outline" disabled={busy}
              onClick={() => void act(async () => {
                const r = await mcpServerApi.rotateToken();
                setToken(r.token);
              })}
            >
              Rotate token
            </Button>
            {status.running ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => mcpServerApi.stop())}>
                Stop
              </Button>
            ) : (
              <Button size="sm" disabled={busy || !status.enabled} onClick={() => void act(() => mcpServerApi.start())}>
                Start on 127.0.0.1
              </Button>
            )}
          </span>
        </CardContent>
      </Card>
      {token && (
        <Card className="border-amber-500/40">
          <CardContent className="space-y-1 pt-4 text-sm">
            <p className="font-semibold">Bearer token (shown once — copy now):</p>
            <p className="break-all font-mono text-xs">{token}</p>
            <Button size="sm" variant="outline" onClick={() => setToken(null)}>Hide</Button>
          </CardContent>
        </Card>
      )}
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Exposed tools (read-only only)</h4>
        {MCP_EXPOSABLE_TOOL_IDS.map((id) => (
          <label key={id} className="flex items-center gap-2 text-sm">
            <Switch checked={status.allowedTools.includes(id)} disabled={busy} onCheckedChange={(v) => toggleTool(id, v)} />
            <span className="font-mono text-xs">{id}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
