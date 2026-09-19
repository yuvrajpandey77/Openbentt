/**
 * Phase 7 — Connector detail screen: identity, status, scopes, sync,
 * counts, errors, reconnect / disconnect / sync-now (confirm-gated).
 */
import { useEffect, useState } from "react";
import { connectorAuthApi, type ConnectionStatusView } from "@/lib/connectors/connectorAuthApi";
import { getEnterpriseMeta } from "@/lib/connectors/enterpriseConnectors";
import { actionApi } from "@/lib/actions/actionApi";

interface Props {
  connectorId: string;
  status?: ConnectionStatusView;
  onBack: () => void;
  onConnect: () => void;
  onEnableActions?: () => void;
}

export function ConnectorDetail({ connectorId, status, onBack, onConnect, onEnableActions }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [hasWriteGrant, setHasWriteGrant] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    setHasWriteGrant(null);
    if (status?.connected) {
      actionApi.writeGrant(connectorId).then(
        (g) => { if (live) setHasWriteGrant(g.hasWriteGrant); },
        () => { if (live) setHasWriteGrant(false); }
      );
    }
    return () => { live = false; };
  }, [connectorId, status?.connected]);
  let meta;
  try {
    meta = getEnterpriseMeta(connectorId);
  } catch {
    meta = undefined;
  }

  const disconnect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await connectorAuthApi.disconnect(connectorId);
      setMessage("Disconnected. Indexed data is kept locally until you remove it; nothing was deleted remotely.");
      setConfirmDisconnect(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-xs text-primary hover:underline">
        ← Back to integrations
      </button>
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <h3 className="text-base font-semibold">{meta?.name ?? connectorId}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{meta?.description}</p>
        <dl className="mt-3 space-y-1.5 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium">{status?.connected ? "Connected" : status?.needsReauth ? "Needs reauthorization" : "Not connected"}</dd>
          </div>
          {status?.accountLabel && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Account</dt>
              <dd className="font-medium">{status.accountLabel}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Permissions</dt>
            <dd className="max-w-[60%] text-right font-mono text-[10px]">
              {(status?.scopes ?? meta?.scopes ?? []).join(", ") || "—"}
            </dd>
          </div>
          {status?.verifiedAt && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Last verified</dt>
              <dd>{new Date(status.verifiedAt).toLocaleString()}</dd>
            </div>
          )}
          {status?.lastError && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Error</dt>
              <dd className="text-amber-600">{status.lastError}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Token storage</dt>
            <dd>{status?.encryptionAvailable === false ? "Restricted file (no OS vault)" : "OS vault"}</dd>
          </div>
        </dl>
      </div>

      {status?.connected && hasWriteGrant === false && onEnableActions && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <p className="font-medium">Controlled actions are off for this connection.</p>
          <p className="mt-1 text-muted-foreground">
            Enable the actions grant to let agents propose drafts, sends, issues, events, and pages.
            Every action still requires your exact per-action approval.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onEnableActions}
            className="mt-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Enable actions…
          </button>
        </div>
      )}
      {status?.connected && hasWriteGrant === true && (
        <p className="text-xs text-emerald-600">Controlled actions enabled — every action needs your approval.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!status?.connected ? (
          <button
            type="button"
            onClick={onConnect}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
          >
            {status?.needsReauth ? "Reconnect" : "Connect"}
          </button>
        ) : (
          <>
            {!confirmDisconnect ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDisconnect(true)}
                className="rounded-lg border border-destructive/50 px-3 py-2 text-xs font-medium text-destructive"
              >
                Disconnect
              </button>
            ) : (
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void disconnect()}
                  className="rounded-lg bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground"
                >
                  Confirm disconnect
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDisconnect(false)}
                  className="rounded-lg border px-3 py-2 text-xs"
                >
                  Cancel
                </button>
              </span>
            )}
          </>
        )}
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      <p className="text-[11px] text-muted-foreground">
        Disconnecting removes the stored token and stops syncing. It never deletes data on the provider.
        Reference: <span className="font-mono">{meta?.docsUrl}</span>
      </p>
    </div>
  );
}
