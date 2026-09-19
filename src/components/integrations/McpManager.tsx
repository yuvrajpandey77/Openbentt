/**
 * Phase 7 — Settings → MCP manager.
 * Lists configured servers with status/tools/resources/permissions/risk,
 * enable/disable, remove, inspect. No silent trust: unknown servers are
 * never auto-trusted and disabled servers never execute.
 */
import { useCallback, useEffect, useState } from "react";
import { mcpApi, type McpServerView } from "@/lib/connectors/connectorAuthApi";

export function McpManager() {
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ id: "", name: "", transport: "streamable-http", endpoint: "", allowedTools: "" });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setServers(await mcpApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MCP servers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async () => {
    setError(null);
    try {
      await mcpApi.add({
        id: form.id.trim(),
        name: form.name.trim(),
        transport: form.transport,
        endpoint: form.endpoint.trim(),
        enabled: true,
        ...(form.allowedTools.trim()
          ? { allowedTools: form.allowedTools.split(",").map((t) => t.trim()).filter(Boolean) }
          : {}),
      });
      setForm({ id: "", name: "", transport: "streamable-http", endpoint: "", allowedTools: "" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add server.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">MCP servers</h3>
        <p className="text-xs text-muted-foreground">
          MCP tools execute only through Openbentt policy (registry → policy → executor → audit). Remote servers must
          use HTTPS on an operator-allowlisted host; local servers must be on the stdio allowlist. See{" "}
          <span className="font-mono">docs/OPENBENTT_PHASE_7_MCP.md</span>.
        </p>
      </div>
      {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="grid gap-2">
        {servers.map((s) => (
          <div key={s.id} className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{s.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.enabled ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                {s.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {s.id} · {s.transport} · {s.endpoint}
            </p>
            {s.allowedTools && <p className="mt-1 text-[11px] text-muted-foreground">Tools: {s.allowedTools.join(", ")}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void mcpApi.setEnabled(s.id, !s.enabled).then(() => void refresh()).catch((e) => setError(e instanceof Error ? e.message : "Failed."))}
                className="rounded-lg border px-2.5 py-1.5 text-xs"
              >
                {s.enabled ? "Disable" : "Enable"}
              </button>
              {confirmRemove === s.id ? (
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void mcpApi.remove(s.id).then(() => { setConfirmRemove(null); void refresh(); }).catch((e) => setError(e instanceof Error ? e.message : "Failed."))}
                    className="rounded-lg bg-destructive px-2.5 py-1.5 text-xs font-medium text-destructive-foreground"
                  >
                    Confirm remove
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(null)} className="rounded-lg border px-2.5 py-1.5 text-xs">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(s.id)}
                  className="rounded-lg border border-destructive/50 px-2.5 py-1.5 text-xs text-destructive"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
        {servers.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground">No MCP servers configured.</p>
        )}
      </div>
      <div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
        <h4 className="text-xs font-semibold">Add server</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input aria-label="Server id" placeholder="server-id (a-z, 0-9, -, _)" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} className="rounded-lg border bg-background px-2.5 py-1.5 text-xs" />
          <input aria-label="Server name" placeholder="Display name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border bg-background px-2.5 py-1.5 text-xs" />
          <select aria-label="Transport" value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value })} className="rounded-lg border bg-background px-2.5 py-1.5 text-xs">
            <option value="streamable-http">streamable-http (https, allowlisted)</option>
            <option value="stdio-local">stdio-local (allowlisted command)</option>
          </select>
          <input aria-label="Endpoint" placeholder="https://… or /path/to/server" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} className="rounded-lg border bg-background px-2.5 py-1.5 text-xs" />
          <input aria-label="Allowed tools" placeholder="Allowed tools (comma-separated, optional)" value={form.allowedTools} onChange={(e) => setForm({ ...form, allowedTools: e.target.value })} className="rounded-lg border bg-background px-2.5 py-1.5 text-xs sm:col-span-2" />
        </div>
        <button type="button" onClick={() => void add()} className="mt-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
          Add server
        </button>
      </div>
    </div>
  );
}
