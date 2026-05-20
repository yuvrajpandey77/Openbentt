import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useZotero } from "@/context/ZoteroContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { zoteroAvailable } from "@/lib/zotero/desktopApi";
import { useState } from "react";
import { Loader2, RefreshCw, Unplug, BookOpen, FolderSync } from "lucide-react";

export function ZoteroConnectionPanel() {
  const {
    status,
    snapshot,
    syncing,
    progress,
    lastSyncResult,
    connectWeb,
    disconnect,
    syncLibrary,
    refreshStatus,
    setBbtExportPath,
    startBbtWatch,
    mergeIntoBibliography,
    useMockLibrary,
  } = useZotero();
  const { project, setBibliography } = useResearchProject();
  const desktop = zoteroAvailable();

  const [userId, setUserId] = useState(status.userId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [bbtPath, setBbtPath] = useState(status.betterBibTeX.autoExportPath ?? "");

  const modeLabel =
    status.mode === "web"
      ? "Zotero Web API"
      : status.mode === "better-bibtex"
        ? "Better BibTeX"
        : status.mode === "local"
          ? "Zotero installed (Web API sync)"
          : "Disconnected";

  const handleSyncToProject = async () => {
    let result = lastSyncResult;
    if (!snapshot) {
      result = await syncLibrary();
    }
    if (!project) return;
    const merge = mergeIntoBibliography(project.bibliography);
    if (merge?.bibliography) {
      await setBibliography(merge.bibliography);
    } else if (result?.bibliography) {
      await setBibliography(result.bibliography);
    }
  };

  return (
    <div className="rounded-lg border border-border/80 bg-card/50 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Zotero</h3>
            <Badge variant={status.connected ? "default" : "secondary"}>{modeLabel}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.connected
              ? `Connected${status.userName ? ` as ${status.userName}` : ""}${status.lastSyncAt ? ` · last sync ${new Date(status.lastSyncAt).toLocaleString()}` : ""}`
              : desktop
                ? "Connect via Web API or Better BibTeX auto-export"
                : "Web API sync available · full local/BBT features on desktop"}
          </p>
          {status.local.found && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Local install: {status.local.dataDir}
              {status.betterBibTeX.detected && " · Better BibTeX detected"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void refreshStatus()} disabled={syncing}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
          {status.connected && (
            <Button type="button" size="sm" variant="outline" onClick={() => void disconnect()}>
              <Unplug className="h-3.5 w-3.5 mr-1" />
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {progress && syncing && (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {progress.message}
          {progress.percent != null && ` (${progress.percent}%)`}
        </div>
      )}

      {status.lastError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {status.lastError}
        </div>
      )}

      {lastSyncResult?.partial && lastSyncResult.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
          Partial sync: {lastSyncResult.warnings.join("; ")}
        </div>
      )}

      {!status.connected && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="zotero-user-id" className="text-xs">
              Zotero User ID
            </Label>
            <Input
              id="zotero-user-id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Numeric user ID"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zotero-api-key" className="text-xs">
              API Key
            </Label>
            <Input
              id="zotero-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="From zotero.org/settings/keys"
              className="h-8 text-xs"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="sm:col-span-2 w-fit"
            onClick={() => void connectWeb(userId.trim(), apiKey.trim())}
            disabled={!userId.trim() || !apiKey.trim()}
          >
            Save credentials
          </Button>
        </div>
      )}

      {desktop && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <Label htmlFor="bbt-path" className="text-xs">
            Better BibTeX auto-export path
          </Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="bbt-path"
              value={bbtPath}
              onChange={(e) => setBbtPath(e.target.value)}
              placeholder="/path/to/library.bib"
              className="h-8 text-xs flex-1 min-w-[200px]"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void setBbtExportPath(bbtPath)}
            >
              Save path
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void setBbtExportPath(bbtPath).then(() => startBbtWatch(bbtPath))}
            >
              Watch file
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
        <Button
          type="button"
          size="sm"
          onClick={() => void syncLibrary()}
          disabled={syncing || (!status.userId && !bbtPath && !status.connected)}
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FolderSync className="h-3.5 w-3.5 mr-1" />}
          Sync library
        </Button>
        {desktop && bbtPath && (
          <Button type="button" size="sm" variant="outline" onClick={() => void syncLibrary({ useBbt: true, bbtExportPath: bbtPath })}>
            Sync from BBT file
          </Button>
        )}
        {snapshot && project && (
          <Button type="button" size="sm" variant="secondary" onClick={() => void handleSyncToProject()}>
            Apply to project bibliography
          </Button>
        )}
        {import.meta.env.DEV && (
          <Button type="button" size="sm" variant="ghost" onClick={useMockLibrary}>
            Load mock library
          </Button>
        )}
      </div>

      {snapshot && (
        <div className="text-xs text-muted-foreground grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-border/60 pt-3">
          <span>{snapshot.itemCount} items</span>
          <span>{snapshot.collections.length} collections</span>
          <span>{snapshot.annotations.length} annotations</span>
          <span>{snapshot.tags.length} tags</span>
          <span className="col-span-2 sm:col-span-4">Source: {snapshot.mode} · {snapshot.syncedAt}</span>
        </div>
      )}
    </div>
  );
}
