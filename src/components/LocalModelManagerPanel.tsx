import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLocalModels } from "@/context/LocalModelContext";
import { useChat } from "@/context/ChatContext";
import { MODEL_PROFILES, resourceWarningForModel } from "@/lib/modelManager";
import { MODEL_TASK_LABELS, type ModelTask } from "@/lib/modelRouting/tasks";
import { routeModelForTask } from "@/lib/modelRouting/router";
import { listChatCandidates } from "@/lib/modelManager";
import { formatBytes } from "@/lib/downloadProgress";
import { RefreshCw, AlertTriangle } from "lucide-react";
import LocalGgufHub from "@/components/LocalGgufHub";

const PREVIEW_TASKS: ModelTask[] = [
  "chat_lightweight",
  "chat_drafting",
  "chat_synthesis",
  "embedding",
];

/** Unified local model manager: catalogs, routing preview, storage, GGUF hub. */
export function LocalModelManagerPanel() {
  const { snapshot, loading, refresh, lastRefreshError, connectivityLabel } = useLocalModels();
  const { apiConfig } = useChat();
  const qc = useQueryClient();

  const routingPreview = React.useMemo(() => {
    if (!snapshot) return [];
    const candidates = [...listChatCandidates(snapshot), snapshot.registry.embedding];
    return PREVIEW_TASKS.map((task) => {
      try {
        const route = routeModelForTask(task, apiConfig, candidates, snapshot.ctx);
        return { task, route, error: null as string | null };
      } catch (e) {
        return {
          task,
          route: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    });
  }, [snapshot, apiConfig]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Local model manager</h2>
          <p className="text-sm text-muted-foreground">
            GGUF · llama.cpp · Ollama · on-device WebGPU — {connectivityLabel}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => {
            void refresh();
            void qc.invalidateQueries({ queryKey: ["local-gguf-registry"] });
          }}
        >
          <RefreshCw className={loading ? "mr-1 h-3 w-3 animate-spin" : "mr-1 h-3 w-3"} />
          Refresh
        </Button>
      </div>

      {lastRefreshError && (
        <Alert variant="destructive">
          <AlertTitle>Model scan failed</AlertTitle>
          <AlertDescription>{lastRefreshError}</AlertDescription>
        </Alert>
      )}

      {snapshot?.storage.hasLowDiskWarning && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Low disk space</AlertTitle>
          <AlertDescription>
            {snapshot.storage.formattedFree} free — local models use {snapshot.storage.formattedTotal}.
            Free space before large downloads.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Storage</CardTitle>
            <CardDescription>Downloaded weights on disk</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{snapshot?.storage.formattedTotal ?? "—"}</p>
            <p className="text-muted-foreground">{snapshot?.registry.gguf.length ?? 0} GGUF file(s)</p>
            <p className="text-muted-foreground">Free: {snapshot?.storage.formattedFree ?? "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Backends</CardTitle>
            <CardDescription>Available inference paths</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            <Badge variant="secondary">WebGPU ×{snapshot?.registry.webgpu.length ?? 0}</Badge>
            <Badge variant="secondary">GGUF ×{snapshot?.registry.gguf.length ?? 0}</Badge>
            <Badge variant={snapshot?.ollamaProbe.ok ? "secondary" : "outline"}>
              Ollama {snapshot?.ollamaProbe.ok ? "✓" : "—"}
            </Badge>
            <Badge variant={snapshot?.ctx.llamaBinaryReady ? "secondary" : "outline"}>
              llama-server {snapshot?.ctx.llamaBinaryReady ? "✓" : "missing"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Profiles</CardTitle>
            <CardDescription>Quantization & task presets</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {MODEL_PROFILES.map((p) => (
              <div key={p.id} className="flex justify-between gap-2">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">{p.preferredQuant}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Smart routing preview</CardTitle>
          <CardDescription>
            Task → model (honest labels — prompt templates are not models)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {routingPreview.map(({ task, route, error }) => (
            <div key={task} className="flex flex-col gap-0.5 border-b border-border/40 pb-2 last:border-0">
              <span className="font-medium text-muted-foreground">{MODEL_TASK_LABELS[task]}</span>
              {route ? (
                <>
                  <span>{route.displayLabel}</span>
                  <span className="text-muted-foreground">{route.reason}</span>
                </>
              ) : (
                <span className="text-destructive">{error}</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {snapshot && snapshot.registry.gguf.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Installed GGUF models</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {snapshot.registry.gguf.map((m) => {
              const warn = resourceWarningForModel(m, snapshot.diskFreeBytes);
              const avail = snapshot.availability.get(m.id);
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{m.displayName}</p>
                    <p className="text-muted-foreground">
                      {formatBytes(m.storage.bytesOnDisk)} · {m.quantization ?? "GGUF"} ·{" "}
                      {m.performance.speedLabel}
                    </p>
                    {warn && <p className="text-primary">{warn}</p>}
                  </div>
                  <Badge variant={avail?.state === "ready" ? "secondary" : "outline"}>
                    {avail?.state ?? "unknown"}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <LocalGgufHub />
    </div>
  );
}

export default LocalModelManagerPanel;
