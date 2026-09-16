/**
 * Phase 5 — Minimal tool panel (transparency + testing, not an agent UI).
 * Lists registered tools (description, category, risk, permission,
 * capabilities, version); per-tool: input JSON, validation, execution,
 * result, and audit status. No chat planner, no autonomous behavior.
 */
import { useCallback, useEffect, useState } from "react";
import { toolApi } from "@/lib/tools/toolApi";
import type {
  ToolAuditEvent,
  ToolDefinition,
  ToolResult,
} from "@/lib/tools/toolTypes";

export function ToolPanel({ projectId }: { projectId?: string }) {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [selected, setSelected] = useState<string>("knowledge.search");
  const [inputJson, setInputJson] = useState<string>('{"query": "", "limit": 5}');
  const [result, setResult] = useState<ToolResult | null>(null);
  const [audit, setAudit] = useState<ToolAuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const defs = await toolApi.list();
      setTools(defs);
      const events = await toolApi.audit({ limit: 10 });
      setAudit(events);
    } catch {
      setError("Tool registry unavailable.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(async () => {
    setError(null);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(inputJson);
    } catch {
      setError("Input is not valid JSON.");
      return;
    }
    setRunning(true);
    try {
      const res = await toolApi.execute(selected, parsed, {
        projectId,
        userInitiated: true,
        source: "tool-panel",
      });
      setResult(res);
      const events = await toolApi.audit({ limit: 10 });
      setAudit(events);
    } catch {
      setError("Tool execution failed.");
    } finally {
      setRunning(false);
    }
  }, [selected, inputJson, projectId]);

  const confirmAndRun = useCallback(async () => {
    setError(null);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(inputJson);
    } catch {
      setError("Input is not valid JSON.");
      return;
    }
    setRunning(true);
    try {
      const res = await toolApi.execute(selected, parsed, {
        projectId,
        userInitiated: true,
        userConfirmed: true,
        confirmedToolId: selected,
        source: "tool-panel",
      });
      setResult(res);
      const events = await toolApi.audit({ limit: 10 });
      setAudit(events);
    } catch {
      setError("Tool execution failed.");
    } finally {
      setRunning(false);
    }
  }, [selected, inputJson, projectId]);

  const def = tools.find((t) => t.id === selected);
  const needsConfirm = result && !result.ok && result.errorKind === "confirmation_required";

  return (
    <section aria-label="Tools">
      <h3>Tools</h3>
      {error ? <p role="alert">{error}</p> : null}
      <label htmlFor="tool-select">Tool</label>
      <select
        id="tool-select"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {tools.map((t) => (
          <option key={t.id} value={t.id}>
            {t.id} v{t.version} · {t.risk} · {t.permission}
          </option>
        ))}
      </select>
      {def ? (
        <div>
          <p>{def.description}</p>
          <p>
            Category: {def.category} · Capabilities: {def.capabilities.join(", ")}
            {def.mutation ? " · Mutates state" : null}
            {def.externalNetwork ? " · External network" : null}
          </p>
        </div>
      ) : null}
      <label htmlFor="tool-input">Input (JSON)</label>
      <textarea
        id="tool-input"
        value={inputJson}
        onChange={(e) => setInputJson(e.target.value)}
        rows={6}
      />
      <button type="button" onClick={() => void run()} disabled={running}>
        Execute
      </button>{" "}
      {needsConfirm ? (
        <button type="button" onClick={() => void confirmAndRun()} disabled={running}>
          Confirm and execute ({def?.risk} risk)
        </button>
      ) : null}
      {running ? <p aria-live="polite">Running…</p> : null}
      {result ? (
        <div aria-live="polite">
          <h4>Result</h4>
          <p>
            {result.ok ? "OK" : `Failed: ${result.error}`} · decision {result.decision} ·{" "}
            {result.durationMs}ms · request {result.requestId}
          </p>
          <pre>{JSON.stringify(result.data ?? null, null, 2).slice(0, 4000)}</pre>
        </div>
      ) : null}
      <div>
        <h4>Recent audit events</h4>
        <ul>
          {audit.map((e) => (
            <li key={e.eventId}>
              {e.toolId} · {e.status} · {e.decision} · {e.durationMs}ms
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
