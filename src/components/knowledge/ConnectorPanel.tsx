/**
 * Phase 4 — Minimal connector panel (additive).
 * Shows connector status/capabilities/last sync; supports DOI lookup via the
 * Crossref connector boundary followed by dry-run → import into knowledge.
 * No marketplace, no dashboards, no new routes.
 */
import { useCallback, useEffect, useState } from "react";
import { connectorApi } from "@/lib/connectors/connectorApi";
import { listConnectorDefinitions } from "@/lib/connectors/connectorRegistry";
import { crossrefFetchItem } from "@/lib/connectors/crossrefConnector";
import type {
  ConnectorDefinition,
  DryRunResult,
  ExternalItem,
  ImportResult,
  SyncState,
} from "@/lib/connectors/connectorTypes";

interface Row {
  def: ConnectorDefinition;
  sync: SyncState | null;
}

export function ConnectorPanel({ projectId }: { projectId?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [doi, setDoi] = useState("");
  const [staged, setStaged] = useState<ExternalItem | null>(null);
  const [dry, setDry] = useState<DryRunResult | null>(null);
  const [last, setLast] = useState<ImportResult | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const registry = listConnectorDefinitions();
      const withSync = await Promise.all(
        registry.map(async (def) => ({ def, sync: await connectorApi.syncStatus(def.id).catch(() => null) }))
      );
      setRows(withSync);
    } catch {
      setError("Connector status unavailable.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const lookup = useCallback(async () => {
    if (!doi.trim() || loading) return;
    setLoading(true);
    setError(null);
    setStaged(null);
    setDry(null);
    try {
      setStaged(await crossrefFetchItem(doi.trim()));
    } catch {
      setError("Crossref lookup failed.");
    } finally {
      setLoading(false);
    }
  }, [doi, loading]);

  const runDryRun = useCallback(async () => {
    if (!staged) return;
    setLoading(true);
    setError(null);
    try {
      setDry(await connectorApi.dryRun([staged], { projectId }));
    } catch {
      setError("Dry run failed.");
    } finally {
      setLoading(false);
    }
  }, [staged, projectId]);

  const runImport = useCallback(async () => {
    if (!staged) return;
    setLoading(true);
    setError(null);
    try {
      const res = await connectorApi.import([staged], { projectId });
      setLast(res);
      await refresh();
    } catch {
      setError("Import failed.");
    } finally {
      setLoading(false);
    }
  }, [staged, projectId, refresh]);

  return (
    <section aria-label="Connectors">
      <h3>Connectors</h3>
      {error ? <p role="alert">{error}</p> : null}
      <ul>
        {rows.map(({ def, sync }) => (
          <li key={def.id}>
            <strong>{def.name}</strong> · {sync?.status ?? "never_synced"}
            {" · "}
            Capabilities: {def.capabilities.join(", ")}
            {sync?.lastSuccessAt ? ` · Last sync: ${sync.lastSuccessAt}` : null}
          </li>
        ))}
      </ul>
      <div>
        <label htmlFor="connector-doi-input">Import from Crossref by DOI</label>
        <input
          id="connector-doi-input"
          type="text"
          value={doi}
          onChange={(e) => setDoi(e.target.value)}
          placeholder="10.xxxx/yyyy"
        />
        <button type="button" onClick={() => void lookup()} disabled={loading || !doi.trim()}>
          Look up
        </button>
      </div>
      {staged ? (
        <div aria-live="polite">
          <p>
            {staged.title ?? staged.externalId}
            {staged.authors.length ? ` — ${staged.authors.slice(0, 3).join(", ")}` : null}
          </p>
          <p>
            Provider: {staged.connectorId} · External ID: {staged.externalId}
            {staged.externalUrl ? ` · ${staged.externalUrl}` : null}
          </p>
          <button type="button" onClick={() => void runDryRun()} disabled={loading}>
            Dry run
          </button>{" "}
          <button type="button" onClick={() => void runImport()} disabled={loading}>
            Import
          </button>
        </div>
      ) : null}
      {loading ? <p aria-live="polite">Working…</p> : null}
      {dry ? (
        <div aria-live="polite">
          <h4>Dry run</h4>
          <p>
            Create: {dry.wouldCreate.length} · Update: {dry.wouldUpdate.length} · Skip:{" "}
            {dry.wouldSkip.length} · Conflicts: {dry.conflicts.length} · Errors:{" "}
            {dry.validationErrors.length}
          </p>
        </div>
      ) : null}
      {last ? (
        <div aria-live="polite">
          <h4>Last import</h4>
          <p>
            Created: {last.created.length} · Updated: {last.updated.length} · Unchanged:{" "}
            {last.unchanged.length} · Conflict: {last.items.filter((i) => i.status === "conflict").length}{" "}
            · Failed: {last.failed.length}
          </p>
        </div>
      ) : null}
    </section>
  );
}
