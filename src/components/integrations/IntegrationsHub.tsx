/**
 * Phase 7 — Settings → Integrations hub.
 * Shows CONNECTED / AVAILABLE / NEEDS ATTENTION cards for Tier-1 providers.
 * Status comes from real main-process connection state (vault token +
 * verified provider request); never claimed from local UI state.
 */
import { useCallback, useEffect, useState } from "react";
import { connectorAuthApi, type ConnectionStatusView } from "@/lib/connectors/connectorAuthApi";
import { listEnterpriseMeta } from "@/lib/connectors/enterpriseConnectors";
import { ConnectorDetail } from "@/components/integrations/ConnectorDetail";
import { ConnectionWizard } from "@/components/integrations/ConnectionWizard";

const TIER_1 = ["google-drive", "gmail", "google-calendar", "slack", "github", "notion"];

function groupOf(status: ConnectionStatusView): "CONNECTED" | "NEEDS ATTENTION" | "AVAILABLE" {
  if (status.connected) return "CONNECTED";
  if (status.hasToken || status.needsReauth || status.lastError) return "NEEDS ATTENTION";
  return "AVAILABLE";
}

export function IntegrationsHub() {
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatusView>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [wizardFor, setWizardFor] = useState<string | null>(null);
  const [wizardMode, setWizardMode] = useState<"read" | "actions">("read");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next: Record<string, ConnectionStatusView> = {};
    for (const id of TIER_1) {
      try {
        next[id] = await connectorAuthApi.status(id);
      } catch {
        next[id] = { connectorId: id, hasToken: false, scopes: [], connected: false, needsReauth: false };
      }
    }
    setStatuses(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const groups: Record<string, typeof TIER_1> = { CONNECTED: [], "NEEDS ATTENTION": [], AVAILABLE: [] };
  for (const id of TIER_1) {
    const s = statuses[id];
    groups[s ? groupOf(s) : "AVAILABLE"].push(id);
  }
  const metaById = Object.fromEntries(listEnterpriseMeta().map((m) => [m.id, m]));

  if (selected) {
    return (
      <>
        {wizardFor && (
          <div className="mb-4">
            <ConnectionWizard
              connectorId={wizardFor}
              mode={wizardMode}
              onDone={() => {
                setWizardFor(null);
                setWizardMode("read");
                void refresh();
              }}
              onCancel={() => {
                setWizardFor(null);
                setWizardMode("read");
              }}
            />
          </div>
        )}
        <ConnectorDetail
          connectorId={selected}
          status={statuses[selected]}
          onBack={() => {
            setSelected(null);
            void refresh();
          }}
          onConnect={() => {
            setWizardMode("read");
            setWizardFor(selected);
          }}
          onEnableActions={() => {
            setWizardMode("actions");
            setWizardFor(selected);
          }}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {wizardFor && (
        <ConnectionWizard
          connectorId={wizardFor}
          mode={wizardMode}
          onDone={() => {
            setWizardFor(null);
            setWizardMode("read");
            void refresh();
          }}
          onCancel={() => {
            setWizardFor(null);
            setWizardMode("read");
          }}
        />
      )}
      {loading && <p className="text-sm text-muted-foreground">Checking connection state…</p>}
      {(["CONNECTED", "NEEDS ATTENTION", "AVAILABLE"] as const).map((group) => (
        <section key={group} aria-label={group}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h3>
          {groups[group].length === 0 && (
            <p className="text-xs text-muted-foreground">{group === "CONNECTED" ? "Nothing connected yet." : "—"}</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {groups[group].map((id) => {
              const meta = metaById[id];
              const st = statuses[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelected(id)}
                  className="rounded-xl border border-border/70 bg-card p-3 text-left shadow-sm transition hover:border-primary/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{meta?.name ?? id}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        group === "CONNECTED"
                          ? "bg-emerald-500/15 text-emerald-600"
                          : group === "NEEDS ATTENTION"
                            ? "bg-amber-500/15 text-amber-600"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {group === "CONNECTED" ? "Connected" : group === "NEEDS ATTENTION" ? "Needs attention" : "Not connected"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{meta?.description}</p>
                  {st?.accountLabel && <p className="mt-1 text-xs text-muted-foreground">{st.accountLabel}</p>}
                  {st?.lastError && group !== "CONNECTED" && (
                    <p className="mt-1 text-xs text-amber-600">{st.lastError}</p>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Connections start read-only. Controlled actions (drafts, sends, issues, events, pages) require the explicit
        actions grant plus your per-action approval. OAuth tokens are stored in the OS vault on desktop and never
        shown here.
      </p>
    </div>
  );
}
