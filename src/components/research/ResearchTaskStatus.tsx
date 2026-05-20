import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { Loader2, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ResearchTaskStatus() {
  const {
    projectPressure,
    semanticIndexProgress,
    semanticIndexRebuilding,
    backgroundJob,
    draftSaveStatus,
    cancelSemanticIndexRebuild,
    retryRechunkJob,
    dismissBackgroundJob,
  } = useResearchProject();

  if (
    !semanticIndexRebuilding &&
    !backgroundJob &&
    draftSaveStatus !== "saving" &&
    !projectPressure?.messages.length
  ) {
    return null;
  }

  const embedPct =
    semanticIndexProgress && semanticIndexProgress.total > 0
      ? Math.round((semanticIndexProgress.done / semanticIndexProgress.total) * 100)
      : 0;

  return (
    <div className="border-b border-border/60 bg-muted/15 px-3 py-2 space-y-2 text-xs">
      {projectPressure && projectPressure.messages.length > 0 && (
        <Alert
          variant={projectPressure.level === "critical" ? "destructive" : "default"}
          className="py-2"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <AlertDescription className="text-xs space-y-0.5">
            {projectPressure.messages.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {draftSaveStatus === "saving" && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving draft…
        </div>
      )}

      {semanticIndexRebuilding && semanticIndexProgress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              Embedding index (MiniLM) — {semanticIndexProgress.phase}
              {semanticIndexProgress.total > 0 &&
                ` (${semanticIndexProgress.done}/${semanticIndexProgress.total})`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Cancel indexing"
              onClick={cancelSemanticIndexRebuild}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <Progress value={embedPct} className="h-1.5" />
          <p className="text-[10px] text-muted-foreground">
            Embeddings run in a background worker to keep the editor responsive.
          </p>
        </div>
      )}

      {backgroundJob && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span className="flex items-center gap-2">
              {backgroundJob.status === "running" || backgroundJob.status === "pending" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              )}
              Rechunk: {backgroundJob.status}
              {backgroundJob.message ? ` — ${backgroundJob.message}` : ""}
            </span>
            <div className="flex items-center gap-1">
              {backgroundJob.status === "failed" && (
                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => void retryRechunkJob()}>
                  Retry
                </Button>
              )}
              {(backgroundJob.status === "failed" || backgroundJob.status === "cancelled") && (
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={dismissBackgroundJob} title="Dismiss">
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          {(backgroundJob.status === "running" || backgroundJob.status === "pending") && (
            <Progress value={Math.round(backgroundJob.progress * 100)} className="h-1.5" />
          )}
        </div>
      )}
    </div>
  );
}
