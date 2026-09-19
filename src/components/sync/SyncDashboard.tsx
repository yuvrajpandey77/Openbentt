/**
 * Phase 8 — Settings → Sync: per-integration schedule, status, and history.
 * Background sync is OFF by default; enabling is an explicit user action.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { syncApi, type SyncConfigView } from "@/lib/sync/syncApi";
import { connectorAuthApi } from "@/lib/connectors/connectorAuthApi";

const LABELS: Record<string, string> = {
  "google-drive": "Google Drive",
  gmail: "Gmail",
  "google-calendar": "Google Calendar",
  slack: "Slack",
  github: "GitHub",
  notion: "Notion",
};

export function SyncDashboard() {
  const [configs, setConfigs] = useState<SyncConfigView[] | null>(null);
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const list = await syncApi.configs();
      setConfigs(list);
      const states = await Promise.all(
        list.map(async (c) => {
          try {
            const s = await connectorAuthApi.status(c.connectorId);
            return [c.connectorId, s.connected] as const;
          } catch {
            return [c.connectorId, false] as const;
          }
        })
      );
      setConnected(Object.fromEntries(states));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sync config");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle(c: SyncConfigView, enabled: boolean) {
    setBusy(c.connectorId);
    setNotice(null);
    try {
      await syncApi.set(c.connectorId, { enabled });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function setIntervalMinutes(c: SyncConfigView, minutes: number) {
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 1440) return;
    setBusy(c.connectorId);
    try {
      await syncApi.set(c.connectorId, { intervalMinutes: Math.floor(minutes) });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function runNow(c: SyncConfigView) {
    setBusy(c.connectorId);
    setNotice(null);
    try {
      const res = await syncApi.runNow(c.connectorId);
      const counts = res.counts as Record<string, number> | undefined;
      setNotice(
        counts
          ? `${LABELS[c.connectorId]}: discovered ${counts.discovered ?? 0}, imported ${counts.imported ?? 0}, failed ${counts.failed ?? 0}.`
          : `${LABELS[c.connectorId]}: ${String(res.status ?? "done")}.`
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!configs) return <p className="text-sm text-muted-foreground">Loading sync…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Read-only background sync. Imports are deduplicated and evidenced; failures back off automatically.
      </p>
      {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}
      {configs.map((c) => (
        <Card key={c.connectorId}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span>{LABELS[c.connectorId] ?? c.connectorId}</span>
              {c.enabled ? <Badge>Syncing</Badge> : <Badge variant="outline">Off</Badge>}
              {!connected[c.connectorId] && <Badge variant="destructive">Not connected</Badge>}
              {c.consecutiveFailures > 0 && <Badge variant="destructive">Needs attention</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <Switch
                checked={c.enabled}
                disabled={busy === c.connectorId || !connected[c.connectorId]}
                onCheckedChange={(v) => void toggle(c, v)}
              />
              <span className="text-muted-foreground">Background sync</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">Every</span>
              <Input
                type="number"
                min={5}
                max={1440}
                defaultValue={c.intervalMinutes}
                key={`${c.connectorId}-${c.intervalMinutes}`}
                className="w-20"
                disabled={busy === c.connectorId}
                onBlur={(e) => void setIntervalMinutes(c, Number(e.target.value))}
              />
              <span className="text-muted-foreground">min (5–1440)</span>
            </label>
            <span className="text-xs text-muted-foreground">
              {c.lastRunAt ? `Last: ${new Date(c.lastRunAt).toLocaleString()}` : "Never synced"}
              {c.nextRunAt && c.enabled ? ` · Next: ${new Date(c.nextRunAt).toLocaleString()}` : ""}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto gap-1"
              disabled={busy === c.connectorId || !connected[c.connectorId]}
              onClick={() => void runNow(c)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {busy === c.connectorId ? "Working…" : "Sync now"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
