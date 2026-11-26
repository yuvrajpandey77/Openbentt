import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { beginBackgroundWork } from "@/lib/backgroundWork";
import { useTaskCenter } from "@/context/TaskCenterContext";
import { Loader2, Sparkles, Square, FileText, BookOpen, Wand2 } from "lucide-react";

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
          "flex h-11 w-11 items-center justify-center rounded-xl border text-xs font-semibold tracking-wide transition-all duration-300",
          state === "pending" && "border-border bg-muted/30 text-muted-foreground",
          state === "active" && "border-primary/50 bg-primary/10 text-foreground ring-1 ring-primary/30",
          state === "done" && "border-border bg-muted text-foreground",
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
  const { upsertTask } = useTaskCenter();
  const paperReleaseRef = useRef<(() => void) | null>(null);

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
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiKeyStored, setGeminiKeyStored] = useState(false);
  const [s2Key, setS2Key] = useState("");
  const [s2KeyStored, setS2KeyStored] = useState(false);
  const [engineHint, setEngineHint] = useState("Checking PaperOrchestra…");
  const [engineReady, setEngineReady] = useState(false);
  const [canInstallEngine, setCanInstallEngine] = useState(false);
  const [installingEngine, setInstallingEngine] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentStage, setCurrentStage] = useState<string>("idle");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [lastArtifacts, setLastArtifacts] = useState<PaperOrchestraArtifacts | null>(null);
  const [busyApply, setBusyApply] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const secrets = getSecretsApi();
        if (!secrets?.status) return;
        const st = await secrets.status();
        setGeminiKeyStored(Boolean(st.stored?.gemini_api_key));
        setS2KeyStored(Boolean(st.stored?.semantic_scholar_api_key));
        const loaded = await secrets.load();
        if (loaded.geminiApiKey?.trim()) setGeminiKey(loaded.geminiApiKey.trim());
        if (loaded.semanticScholarApiKey?.trim()) setS2Key(loaded.semanticScholarApiKey.trim());
      } catch { /* vault optional */ }
    })();
  }, []);

  const saveOrchestraKeys = useCallback(async () => {
    const secrets = getSecretsApi();
    if (!secrets?.set) {
      toast({
        title: "Desktop vault unavailable",
        description: "Open the Openbentt desktop app to store API keys securely.",
        variant: "destructive",
      });
      return false;
    }
    const gemini = geminiKey.trim();
    const s2 = s2Key.trim();
    if (gemini) await secrets.set("gemini_api_key", gemini);
    if (s2) await secrets.set("semantic_scholar_api_key", s2);
    setGeminiKeyStored(Boolean(gemini) || geminiKeyStored);
    setS2KeyStored(Boolean(s2) || s2KeyStored);
    return true;
  }, [geminiKey, s2Key, geminiKeyStored, s2KeyStored, toast]);

  const buildEnvInject = useCallback(async (): Promise<Record<string, string>> => {
    const inject: Record<string, string> = {};
    try {
      const secrets = getSecretsApi();
      if (secrets?.load) {
        const loaded = await secrets.load();
        const gemini = geminiKey.trim() || loaded.geminiApiKey?.trim() || "";
        const openai = loaded.openaiApiKey?.trim() || "";
        const s2 = s2Key.trim() || loaded.semanticScholarApiKey?.trim() || "";
        if (gemini) inject.GEMINI_API_KEY = gemini;
        if (openai) inject.OPENAI_API_KEY = openai;
        if (s2) inject.SEMANTIC_SCHOLAR_API_KEY = s2;
      }
    } catch { /* vault optional */ }
    if (geminiKey.trim() && !inject.GEMINI_API_KEY) inject.GEMINI_API_KEY = geminiKey.trim();
    if (s2Key.trim() && !inject.SEMANTIC_SCHOLAR_API_KEY) inject.SEMANTIC_SCHOLAR_API_KEY = s2Key.trim();
    // Fallback: if Settings has a Google-looking provider key, allow it as Gemini.
    const provider = apiConfig.apiKey?.trim() ?? "";
    if (!inject.GEMINI_API_KEY && provider && /^AIza[0-9A-Za-z_-]{20,}$/.test(provider)) {
      inject.GEMINI_API_KEY = provider;
    }
    return inject;
  }, [apiConfig.apiKey, geminiKey, s2Key]);

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

  // One-shot seed from the live Notebook project so Editor ↔ Paper stay linked.
  useEffect(() => {
    if (!project) return;
    setIdea((prev) => {
      if (prev.trim()) return prev;
      const fromTitle = project.title?.trim();
      const fromKnowledge = project.knowledge?.trim()?.slice(0, 2000);
      const fromDraft = (project.draftTex ?? "")
        .replace(/\\[a-zA-Z]+\{?/g, " ")
        .replace(/[{}%\\]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500);
      const seed = [fromTitle && `Paper: ${fromTitle}`, fromKnowledge, fromDraft]
        .filter(Boolean)
        .join("\n\n")
        .trim();
      return seed.length >= 20 ? seed : prev;
    });
    setLog((prev) => {
      if (prev.trim() || !project.bibliography?.trim()) return prev;
      const keys = (project.bibliography.match(/^@\w+\{([^,]+)/gm) ?? [])
        .slice(0, 24)
        .map((l) => l.replace(/^@\w+\{/, "").trim());
      if (!keys.length) return prev;
      return [
        "Notes from Notebook library / bibliography:",
        ...keys.map((k) => `- cite:${k}`),
        project.papers?.length
          ? `\n${project.papers.length} PDF(s) attached as evidence materials.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    });
  }, [project]);

  const refreshEngineStatus = useCallback(async () => {
    if (!api) {
      setEngineHint("PaperOrchestra runs in the Openbentt desktop app.");
      setEngineReady(false);
      setCanInstallEngine(false);
      return;
    }
    const s = await api.status();
    setEngineReady(s.ready);
    setEngineHint(s.hint);
    setCanInstallEngine(Boolean(s.canInstall) && !s.ready);
    setInstallingEngine(Boolean(s.installing));
  }, [api]);

  useEffect(() => {
    void refreshEngineStatus();
  }, [refreshEngineStatus]);

  // Rehydrate logs/stage/artifacts if main still has (or just finished) a run after remount.
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    void api.status().then(async (s) => {
      if (cancelled) return;
      if (Array.isArray(s.logLines) && s.logLines.length) {
        setLogLines(s.logLines.slice(-200));
      }
      if (s.stage && s.stage !== "idle") {
        setCurrentStage(String(s.stage));
      }
      if (s.running) {
        setRunning(true);
        if (!paperReleaseRef.current) paperReleaseRef.current = beginBackgroundWork("paper");
        upsertTask({
          id: "paper-run",
          kind: "paper-run",
          title: "PaperOrchestra running",
          detail: s.logLines?.length ? String(s.logLines[s.logLines.length - 1]).slice(0, 120) : "Continues in background",
          percent: null,
          state: "running",
          error: null,
          onCancel: () => void api.cancel(),
        });
      } else if (s.lastFinish?.done) {
        setRunning(false);
        upsertTask({
          id: "paper-run",
          kind: "paper-run",
          title: s.lastFinish.ok ? "PaperOrchestra finished" : "PaperOrchestra failed",
          detail: s.lastFinish.message?.slice(0, 160) ?? null,
          percent: s.lastFinish.ok ? 100 : null,
          state: s.lastFinish.ok ? "done" : "failed",
          error: s.lastFinish.ok ? null : s.lastFinish.message,
        });
      }
      if (s.outputDir) {
        try {
          const arts = await api.importArtifacts(s.outputDir);
          if (!cancelled && (arts?.draftTex || arts?.pdfPath)) setLastArtifacts(arts);
        } catch {
          /* optional */
        }
      }
      if (s.installing) setInstallingEngine(true);
    });
    return () => {
      cancelled = true;
    };
  }, [api, upsertTask]);

  const logScrollRef = useRef<HTMLPreElement>(null);
  const KNOWN_STAGES = useMemo(
    () =>
      new Set([
        "starting",
        "outline",
        "literature",
        "plotting",
        "sections",
        "refine",
        "running",
        "complete",
        "error",
        "cancelled",
        "install",
      ]),
    []
  );

  useEffect(() => {
    if (!api?.onProgress) return;
    return api.onProgress((p) => {
      if (p.stage === "install" && p.message) {
        setEngineHint(p.message.slice(0, 200));
        setLogLines((prev) => [...prev.slice(-200), p.message!.slice(0, 500)]);
        upsertTask({
          id: "paper-install",
          kind: "paper-install",
          title: "Installing Paper engine",
          detail: p.message.slice(0, 120),
          percent: null,
          state: p.done ? (p.ok === false ? "failed" : "done") : "running",
          error: p.ok === false ? p.message : null,
        });
      }
      // Only advance the stage graph for known pipeline stages — raw log
      // lines must not wipe the active node (was stuck on "log" before).
      if (p.stage && p.stage !== "install" && KNOWN_STAGES.has(String(p.stage))) {
        setCurrentStage(String(p.stage));
      }
      if (p.message && p.stage !== "install") {
        setLogLines((prev) => [...prev.slice(-200), p.message!.slice(0, 500)]);
        upsertTask({
          id: "paper-run",
          kind: "paper-run",
          title: p.done ? (p.ok ? "PaperOrchestra finished" : "PaperOrchestra failed") : "PaperOrchestra running",
          detail: p.message.slice(0, 160),
          percent: null,
          state: p.done ? (p.ok ? "done" : p.stage === "cancelled" ? "cancelled" : "failed") : "running",
          error: p.done && !p.ok ? p.message : null,
          onCancel: p.done ? undefined : () => void api.cancel(),
          onOpen: () => {
            /* strip chip navigates to orchestra */
          },
        });
      }
      if (p.done && p.stage === "install") {
        setInstallingEngine(false);
        void refreshEngineStatus();
      }
      if (p.done && p.stage !== "install") {
        setRunning(false);
        paperReleaseRef.current?.();
        paperReleaseRef.current = null;
      }
    });
  }, [api, refreshEngineStatus, upsertTask, paperReleaseRef, KNOWN_STAGES]);

  useEffect(() => {
    const el = logScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logLines]);

  const installEngine = useCallback(async () => {
    if (!api?.installEngine) return;
    setInstallingEngine(true);
    setLogLines([]);
    setEngineHint("Installing Paper engine…");
    const release = beginBackgroundWork("install");
    upsertTask({
      id: "paper-install",
      kind: "paper-install",
      title: "Installing Paper engine",
      detail: "One-time setup",
      percent: null,
      state: "running",
      error: null,
    });
    try {
      await api.installEngine();
      await refreshEngineStatus();
      upsertTask({
        id: "paper-install",
        kind: "paper-install",
        title: "Paper engine ready",
        detail: null,
        percent: 100,
        state: "done",
        error: null,
      });
      toast({
        title: "Paper engine ready",
        description: "Run uses the same OpenCode agent as chat. Gemini is optional for higher quality.",
      });
    } catch (e) {
      setInstallingEngine(false);
      upsertTask({
        id: "paper-install",
        kind: "paper-install",
        title: "Paper engine install failed",
        detail: e instanceof Error ? e.message : "Install failed",
        percent: null,
        state: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
      toast({
        title: "Install failed",
        description: e instanceof Error ? e.message : "Could not install Paper engine",
        variant: "destructive",
      });
      await refreshEngineStatus();
    } finally {
      release();
    }
  }, [api, refreshEngineStatus, toast, upsertTask]);

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
    await saveOrchestraKeys();
    const envInject = await buildEnvInject();
    // Gemini is suggested, not required — main injects OpenCode/OmniRoute tokens when available.
    if (!envInject.GEMINI_API_KEY && !geminiKeyStored) {
      toast({
        title: "Running via OpenCode",
        description: "Same agent runtime as chat — no OpenRouter key required. Gemini is optional for quality.",
      });
    }
    setRunning(true);
    setCurrentStage("starting");
    setLogLines([]);
    setLastArtifacts(null);
    if (!paperReleaseRef.current) paperReleaseRef.current = beginBackgroundWork("paper");
    upsertTask({
      id: "paper-run",
      kind: "paper-run",
      title: "PaperOrchestra running",
      detail: "Continues if you leave Paper",
      percent: null,
      state: "running",
      error: null,
      onCancel: () => void api.cancel(),
    });
    try {
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
      const hasPdf = Boolean(result.artifacts?.pdfPath);
      const hasDraft = Boolean(result.artifacts?.draftTex?.trim());
      if (!hasPdf && !hasDraft) {
        setCurrentStage("error");
        upsertTask({
          id: "paper-run",
          kind: "paper-run",
          title: "PaperOrchestra failed",
          detail: "No manuscript produced",
          percent: null,
          state: "failed",
          error: "No manuscript",
        });
        toast({
          title: "PaperOrchestra failed",
          description: "No manuscript was produced. Check the live log for model / token errors.",
          variant: "destructive",
        });
        return;
      }
      setLastArtifacts(result.artifacts);
      setCurrentStage("complete");
      upsertTask({
        id: "paper-run",
        kind: "paper-run",
        title: "PaperOrchestra finished",
        detail: hasPdf ? "Manuscript + PDF ready" : "Draft ready",
        percent: 100,
        state: "done",
        error: null,
      });
      toast({
        title: "PaperOrchestra finished",
        description: hasPdf
          ? "Manuscript + PDF ready. Apply to Notebook when you want."
          : "Draft ready (PDF missing). Apply to Notebook, then Compile in Editor if needed.",
      });
    } catch (e) {
      setCurrentStage("error");
      upsertTask({
        id: "paper-run",
        kind: "paper-run",
        title: "PaperOrchestra failed",
        detail: e instanceof Error ? e.message.slice(0, 160) : "Run failed",
        percent: null,
        state: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
      toast({
        title: "PaperOrchestra failed",
        description: e instanceof Error ? e.message : "Run failed",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
      paperReleaseRef.current?.();
      paperReleaseRef.current = null;
    }
  }, [
    api,
    idea,
    log,
    venue,
    usePlotting,
    paperExtras,
    writerModel,
    reflectionModel,
    buildEnvInject,
    saveOrchestraKeys,
    toast,
    geminiKeyStored,
    upsertTask,
    paperReleaseRef,
  ]);

  const cancel = useCallback(async () => {
    await api?.cancel();
    setRunning(false);
    setCurrentStage("cancelled");
    paperReleaseRef.current?.();
    paperReleaseRef.current = null;
    upsertTask({
      id: "paper-run",
      kind: "paper-run",
      title: "PaperOrchestra cancelled",
      detail: null,
      percent: null,
      state: "cancelled",
      error: null,
    });
  }, [api, paperReleaseRef, upsertTask]);

  const autoFillFromProject = useCallback(() => {
    if (!project) {
      toast({
        title: "No project",
        description: "Open a Notebook project first.",
        variant: "destructive",
      });
      return;
    }
    const fromTitle = project.title?.trim();
    const fromKnowledge = project.knowledge?.trim()?.slice(0, 2000);
    const fromDraft = (project.draftTex ?? "")
      .replace(/\\[a-zA-Z]+\{?/g, " ")
      .replace(/[{}%\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500);
    const seed = [fromTitle && `Paper: ${fromTitle}`, fromKnowledge, fromDraft]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (seed.length >= 20) setIdea(seed);
    else if (fromTitle) setIdea(`Paper: ${fromTitle}\n\nDescribe contributions, method, and claims.`);
    else setIdea("Describe the paper idea, contributions, method, and claims.");

    const keys = (project.bibliography?.match(/^@\w+\{([^,]+)/gm) ?? [])
      .slice(0, 24)
      .map((l) => l.replace(/^@\w+\{/, "").trim());
    const logParts = [
      keys.length
        ? ["Notes from Notebook library / bibliography:", ...keys.map((k) => `- cite:${k}`)].join("\n")
        : "",
      project.papers?.length
        ? `${project.papers.length} PDF(s) attached as evidence materials.`
        : "",
      "Experimental notes:\n- ",
    ].filter(Boolean);
    setLog(logParts.join("\n\n"));
    toast({ title: "Auto-filled", description: "Idea and log seeded from this project. Edit, then Run." });
  }, [project, toast]);

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
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 pb-3 pt-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Paper Orchestra</p>
          <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {project?.title?.trim() || "Write the paper"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!engineReady && canInstallEngine ? (
            <Button
              type="button"
              size="sm"
              className="cursor-pointer gap-1.5"
              disabled={installingEngine}
              onClick={() => void installEngine()}
            >
              {installingEngine ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Installing…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" /> Install Paper engine
                </>
              )}
            </Button>
          ) : (
            <span
              className={cn(
                "rounded-md border border-border px-2 py-1 text-xs",
                engineReady ? "text-foreground" : "text-amber-600 dark:text-amber-400"
              )}
            >
              {engineHint}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="cursor-pointer gap-1.5"
            disabled={!project || running || installingEngine}
            onClick={autoFillFromProject}
          >
            <Wand2 className="h-3.5 w-3.5" /> Auto-fill
          </Button>
          {project?.papers?.length ? (
            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
              <BookOpen className="h-3 w-3" /> {project.papers.length}
            </span>
          ) : null}
        </div>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(280px,340px)_1fr]">
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-border bg-card/40 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="orch-idea">Idea</Label>
            <Textarea
              id="orch-idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Sparse or dense idea — contributions, method, claims…"
              className="min-h-[8rem] resize-y border-border bg-card font-mono text-xs shadow-sm ring-1 ring-border/50"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orch-log">Experimental log</Label>
            <Textarea
              id="orch-log"
              value={log}
              onChange={(e) => setLog(e.target.value)}
              placeholder="Tables, ablations, metrics, figure notes…"
              className="min-h-[8rem] resize-y border-border bg-card font-mono text-xs shadow-sm ring-1 ring-border/50"
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
                    "cursor-pointer rounded-xl border px-3 py-1.5 text-xs transition-colors",
                    venue === v
                      ? "border-border bg-muted font-medium text-foreground"
                      : "border-border/60 text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {v === "cvpr2025" ? "CVPR 2025" : "ICLR 2025"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <Label htmlFor="orch-gemini" className="text-xs">
              Gemini API key (optional, suggested){" "}
              {geminiKeyStored ? <span className="text-muted-foreground">(stored)</span> : null}
            </Label>
            <input
              id="orch-gemini"
              type="password"
              autoComplete="off"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza… — or rely on OpenCode / OmniRoute"
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
            />
            <Label htmlFor="orch-s2" className="text-xs">
              Semantic Scholar key (optional){" "}
              {s2KeyStored ? <span className="text-muted-foreground">(stored)</span> : null}
            </Label>
            <input
              id="orch-s2"
              type="password"
              autoComplete="off"
              value={s2Key}
              onChange={(e) => setS2Key(e.target.value)}
              placeholder="Improves literature search rate limits"
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="cursor-pointer"
              onClick={() => {
                void saveOrchestraKeys().then((ok) => {
                  toast({
                    title: ok ? "Keys saved" : "Could not save",
                    description: ok
                      ? "Stored in the desktop vault. Gemini is optional — OpenCode/OmniRoute can power Run."
                      : "Desktop vault unavailable.",
                    variant: ok ? "default" : "destructive",
                  });
                });
              }}
            >
              Save keys
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <Checkbox checked={usePlotting} onCheckedChange={(c) => setUsePlotting(c === true)} />
            Enable plotting agent (generates figures)
          </label>
          <details className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-sm">
            <summary className="cursor-pointer font-medium text-foreground">Model overrides (optional)</summary>
            <div className="mt-2 space-y-2">
              <div className="space-y-1">
                <Label htmlFor="orch-writer" className="text-[11px]">Writer / lit model</Label>
                <input
                  id="orch-writer"
                  value={writerModel}
                  onChange={(e) => setWriterModel(e.target.value)}
                  placeholder="Orchestra default"
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="orch-reflect" className="text-[11px]">Reflection model</Label>
                <input
                  id="orch-reflect"
                  value={reflectionModel}
                  onChange={(e) => setReflectionModel(e.target.value)}
                  placeholder="Orchestra default"
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
                />
              </div>
            </div>
          </details>
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            {running ? (
              <Button type="button" variant="destructive" className="cursor-pointer gap-1.5" onClick={() => void cancel()}>
                <Square className="h-3.5 w-3.5" /> Cancel
              </Button>
            ) : (
              <Button
                type="button"
                className="cursor-pointer gap-1.5"
                disabled={!engineReady || installingEngine || idea.trim().length < 20 || log.trim().length < 10}
                onClick={() => void run()}
              >
                <Sparkles className="h-3.5 w-3.5" /> Run
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              disabled={!lastArtifacts?.draftTex || busyApply}
              onClick={() => void applyToNotebook()}
            >
              {busyApply ? "Applying…" : "Apply to Notebook"}
            </Button>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden p-4 md:p-6">
          <div className="relative flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 py-6 shadow-sm md:gap-4 md:py-8">
            {ORCHESTRA_STAGES.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 md:gap-4">
                <StageNode label={s.id === "plotting" && !usePlotting ? "Plotting (off)" : s.label} state={nodeStates[i]!} index={i} />
                {i < ORCHESTRA_STAGES.length - 1 ? (
                  <div
                    className={cn(
                      "hidden h-px w-6 md:block md:w-10",
                      nodeStates[i] === "done" ? "bg-primary/60" : "bg-border"
                    )}
                  />
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-[#0d1117] shadow-sm">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-[#161b22] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                Live engine log
                {running ? (
                  <span className="inline-flex items-center gap-1 normal-case tracking-normal text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" /> {currentStage}
                  </span>
                ) : (
                  <span className="normal-case tracking-normal opacity-70">· {currentStage}</span>
                )}
              </span>
              <span className="normal-case tracking-normal text-[10px] opacity-50">
                {logLines.length} lines
              </span>
            </div>
            <pre
              ref={logScrollRef}
              className="min-h-[12rem] flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"
            >
              {logLines.length
                ? logLines.join("\n")
                : running
                  ? "Starting engine — output streams here as agents run…"
                  : "Stage output will stream here when you Run."}
            </pre>
          </div>

          {lastArtifacts?.outline ? (
            <details className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-sm">
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
