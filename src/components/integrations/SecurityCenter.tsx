/**
 * Phase 7 — Settings → Security / Data Access.
 * Answers "What can Openbentt access?": integrations, scopes, MCP servers,
 * local storage, sync state, audit counts. Metadata only — no secrets.
 */
import { useEffect, useState } from "react";
import { connectorAuthApi, mcpApi, type ConnectionStatusView, type McpServerView } from "@/lib/connectors/connectorAuthApi";
import { toolApi } from "@/lib/tools/toolApi";

const TIER_1 = ["google-drive", "gmail", "google-calendar", "slack", "github", "notion"];

export function SecurityCenter() {
  const [statuses, setStatuses] = useState<ConnectionStatusView[]>([]);
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [auditRows, setAuditRows] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows: ConnectionStatusView[] = [];
      for (const id of TIER_1) {
        try {
          rows.push(await connectorAuthApi.status(id));
        } catch {
          rows.push({ connectorId: id, hasToken: false, scopes: [], connected: false, needsReauth: false });
        }
      }
      if (!cancelled) setStatuses(rows);
      try {
        const list = await mcpApi.list();
        if (!cancelled) setServers(list);
      } catch {
        /* web: no MCP */
      }
      try {
        const audit = await toolApi.audit({ limit: 1 });
        if (!cancelled) setAuditRows(audit.length);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connected = statuses.filter((s) => s.connected);
  return (
    <div className="space-y-4 text-xs">
      <section className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
        <h4 className="text-sm font-semibold">Data access</h4>
        <p className="mt-1 text-muted-foreground">
          {connected.length === 0
            ? "Openbentt currently has no external integrations connected. Only local documents and knowledge are used."
            : `Connected: ${connected.map((c) => `${c.connectorId}${c.accountLabel ? ` (${c.accountLabel})` : ""}`).join(", ")}.`}
        </p>
        <ul className="mt-2 space-y-1">
          {statuses.map((s) => (
            <li key={s.connectorId} className="flex justify-between gap-2">
              <span className="font-mono text-[11px]">{s.connectorId}</span>
              <span className="text-muted-foreground">
                {s.connected ? `connected · ${(s.scopes ?? []).length} scope(s)` : "not connected"}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
        <h4 className="text-sm font-semibold">Active MCP servers</h4>
        {servers.filter((s) => s.enabled).length === 0 ? (
          <p className="mt-1 text-muted-foreground">None enabled.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {servers.filter((s) => s.enabled).map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span className="font-mono text-[11px]">{s.id}</span>
                <span className="text-muted-foreground">{s.transport}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
        <h4 className="text-sm font-semibold">Local storage & audit</h4>
        <p className="mt-1 text-muted-foreground">
          Documents, knowledge, and indexes stay on this device. OAuth/MCP tokens use the OS vault
          (userData/.secrets/, 0600). {auditRows !== null ? `Audit ledger reachable (${auditRows > 0 ? "events present" : "no events yet"}).` : ""}
        </p>
      </section>
    </div>
  );
}
