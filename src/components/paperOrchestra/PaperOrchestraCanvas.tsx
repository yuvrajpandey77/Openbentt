import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useChat } from "@/context/ChatContext";
import {
  getPaperOrchestraApi,
  ORCHESTRA_STAGES,
  type PaperOrchestraArtifacts,
  type PaperOrchestraStage,
} from "@/lib/paperOrchestra/desktopApi";
import { getSecretsApi } from "@/lib/privacy/desktopSecrets";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles, Square, FileText, BookOpen } from "lucide-react";

const IDEA_KEY = "openbentt-orchestra-idea";
const LOG_KEY = "openbentt-orchestra-log";
const VENUE_KEY = "openbentt-orchestra-venue";

type StageState = "pending" | "active" | "done" | "error";

function stageRank(stage: string | undefined): number {
  const order = ["starting", "outline", "literature", "plotting", "sections", "refine", "running", "complete"];
  const i = order.indexOf(stage ?? "");
  return i < 0 ? -1 : i;
}

function StageNode({
  label,
  state,
  index,
}: {
  label: string;
  state: StageState;
  index: number;
}) {
  return (
    <div
      className={cn(
        "orchestra-node relative flex min-w-[5.5rem] flex-col items-center gap-2",
        state === "active" && "orchestra-node-active",
        state === "done" && "orchestra-node-done"
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full border text-xs font-semibold tracking-wide transition-all duration-500",
          state === "pending" && "border-border/60 bg-background/40 text-muted-foreground",
          state === "active" && "border-emerald-400/80 bg-emerald-500/15 text-emerald-200 shadow-[0_0_24px_rgba(52,211,153,0.25)]",
          state === "done" && "border-emerald-500/50 bg-emerald-500/20 text-foreground",
          state === "error" && "border-destructive/70 bg-destructive/15 text-destructive"
        )}
      >
        {state === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : index + 1}
      </div>
      <span className="text-[11px] font-medium text-foreground/90">{label}</span>
    </div>
  );
}

/**
 * Always-on PaperOrchestra surface: materials → animated stage graph → apply into Notebook.
 * Drives the intact Python CLI; does not replace Orchestra agents.
 */
