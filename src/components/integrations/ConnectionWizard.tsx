/**
 * Phase 7 — Reusable connection wizard:
 * 1 choose → 2 explain access → 3 permissions → 4 connect → 5 OAuth →
 * 6 verify → 7 sync scope → done. Users always see what is requested.
 */
import { useState } from "react";
import { connectorAuthApi } from "@/lib/connectors/connectorAuthApi";
import { getEnterpriseMeta } from "@/lib/connectors/enterpriseConnectors";

interface Props {
  connectorId: string;
  onDone: () => void;
  onCancel: () => void;
  /**
   * Phase 8: "actions" requests incremental write scopes for controlled
   * actions behind explicit consent. Every action still needs per-action
   * approval; this grant only makes actions proposable.
   */
  mode?: "read" | "actions";
}

const STEPS = ["Access", "Permissions", "Connect", "Verify", "Sync scope", "Done"] as const;

export function ConnectionWizard({ connectorId, onDone, onCancel, mode = "read" }: Props) {
  const actionsMode = mode === "actions";
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  let meta;
  try {
    meta = getEnterpriseMeta(connectorId);
  } catch {
    meta = undefined;
  }

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { authorizeUrl } = await connectorAuthApi.beginOAuth(
        connectorId, undefined, actionsMode ? "actions" : "read"
      );
      // OS browser for the provider consent screen (never an embedded
      // renderer webview holding the session).
      const w = window as unknown as { openbenttDesktop?: { openExternal?: (url: string) => Promise<unknown> } };
      if (w.openbenttDesktop?.openExternal) {
        await w.openbenttDesktop.openExternal(authorizeUrl);
      } else {
        window.open(authorizeUrl, "_blank", "noopener");
      }
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed to start.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const st = await connectorAuthApi.status(connectorId);
      if (st.connected) {
        setAccountLabel(st.accountLabel ?? null);
        setStep(5);
      } else {
        setError(
          st.lastError ??
            "Not connected yet. Complete the provider consent in the browser, then press Verify again."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-4 shadow-sm" role="dialog" aria-label={`Connect ${meta?.name ?? connectorId}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {actionsMode ? `Enable actions for ${meta?.name ?? connectorId}` : `Connect ${meta?.name ?? connectorId}`}
        </h3>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:underline">
          Cancel
        </button>
      </div>
      <ol className="mt-2 flex flex-wrap gap-1.5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${i <= step ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="mt-3 text-xs">
        {step <= 1 && (
          <>
            <p className="text-muted-foreground">
              {actionsMode ? (
                <>
                  {meta?.name} will be able to perform <strong>controlled actions with your per-action approval</strong>:
                  drafts, sends, issues, events, and pages — each shown for exact review before anything executes.
                  Nothing runs without an explicit approval bound to the exact action.
                </>
              ) : (
                <>
                  {meta?.name} will be used as a <strong>read-only</strong> knowledge source: search, preview, and import
                  with provenance. Openbentt will never send, modify, or delete provider data without the actions grant.
                </>
              )}
            </p>
            <p className="mt-2 font-medium">Requested permissions:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 font-mono text-[10px]">
              {(meta?.scopes ?? []).map((s) => (
                <li key={s}>{s}</li>
              ))}
              {actionsMode && (meta?.deferredWriteScopes ?? []).map((s) => (
                <li key={s} className="font-semibold">{s} (actions)</li>
              ))}
            </ul>
            {meta && meta.deferredWriteScopes.length > 0 && !actionsMode && (
              <p className="mt-2 text-muted-foreground">
                NOT requested: <span className="font-mono text-[10px]">{meta.deferredWriteScopes.join(", ")}</span>
              </p>
            )}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
              >
                Continue
              </button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="text-muted-foreground">
              Your browser will open the provider consent screen. Openbentt receives only an access token, stored in
              the desktop OS vault — never shown to the AI model.
            </p>
            <div className="mt-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void connect()}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Opening…" : "Connect in browser"}
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <p className="text-muted-foreground">
              Approve access in the browser window, then return here and press Verify. Openbentt confirms the
              connection with a real provider request — nothing is marked connected before that succeeds.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void verify()}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Verifying…" : "Verify connection"}
              </button>
            </div>
          </>
        )}
        {step >= 4 && (
          <>
            <p>
              Sync scope: <strong>manual + on-demand search</strong>. No background sync runs without your action.
              {accountLabel ? (
                <>
                  {" "}Connected as <strong>{accountLabel}</strong>.
                </>
              ) : null}
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={onDone}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
              >
                Finish
              </button>
            </div>
          </>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