export function PaperOrchestraCanvas({ onApplied }: { onApplied?: () => void }) {
  const api = getPaperOrchestraApi();
  const { project, setDraftTex, setBibliography } = useResearchProject();
  const { apiConfig } = useChat();
  const { toast } = useToast();

  const [idea, setIdea] = useState(() => {
    try {
      return localStorage.getItem(IDEA_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [log, setLog] = useState(() => {
    try {
      return localStorage.getItem(LOG_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [venue, setVenue] = useState<"cvpr2025" | "iclr2025">(() => {
    try {
      return localStorage.getItem(VENUE_KEY) === "iclr2025" ? "iclr2025" : "cvpr2025";
    } catch {
      return "cvpr2025";
    }
  });
  const [usePlotting, setUsePlotting] = useState(false);
  const [writerModel, setWriterModel] = useState("");
  const [reflectionModel, setReflectionModel] = useState("");
  const [engineHint, setEngineHint] = useState("Checking PaperOrchestra…");
  const [engineReady, setEngineReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentStage, setCurrentStage] = useState<string>("idle");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [lastArtifacts, setLastArtifacts] = useState<PaperOrchestraArtifacts | null>(null);
  const [busyApply, setBusyApply] = useState(false);

  const buildEnvInject = useCallback(async (): Promise<Record<string, string>> => {
    const inject: Record<string, string> = {};
    let providerKey = apiConfig.apiKey?.trim() ?? "";
    try {
      const secrets = getSecretsApi();
      if (secrets?.load) {
        const loaded = await secrets.load();
        if (loaded.providerApiKey?.trim()) providerKey = loaded.providerApiKey.trim();
      }
    } catch { /* vault optional */ }
    if (providerKey) {
      // Additive: Orchestra agents pick Gemini vs OpenAI; pass both so either backend works.
      inject.OPENAI_API_KEY = providerKey;
      inject.GEMINI_API_KEY = providerKey;
    }
    return inject;
  }, [apiConfig.apiKey]);

  useEffect(() => {
    try {
      localStorage.setItem(IDEA_KEY, idea);
    } catch { /* ignore */ }
  }, [idea]);
  useEffect(() => {
    try {
      localStorage.setItem(LOG_KEY, log);
    } catch { /* ignore */ }
  }, [log]);
  useEffect(() => {
    try {
      localStorage.setItem(VENUE_KEY, venue);
    } catch { /* ignore */ }
  }, [venue]);

  useEffect(() => {
    if (!api) {
      setEngineHint("PaperOrchestra runs in the Openbentt desktop app.");
      return;
    }
    void api.status().then((s) => {
      setEngineReady(s.ready);
      setEngineHint(s.hint);
    });
  }, [api]);

  useEffect(() => {
    if (!api?.onProgress) return;
    return api.onProgress((p) => {
      if (p.stage) setCurrentStage(String(p.stage));
      if (p.message) {
        setLogLines((prev) => [...prev.slice(-80), p.message!.slice(0, 240)]);
      }
      if (p.done) setRunning(false);
    });
  }, [api]);

  const nodeStates = useMemo(() => {
    const rank = stageRank(currentStage);
    return ORCHESTRA_STAGES.map((s, i) => {
      if (currentStage === "error" || currentStage === "cancelled") {
        return rank >= i ? ("error" as StageState) : ("pending" as StageState);
      }
      if (currentStage === "complete" || currentStage === "idle" && lastArtifacts) {
        return "done" as StageState;
      }
      const self = stageRank(s.id);
      if (self < 0) return "pending" as StageState;
      if (rank > self || (currentStage === "complete" && s.id === "complete")) return "done" as StageState;
      if (rank === self || (s.id === "complete" && currentStage === "running")) return "active" as StageState;
      if (s.id === "plotting" && !usePlotting && rank > stageRank("literature")) return "done" as StageState;
      if (s.id === "plotting" && !usePlotting) return "pending" as StageState;
      return "pending" as StageState;
    });
  }, [currentStage, lastArtifacts, usePlotting]);

  const paperExtras = useMemo(() => {
    if (!project?.papers?.length) return [] as Array<{ name: string; text: string }>;
    return project.papers.slice(0, 12).map((p, i) => ({
      name: `library_paper_${i + 1}.md`,
      text: [
        `# ${p.metadata?.title ?? p.fileName}`,
        p.metadata?.authors ?? "",
        "",
        (p.extractedText ?? "").slice(0, 24_000),
      ].join("\n"),
    }));
  }, [project?.papers]);

  const run = useCallback(async () => {
    if (!api) {
      toast({ title: "Desktop only", description: "PaperOrchestra needs the Openbentt desktop app.", variant: "destructive" });
      return;
    }
    setRunning(true);
    setCurrentStage("starting");
    setLogLines([]);
    setLastArtifacts(null);
    try {
      const envInject = await buildEnvInject();
      const result = await api.start({
        idea,
        experimentalLog: log,
        venue,
        usePlotting,
        extraMaterialFiles: paperExtras,
        writerModelName: writerModel.trim() || undefined,
        reflectionModelName: reflectionModel.trim() || undefined,
        envInject,
      });
      setLastArtifacts(result.artifacts);
      setCurrentStage("complete");
      toast({ title: "PaperOrchestra finished", description: "Review artifacts, then Apply to Notebook." });
    } catch (e) {
      setCurrentStage("error");
      toast({
        title: "PaperOrchestra failed",
        description: e instanceof Error ? e.message : "Run failed",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }, [api, idea, log, venue, usePlotting, paperExtras, writerModel, reflectionModel, buildEnvInject, toast]);

  const cancel = useCallback(async () => {
    await api?.cancel();
    setRunning(false);
    setCurrentStage("cancelled");
  }, [api]);

  const applyToNotebook = useCallback(async () => {
    if (!lastArtifacts || !project) return;
    setBusyApply(true);
    try {
      if (lastArtifacts.draftTex) setDraftTex(lastArtifacts.draftTex, { immediate: true });
      if (lastArtifacts.bibliography) setBibliography(lastArtifacts.bibliography);
      try {
        localStorage.setItem(
          `openbentt-orchestra-last-${project.id}`,
          JSON.stringify({
            outputDir: lastArtifacts.outputDir,
            pdfPath: lastArtifacts.pdfPath,
            venue,
            appliedAt: new Date().toISOString(),
          })
        );
      } catch { /* ignore */ }
      const hasOrchestraPdf = Boolean(lastArtifacts.pdfPath);
      toast({
        title: "Applied to Notebook",
        description: hasOrchestraPdf
          ? "Draft, bibliography, and Orchestra PDF path saved. Switch to Editor to preview."
          : "Draft imported. Orchestra PDF missing — use Editor Compile (tectonic) as fallback.",
      });
      onApplied?.();
    } catch (e) {
      toast({
        title: "Apply failed",
        description: e instanceof Error ? e.message : "Could not write draft",
        variant: "destructive",
      });
    } finally {
      setBusyApply(false);
    }
  }, [lastArtifacts, project, setDraftTex, setBibliography, venue, toast, onApplied]);

  return (
    <div className="orchestra-canvas relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="orchestra-atmosphere pointer-events-none absolute inset-0" aria-hidden />

      <header className="relative z-10 flex shrink-0 items-end justify-between gap-4 border-b border-border/40 px-5 pb-4 pt-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Openbentt · PaperOrchestra</p>
          <h1 className="mt-1 font-[family-name:var(--font-display,ui-serif)] text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Paper canvas
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Full multi-agent paper writing — outline, literature, sections, refine{usePlotting ? ", plotting" : ""}. Engine stays intact.
          </p>
        </div>
        <div className="hidden text-right text-xs text-muted-foreground sm:block">
          <p className={cn(engineReady ? "text-emerald-400/90" : "text-amber-400/90")}>{engineHint}</p>
          {project?.papers?.length ? (
            <p className="mt-1 flex items-center justify-end gap-1">
              <BookOpen className="h-3 w-3" /> {project.papers.length} library paper(s) attached as evidence
            </p>
          ) : null}
        </div>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(280px,340px)_1fr]">
        {/* Materials dock */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-border/40 bg-background/40 p-4 backdrop-blur-sm">
          <div className="space-y-1.5">
            <Label htmlFor="orch-idea">Idea</Label>
            <Textarea
              id="orch-idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Sparse or dense idea — contributions, method, claims…"
              className="min-h-[8rem] resize-y bg-background/60 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orch-log">Experimental log</Label>
            <Textarea
              id="orch-log"
              value={log}
              onChange={(e) => setLog(e.target.value)}
              placeholder="Tables, ablations, metrics, figure notes…"
              className="min-h-[8rem] resize-y bg-background/60 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Venue template</Label>
            <div className="flex gap-2">
              {(["cvpr2025", "iclr2025"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVenue(v)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    venue === v ? "border-foreground/40 bg-foreground/10 text-foreground" : "border-border/50 text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  {v === "cvpr2025" ? "CVPR 2025" : "ICLR 2025"}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={usePlotting} onCheckedChange={(c) => setUsePlotting(c === true)} />
            Enable plotting agent
          </label>
          <details className="rounded-lg border border-border/40 bg-background/30 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-foreground">Model overrides (optional)</summary>
            <div className="mt-2 space-y-2">
              <div className="space-y-1">
                <Label htmlFor="orch-writer" className="text-[11px]">Writer / lit model</Label>
                <input
                  id="orch-writer"
                  value={writerModel}
                  onChange={(e) => setWriterModel(e.target.value)}
                  placeholder="Orchestra default"
                  className="w-full rounded-md border border-border/50 bg-background/60 px-2 py-1.5 font-mono text-[11px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="orch-reflect" className="text-[11px]">Reflection model</Label>
                <input
                  id="orch-reflect"
                  value={reflectionModel}
                  onChange={(e) => setReflectionModel(e.target.value)}
                  placeholder="Orchestra default"
                  className="w-full rounded-md border border-border/50 bg-background/60 px-2 py-1.5 font-mono text-[11px]"
                />
              </div>
            </div>
          </details>
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            {running ? (
              <Button type="button" variant="destructive" className="gap-1.5" onClick={() => void cancel()}>
                <Square className="h-3.5 w-3.5" /> Cancel
              </Button>
            ) : (
              <Button
                type="button"
                className="gap-1.5"
                disabled={!engineReady || idea.trim().length < 20 || log.trim().length < 10}
                onClick={() => void run()}
              >
                <Sparkles className="h-3.5 w-3.5" /> Run PaperOrchestra
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={!lastArtifacts?.draftTex || busyApply}
              onClick={() => void applyToNotebook()}
            >
              {busyApply ? "Applying…" : "Apply to Notebook"}
            </Button>
          </div>
        </aside>

        {/* Stage canvas + log */}
        <section className="flex min-h-0 flex-col overflow-hidden p-4 md:p-6">
          <div className="orchestra-stage-rail relative flex flex-wrap items-center justify-center gap-3 py-8 md:gap-6 md:py-12">
            {ORCHESTRA_STAGES.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 md:gap-6">
                <StageNode label={s.id === "plotting" && !usePlotting ? "Plotting (off)" : s.label} state={nodeStates[i]!} index={i} />
                {i < ORCHESTRA_STAGES.length - 1 ? (
                  <div
                    className={cn(
                      "orchestra-edge hidden h-px w-8 md:block md:w-12",
                      nodeStates[i] === "done" ? "bg-emerald-400/70" : "bg-border/50"
                    )}
                  />
                ) : null}
              </div>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/50 bg-background/50 shadow-inner backdrop-blur">
            <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Live engine log · {currentStage}
            </div>
            <pre className="h-[min(40vh,22rem)] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {logLines.length ? logLines.join("\n") : "Stage output will stream here when you Run."}
            </pre>
          </div>

          {lastArtifacts?.outline ? (
            <details className="mt-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-foreground">Inspect outline.json</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground">
                {lastArtifacts.outline.slice(0, 8000)}
              </pre>
            </details>
          ) : null}
        </section>
      </div>
    </div>
  );
}
