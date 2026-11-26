import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ResearchProjectData, ResearchProjectSummary, ProjectFile, ProjectFileKind, PaperReviewStatus } from "@/types/researchProject";
import {
  addPaperToProject,
  createResearchProject,
  deleteResearchProject,
  getActiveProjectId,
  loadResearchProject,
  listResearchProjects,
  patchProjectBibliography,
  patchProjectDraft,
  patchProjectKnowledge,
  saveProjectEmbeddingsOnly,
  saveResearchProject,
  setActiveProjectId,
} from "@/lib/research/projectStore";
import { rebuildProjectCorpus } from "@/lib/research/corpusPipeline";
import { arrayBufferToBase64 } from "@/lib/research/base64";
import { inferPdfMetadata } from "@/lib/research/citationTools";
import { displayPaperTitle } from "@/lib/research/displayPaperLabel";
import { extractPdfReviewAnnotations } from "@/lib/pdfAnnotations";
import { requestSemanticIndexRebuild } from "@/lib/research/embeddingPipeline";

export const OPEN_PAPER_KEY = "openbentt-open-paper";
export const ASK_HINT_KEY = "openbentt-ask-hint";

/** Phase 3/C: instrument the real project-load path used by Notebook. */
async function loadProjectWithMarks(projectId: string) {
  window.__openbenttNotebookMarks?.projectLoadingStarted?.({ projectId });
  const project = await loadResearchProject(projectId);
  window.__openbenttNotebookMarks?.databaseResponseReceived?.({ projectId });
  return project;
}

function notePaperReady(paperId: string | null) {
  if (!paperId) return;
  try {
    sessionStorage.setItem(OPEN_PAPER_KEY, paperId);
    sessionStorage.setItem(ASK_HINT_KEY, paperId);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("openbentt-paper-added", { detail: { paperId } }));
}
import type { EmbeddingIndexProgress } from "@/lib/research/embeddingIndex";
import {
  chunkIdsRemovedAfterRechunk,
} from "@/lib/research/desktopEmbedJob";
import {
  deleteEmbeddingsForChunksDesktop,
  embeddingStatsDesktop,
} from "@/lib/research/researchDesktopApi";
import { loadIndexCheckpoint } from "@/lib/research/indexCheckpoint";
import {
  assessProjectPressure,
  LIMITS,
  type ProjectPressure,
} from "@/lib/research/projectLimits";
import {
  createProjectSnapshot,
  initResearchDesktop,
  listDraftHistoryDesktop,
  onBeforeQuitSnapshot,
  onResearchJobProgress,
  restoreDraftHistoryDesktop,
} from "@/lib/research/researchDesktopApi";
import { createProjectFromTemplate as createProjectFromTemplateStore } from "@/lib/research/createProjectFromTemplate";
import type { TemplateCatalogEntry } from "@/lib/research/templateCatalog";
import {
  migrateProjectIntegrity,
  pickCleanDraftHistoryEntry,
} from "@/lib/research/contentIntegrity";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { useChat } from "@/context/ChatContext";
import { assembleResearchContext, formatRetrievalForPrompt, ragBudgetForProvider } from "@/lib/ai/researchOrchestrator";
import { buildTfidfIndex } from "@/lib/research/corpusIndex";
import { resolveLibraryEmbeddings } from "@/lib/research/embeddingLoader";

type BackgroundJobStatus = {
  jobId: string;
  type: string;
  status: string;
  progress: number;
  message?: string;
};

export type DraftSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type ResearchProjectContextValue = {
  projects: ResearchProjectSummary[];
  project: ResearchProjectData | null;
  loading: boolean;
  draftSaveStatus: DraftSaveStatus;
  projectPressure: ProjectPressure | null;
  semanticIndexProgress: EmbeddingIndexProgress | null;
  semanticIndexRebuilding: boolean;
  backgroundJob: BackgroundJobStatus | null;
  refreshProjects: () => Promise<void>;
  selectProject: (id: string) => Promise<void>;
  createProject: (title: string) => Promise<void>;
  createProjectFromTemplate: (title: string, entry: TemplateCatalogEntry) => Promise<void>;
  importProjectFromFile: (file: File) => Promise<void>;
  importProjectFromFolder: (files: FileList | File[]) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  updateProject: (patch: Partial<ResearchProjectData>) => Promise<void>;
  setDraftTex: (tex: string, opts?: { immediate?: boolean }) => void;
  setBibliography: (bib: string) => void;
  setTargetVenue: (venue: ResearchProjectData["targetVenue"]) => Promise<void>;
  uploadPaperPdf: (file: File) => Promise<string | null>;
  updatePaperReview: (
    paperId: string,
    patch: Partial<import("@/types/researchProject").ResearchPaper>
  ) => Promise<void>;
  addProjectFile: (
    path: string,
    content: string,
    kind: import("@/types/researchProject").ProjectFileKind
  ) => Promise<string | void>;
  deleteProjectFile: (fileId: string) => Promise<void>;
  renameProjectFile: (fileId: string, newPath: string) => Promise<void>;
  updateProjectFileContent: (fileId: string, content: string) => void;
  updateKnowledge: (content: string) => Promise<void>;
  linkThread: (threadId: string) => Promise<void>;
  recordModelAttribution: (model: string, section: string) => Promise<void>;
  rebuildSemanticIndex: () => void;
  cancelSemanticIndexRebuild: () => void;
  retryRechunkJob: () => Promise<void>;
  dismissBackgroundJob: () => void;
  createSnapshot: (reason?: string) => Promise<void>;
  saveDraftNow: () => Promise<void>;
};

const ResearchProjectContext = createContext<ResearchProjectContextValue | null>(null);

const DRAFT_DEBOUNCE_MS = 800;

export function ResearchProjectProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [projects, setProjects] = useState<ResearchProjectSummary[]>([]);
  const [project, setProject] = useState<ResearchProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>("idle");
  const [semanticIndexProgress, setSemanticIndexProgress] = useState<EmbeddingIndexProgress | null>(
    null
  );
  const [semanticIndexRebuilding, setSemanticIndexRebuilding] = useState(false);
  const [backgroundJob, setBackgroundJob] = useState<BackgroundJobStatus | null>(null);
  const rebuildRef = useRef<ReturnType<typeof requestSemanticIndexRebuild> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftPendingRef = useRef<string | null>(null);
  const integrityWarnedRef = useRef<string | null>(null);
  const projectRef = useRef<ResearchProjectData | null>(null);
  projectRef.current = project;

  const { registerCorpusRagProvider, registerChatLogPersister, registerAgentProjectProvider, apiConfig } = useChat();

  // Register corpus RAG provider whenever there's an active project.
  // Cache TF-IDF per chunk fingerprint — rebuilding on every query froze chat in Notebook.
  const tfidfCacheRef = useRef<{ key: string; index: ReturnType<typeof buildTfidfIndex> } | null>(null);
  useEffect(() => {
    if (!project?.chunks.length) {
      registerCorpusRagProvider(null);
      tfidfCacheRef.current = null;
      return;
    }
    const budget = ragBudgetForProvider(apiConfig.aiProvider);
    registerCorpusRagProvider(async (query: string) => {
      const p = projectRef.current;
      if (!p || !p.chunks.length) return "";
      try {
        const names = Object.fromEntries(
          p.papers.map((paper) => [paper.id, paper.metadata.title ?? paper.fileName])
        );
        const key = `${p.id}:${p.chunks.length}:${p.chunks[0]?.id ?? ""}:${p.chunks[p.chunks.length - 1]?.id ?? ""}`;
        let tfidf = tfidfCacheRef.current?.key === key ? tfidfCacheRef.current.index : null;
        if (!tfidf) {
          tfidf = buildTfidfIndex(p.chunks);
          tfidfCacheRef.current = { key, index: tfidf };
        }
        const vectors = await resolveLibraryEmbeddings(p.id, p.chunks, p.chunkEmbeddings);
        const { hybridRetrieveV2 } = await import("@/lib/research/retrievalV2");
        const hits = await hybridRetrieveV2(query, p.chunks, names, tfidf, vectors, {
          limit: budget.hitLimit,
        });
        return formatRetrievalForPrompt(hits, budget.maxChars);
      } catch {
        return "";
      }
    });
    return () => registerCorpusRagProvider(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.chunks.length, registerCorpusRagProvider, apiConfig.aiProvider]);

  // Register chat-log persister when a project is active (desktop only).
  useEffect(() => {
    if (!project?.id || !isDesktopApp()) {
      registerChatLogPersister(null);
      return;
    }
    const pid = project.id;
    registerChatLogPersister((threadId, role, content, model) => {
      const api = window.openbenttResearch as {
        appendChatLog?: (
          projectId: string,
          entry: { id: string; threadId: string; role: string; content: string; model?: string }
        ) => void;
      };
      api?.appendChatLog?.(pid, {
        id: crypto.randomUUID(),
        threadId,
        role,
        content,
        model: model || undefined,
      });
    });
    return () => registerChatLogPersister(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, registerChatLogPersister]);

  // Register the active project id so agent runs scope tool calls to it.
  useEffect(() => {
    if (!project?.id) {
      registerAgentProjectProvider(null);
      return;
    }
    const pid = project.id;
    registerAgentProjectProvider(() => pid);
    return () => registerAgentProjectProvider(null);
  }, [project?.id, registerAgentProjectProvider]);

  const restoreCleanDraftFromHistory = useCallback(async () => {
    if (!project?.id || !isDesktopApp()) {
      toast({
        title: "Restore unavailable",
        description: "Draft history restore requires the desktop app.",
        variant: "destructive",
      });
      return;
    }
    const entries = await listDraftHistoryDesktop(project.id);
    const pick = pickCleanDraftHistoryEntry(entries);
    if (!pick) {
      toast({
        title: "No clean draft snapshot",
        description: "History entries also look like PDF extract. Edit main.tex manually or import a .tex file.",
        variant: "destructive",
      });
      return;
    }
    const restored = await restoreDraftHistoryDesktop(pick.id);
    if (!restored?.content) {
      toast({ title: "Restore failed", variant: "destructive" });
      return;
    }
    await patchProjectDraft(project.id, restored.content);
    setProject((p) => (p ? { ...p, draftTex: restored.content } : p));
    toast({ title: "Draft restored", description: "Recovered main.tex from draft history." });
  }, [project?.id, toast]);

  useEffect(() => {
    if (!project) return;
    const report = migrateProjectIntegrity(project);
    if (!report.draftWasCorrupted && !report.bibliographyWasCorrupted) return;
    if (integrityWarnedRef.current === project.id) return;
    integrityWarnedRef.current = project.id;
    const target = report.bibliographyWasCorrupted ? "references.bib" : "main.tex";
    toast({
      title: `${target} may contain PDF text`,
      description:
        "This looks like extracted PDF saved by an older bug. Restore main.tex from history or edit manually.",
      action: report.draftWasCorrupted ? (
        <ToastAction altText="Restore main.tex" onClick={() => void restoreCleanDraftFromHistory()}>
          Restore main.tex
        </ToastAction>
      ) : undefined,
    });
  }, [project, toast, restoreCleanDraftFromHistory]);

  const projectPressure = useMemo(
    () => (project ? assessProjectPressure(project) : null),
    [project]
  );

  const refreshProjects = useCallback(async () => {
    const list = await listResearchProjects();
    setProjects(list);
  }, []);

  const loadActive = useCallback(async () => {
    const activeId = await getActiveProjectId();
    if (!activeId) {
      setProject(null);
      return;
    }
    const p = await loadProjectWithMarks(activeId);
    setProject(p);
  }, []);

  useEffect(() => {
    ;(async () => {
      try {
        if (isDesktopApp()) {
          try {
            await initResearchDesktop();
          } catch {
            /* non-fatal */
          }
        }
        const list = await listResearchProjects();
        setProjects(list);
        if (list.length === 0) {
          const created = await createResearchProject("My research");
          setProject(created);
          return;
        }
        await loadActive();
        if (!(await getActiveProjectId())) {
          await setActiveProjectId(list[0].id);
          setProject(await loadProjectWithMarks(list[0].id));
        }
      } catch (e) {
        // A failed DB/IPC call must never leave the Notebook stuck on its loader.
        console.error("[research] startup failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadActive]);

  const projectChunksRef = useRef(project?.chunks);
  projectChunksRef.current = project?.chunks;

  useEffect(() => {
    if (!isDesktopApp() || !project?.id) return;
    const projectId = project.id;
    return onResearchJobProgress((payload) => {
      if (payload.projectId !== projectId) return;
      const jobType = payload.jobType ?? "rechunk";
      setBackgroundJob({
        jobId: payload.jobId,
        type: jobType,
        status: payload.status,
        progress: payload.progress,
        message: payload.message,
      });
      if (payload.status === "completed" && jobType === "rechunk") {
        void (async () => {
          const prevChunks = projectChunksRef.current ?? [];
          const reloaded = await loadResearchProject(projectId);
          if (!reloaded) return;
          const removed = chunkIdsRemovedAfterRechunk(prevChunks, reloaded.chunks);
          // Draft-only churn must not kick MiniLM — only library paper chunks.
          const libRemoved = removed.filter((id) => !id.includes("draft"));
          const prevLib = prevChunks
            .filter((c) => c.paperId !== "draft")
            .map((c) => c.id)
            .sort()
            .join("|");
          const nextLib = reloaded.chunks
            .filter((c) => c.paperId !== "draft")
            .map((c) => c.id)
            .sort()
            .join("|");
          if (libRemoved.length) await deleteEmbeddingsForChunksDesktop(projectId, libRemoved);
          setProject(reloaded);
          if (libRemoved.length || prevLib !== nextLib) {
            runSemanticRebuildRef.current?.(reloaded.chunks, reloaded.id, {
              removedChunkIds: libRemoved,
            });
          }
        })();
      }
      if (payload.status === "completed") {
        if (bgClearTimerRef.current) clearTimeout(bgClearTimerRef.current);
        bgClearTimerRef.current = setTimeout(() => setBackgroundJob(null), 4000);
      }
    });
  }, [project?.id]);

  useEffect(() => {
    if (!isDesktopApp()) return;
    return onBeforeQuitSnapshot(() => {
      if (project?.id) void createProjectSnapshot(project.id, "before-quit");
    });
  }, [project?.id]);

  const cancelSemanticIndexRebuildInner = useCallback(() => {
    rebuildRef.current?.abort();
    rebuildRef.current = null;
    setSemanticIndexRebuilding(false);
    setSemanticIndexProgress(null);
  }, []);

  const cancelSemanticIndexRebuild = useCallback(() => {
    cancelSemanticIndexRebuildInner();
  }, [cancelSemanticIndexRebuildInner]);

  const resumeIndexTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maybeResumeIndexing = useCallback(
    (p: ResearchProjectData | null) => {
      if (!p) return;
      const lib = p.chunks.filter((c) => c.paperId !== "draft");
      if (lib.length === 0) return;
      const cp = loadIndexCheckpoint(p.id);
      const embedded = isDesktopApp()
        ? 0
        : Object.keys(p.chunkEmbeddings ?? {}).filter((k) => k !== "__query__").length;
      if (isDesktopApp()) {
        // Defer embed resume so Notebook first paint isn't blocked by MiniLM IPC.
        if (resumeIndexTimerRef.current) clearTimeout(resumeIndexTimerRef.current);
        const projectId = p.id;
        const chunks = p.chunks;
        const libCount = lib.length;
        resumeIndexTimerRef.current = setTimeout(() => {
          resumeIndexTimerRef.current = null;
          void embeddingStatsDesktop(projectId).then((stats) => {
            if (stats.count < libCount) {
              runSemanticRebuildRef.current?.(chunks, projectId);
            }
          });
        }, 2500);
        return;
      }
      if (cp && cp.doneIds.length < cp.total && embedded < lib.length) {
        toast({
          title: "Resuming semantic index",
          description: `${cp.doneIds.length}/${cp.total} passages already embedded.`,
        });
        runSemanticRebuildRef.current?.(p.chunks, p.id);
      }
    },
    [toast]
  );

  const runSemanticRebuildRef = useRef<
    (
      chunks: ResearchProjectData["chunks"],
      projectId: string,
      opts?: { removedChunkIds?: string[] }
    ) => void
  >(() => {});

  const selectProject = useCallback(
    async (id: string) => {
      cancelSemanticIndexRebuildInner();
      await setActiveProjectId(id);
      const p = await loadProjectWithMarks(id);
      setProject(p);
      // Do not auto-embed on open — MiniLM on Notebook enter froze the whole app.
    },
    [cancelSemanticIndexRebuildInner]
  );

  const persist = useCallback(
    async (data: ResearchProjectData, opts?: { skipChunks?: boolean }) => {
      const saved = await saveResearchProject(data, opts);
      setProject(saved);
      await refreshProjects();
      return saved;
    },
    [refreshProjects]
  );

  const runSemanticRebuild = useCallback(
    (
      chunks: ResearchProjectData["chunks"],
      projectId: string,
      opts?: { removedChunkIds?: string[] }
    ) => {
      if (chunks.filter((c) => c.paperId !== "draft").length === 0) return;
      cancelSemanticIndexRebuildInner();
      setSemanticIndexRebuilding(true);
      const job = requestSemanticIndexRebuild(chunks, projectId, setSemanticIndexProgress, opts);
      rebuildRef.current = job;
      void job.promise
        .then(async (result) => {
          if (!result) return;
          if (isDesktopApp()) {
            const current = await loadResearchProject(projectId);
            if (current) setProject(current);
            if (typeof result === "object" && result !== null && "embedded" in result) {
              const stats = await embeddingStatsDesktop(projectId);
              toast({
                title: "Semantic index ready",
                description: `${stats.count} passages embedded.`,
              });
            }
            return;
          }
          const vectors = result as Record<string, number[]>;
          await saveProjectEmbeddingsOnly(projectId, vectors);
          const current = await loadResearchProject(projectId);
          if (!current) return;
          setProject({ ...current, chunkEmbeddings: vectors });
          toast({
            title: "Semantic index ready",
            description: `${Object.keys(vectors).length} passages embedded.`,
          });
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          const cp = loadIndexCheckpoint(projectId);
          toast({
            title: "Semantic index failed",
            description:
              (e instanceof Error ? e.message : "error") +
              (cp ? " — partial progress saved; retry to resume." : ""),
            variant: "destructive",
          });
        })
        .finally(() => {
          rebuildRef.current = null;
          setSemanticIndexRebuilding(false);
          setSemanticIndexProgress(null);
        });
    },
    [cancelSemanticIndexRebuildInner, toast]
  );

  runSemanticRebuildRef.current = runSemanticRebuild;

  // Indexing resumes only from an explicit rebuild or after a paper upload.
  // Opening Notebook must not start MiniLM.

  const rebuildSemanticIndex = useCallback(() => {
    if (!project) return;
    runSemanticRebuild(project.chunks, project.id);
  }, [project, runSemanticRebuild]);

  const createProject = useCallback(
    async (title: string) => {
      const p = await createResearchProject(title);
      setProject(p);
      await refreshProjects();
      toast({ title: "Project created", description: p.title });
    },
    [refreshProjects, toast]
  );

  const createProjectFromTemplate = useCallback(
    async (title: string, entry: TemplateCatalogEntry) => {
      const p = await createProjectFromTemplateStore(title, entry);
      setProject(p);
      await refreshProjects();
      toast({
        title: "Project created from template",
        description: `${p.title} · ${entry.label}${entry.requiresLocalTex ? " (use Local TeX to compile)" : ""}`,
      });
    },
    [refreshProjects, toast]
  );

  const importProjectFromFile = useCallback(
    async (file: File) => {
      if (/\.zip$/i.test(file.name)) {
        const { importProjectFromZip } = await import("@/lib/research/importProjectArchive");
        const arch = await importProjectFromZip(file);
        const now = new Date().toISOString();
        const p = await createResearchProject(arch.title, {
          draftTex: arch.draftTex,
          bibliography: arch.bibliography,
        });
        const withFiles = {
          ...p,
          projectFiles: arch.projectFiles.map((f, i) => ({
            id: `imp-${i}-${Date.now()}`,
            path: f.path,
            kind: f.kind,
            content: f.content,
            addedAt: now,
            updatedAt: now,
          })),
        };
        await persist(withFiles);
        setProject(withFiles);
        await refreshProjects();
        toast({
          title: "ZIP imported",
          description: `${withFiles.title} · ${arch.fileCount} file(s) · Overleaf/Prism/Codex compatible`,
        });
        return;
      }
      const text = await file.text();
      const name = file.name.replace(/\.(tex|bib)$/i, "").trim() || "Imported project";
      const isBib = /\.bib$/i.test(file.name);
      const p = await createResearchProject(
        name,
        isBib ? { bibliography: text } : { draftTex: text }
      );
      setProject(p);
      await refreshProjects();
      toast({ title: "Project imported", description: p.title });
    },
    [persist, refreshProjects, toast]
  );

  const importProjectFromFolder = useCallback(
    async (files: FileList | File[]) => {
      const { importProjectFromFolderFiles } = await import("@/lib/research/importProjectArchive");
      const arch = await importProjectFromFolderFiles(files);
      const now = new Date().toISOString();
      const p = await createResearchProject(arch.title, {
        draftTex: arch.draftTex,
        bibliography: arch.bibliography,
      });
      const withFiles = {
        ...p,
        projectFiles: arch.projectFiles.map((f, i) => ({
          id: `imp-${i}-${Date.now()}`,
          path: f.path,
          kind: f.kind,
          content: f.content,
          addedAt: now,
          updatedAt: now,
        })),
      };
      await persist(withFiles);
      setProject(withFiles);
      await refreshProjects();
      toast({
        title: "Folder imported",
        description: `${withFiles.title} · ${arch.fileCount} file(s)`,
      });
    },
    [persist, refreshProjects, toast]
  );

  const removeProject = useCallback(
    async (id: string) => {
      await deleteResearchProject(id);
      await refreshProjects();
      await loadActive();
      toast({ title: "Project removed" });
    },
    [loadActive, refreshProjects, toast]
  );

  const updateProject = useCallback(
    async (patch: Partial<ResearchProjectData>) => {
      if (!project) return;
      const next = { ...project, ...patch };
      if (patch.papers || patch.draftTex) {
        const paperInputs = next.papers.map((p) => ({
          id: p.id,
          fileName: p.fileName,
          extractedText: p.extractedText,
        }));
        const rebuild = await rebuildProjectCorpus(project.id, paperInputs, next.draftTex);
        if (rebuild.mode === "sync") {
          next.chunks = rebuild.chunks;
          if (patch.papers) {
            next.chunkEmbeddings = undefined;
            runSemanticRebuild(next.chunks, next.id);
          }
        } else if (patch.papers) {
          next.chunkEmbeddings = undefined;
        }
        const skipChunks = rebuild.mode === "queued";
        await persist(next, skipChunks ? { skipChunks: true } : undefined);
        return;
      }
      await persist(next);
    },
    [persist, project, runSemanticRebuild]
  );

  const flushDraft = useCallback(
    async (
      projectId: string,
      tex: string,
      _papers: ResearchProjectData["papers"]
    ) => {
      setDraftSaveStatus("saving");
      try {
        // Draft-only patch — do NOT enqueue rechunk/embed on every keystroke.
        // Corpus rebuild runs when papers change (updateProject), not on typing.
        await patchProjectDraft(projectId, tex);
        if (!isDesktopApp()) {
          const loaded = await loadResearchProject(projectId);
          if (loaded) setProject(loaded);
        }
        setDraftSaveStatus("saved");
        if (draftStatusTimerRef.current) clearTimeout(draftStatusTimerRef.current);
        draftStatusTimerRef.current = setTimeout(
          () => setDraftSaveStatus((s) => (s === "saved" ? "idle" : s)),
          2000
        );
      } catch {
        setDraftSaveStatus("error");
      }
    },
    []
  );

  const retryRechunkJob = useCallback(async () => {
    if (!project) return;
    setBackgroundJob(null);
    await rebuildProjectCorpus(
      project.id,
      project.papers.map((p) => ({
        id: p.id,
        fileName: p.fileName,
        extractedText: p.extractedText,
      })),
      project.draftTex
    );
  }, [project]);

  const dismissBackgroundJob = useCallback(() => setBackgroundJob(null), []);

  const setDraftTex = useCallback(
    (tex: string, opts?: { immediate?: boolean }) => {
      const current = projectRef.current;
      if (!current) return;
      if (tex.length > LIMITS.maxDraftChars) {
        toast({
          title: "Draft too large",
          description: `Maximum ${LIMITS.maxDraftChars.toLocaleString()} characters.`,
          variant: "destructive",
        });
        return;
      }
      // Keep keystrokes out of React state. Updating `project` every character
      // re-rendered Sidebar, chat, and the whole Notebook studio.
      draftPendingRef.current = tex;
      setDraftSaveStatus((s) => (s === "dirty" ? s : "dirty"));
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      const projectId = current.id;
      const commit = () => {
        const pending = draftPendingRef.current;
        const live = projectRef.current;
        if (pending == null || !live || live.id !== projectId) return;
        setProject((p) => (p && p.id === projectId ? { ...p, draftTex: pending } : p));
        void flushDraft(projectId, pending, live.papers);
      };
      if (opts?.immediate) {
        commit();
        return;
      }
      draftTimerRef.current = setTimeout(commit, DRAFT_DEBOUNCE_MS);
    },
    [flushDraft, toast]
  );

  const bibTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectFileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectFilePendingRef = useRef<{ fileId: string; content: string } | null>(null);

  // Tear down timers on unmount. Do NOT abort semantic rebuild / embedding workers
  // here — ResearchProjectProvider is app-scoped; aborting would cancel work on HMR
  // and violates "leaving a surface must not cancel work". Explicit cancel or quit only.
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      if (draftStatusTimerRef.current) clearTimeout(draftStatusTimerRef.current);
      if (bgClearTimerRef.current) clearTimeout(bgClearTimerRef.current);
      if (bibTimerRef.current) clearTimeout(bibTimerRef.current);
      if (projectFileTimerRef.current) clearTimeout(projectFileTimerRef.current);
      if (resumeIndexTimerRef.current) clearTimeout(resumeIndexTimerRef.current);
    };
  }, []);

  const setBibliography = useCallback(
    (bib: string) => {
      if (!project) return;
      setProject((p) => (p ? { ...p, bibliography: bib } : p));
      if (bibTimerRef.current) clearTimeout(bibTimerRef.current);
      bibTimerRef.current = setTimeout(() => {
        void patchProjectBibliography(project.id, bib);
      }, DRAFT_DEBOUNCE_MS);
    },
    [project]
  );

  const createSnapshot = useCallback(
    async (reason = "manual") => {
      if (!project) return;
      const snap = await createProjectSnapshot(project.id, reason);
      if (snap) {
        toast({ title: "Snapshot saved", description: snap.createdAt });
      }
    },
    [project, toast]
  );

  const saveDraftNow = useCallback(async () => {
    if (!project) return;
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    const pending = draftPendingRef.current ?? project.draftTex;
    draftPendingRef.current = null;
    await flushDraft(project.id, pending, project.papers);
  }, [flushDraft, project]);

  const updatePaperReview = useCallback(
    async (paperId: string, patch: Partial<import("@/types/researchProject").ResearchPaper>) => {
      if (!project) return;
      const papers = project.papers.map((p) => (p.id === paperId ? { ...p, ...patch } : p));
      setProject({ ...project, papers });
      await saveResearchProject({ ...project, papers });
    },
    [project]
  );

  const addProjectFile = useCallback(
    async (path: string, content: string, kind: ProjectFileKind) => {
      if (!project) return;
      const now = new Date().toISOString();
      const file: ProjectFile = {
        id: crypto.randomUUID(),
        path,
        kind,
        content,
        addedAt: now,
        updatedAt: now,
      };
      const projectFiles = [...(project.projectFiles ?? []), file];
      await updateProject({ projectFiles });
      toast({ title: "File added", description: path });
      return file.id;
    },
    [project, updateProject, toast]
  );

  const flushProjectFile = useCallback(
    async (fileId: string, content: string) => {
      if (!project) return;
      const now = new Date().toISOString();
      const projectFiles = (project.projectFiles ?? []).map((f) =>
        f.id === fileId ? { ...f, content, updatedAt: now } : f
      );
      await updateProject({ projectFiles });
    },
    [project, updateProject]
  );

  const updateProjectFileContent = useCallback(
    (fileId: string, content: string) => {
      if (!project) return;
      const now = new Date().toISOString();
      setProject((p) => {
        if (!p) return p;
        const projectFiles = (p.projectFiles ?? []).map((f) =>
          f.id === fileId ? { ...f, content, updatedAt: now } : f
        );
        return { ...p, projectFiles };
      });
      projectFilePendingRef.current = { fileId, content };
      if (projectFileTimerRef.current) clearTimeout(projectFileTimerRef.current);
      projectFileTimerRef.current = setTimeout(() => {
        const pending = projectFilePendingRef.current;
        if (pending) void flushProjectFile(pending.fileId, pending.content);
      }, DRAFT_DEBOUNCE_MS);
    },
    [flushProjectFile, project]
  );

  const deleteProjectFile = useCallback(
    async (fileId: string) => {
      if (!project) return;
      const projectFiles = (project.projectFiles ?? []).filter((f) => f.id !== fileId);
      await updateProject({ projectFiles });
      toast({ title: "File removed" });
    },
    [project, updateProject, toast]
  );

  const renameProjectFile = useCallback(
    async (fileId: string, newPath: string) => {
      if (!project) return;
      const now = new Date().toISOString();
      const projectFiles = (project.projectFiles ?? []).map((f) =>
        f.id === fileId ? { ...f, path: newPath, updatedAt: now } : f
      );
      await updateProject({ projectFiles });
      toast({ title: "File renamed", description: newPath });
    },
    [project, updateProject, toast]
  );

  const value = useMemo<ResearchProjectContextValue>(
    () => ({
      projects,
      project,
      loading,
      draftSaveStatus,
      projectPressure,
      semanticIndexProgress,
      semanticIndexRebuilding,
      backgroundJob,
      refreshProjects,
      selectProject,
      createProject,
      createProjectFromTemplate,
      importProjectFromFile,
      importProjectFromFolder,
      removeProject,
      updateProject,
      setDraftTex,
      setBibliography,
      setTargetVenue: async (venue) => updateProject({ targetVenue: venue }),
      uploadPaperPdf: async (file) => {
        if (!project) return null;
        if (project.papers.length >= LIMITS.maxPapers) {
          toast({
            title: "Paper limit reached",
            description: `This project supports up to ${LIMITS.maxPapers} PDFs.`,
            variant: "destructive",
          });
          return null;
        }
        const buf = await file.arrayBuffer();
        // Phase F: non-PDF sources go through the document adapters
        // (originals intact; derived text enters the corpus with provenance).
        if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
          const { ingestFile } = await import("@/lib/documents/adapters");
          const bytes = new Uint8Array(buf);
          const doc = await ingestFile({ fileName: file.name, mimeType: file.type, bytes }).catch(() => null);
          if (!doc) {
            toast({
              title: "Unsupported file",
              description: `${file.name} could not be read. Try PDF, DOCX, Markdown, or text.`,
              variant: "destructive",
            });
            return null;
          }
          const meta = inferPdfMetadata(doc.text);
          const next = await addPaperToProject(project, file.name, doc.text, meta, undefined, [
            `[ingested via ${doc.provenance.adapter} ${doc.provenance.version}]`,
          ]);
          const rebuild = await rebuildProjectCorpus(
            next.id,
            next.papers.map((p) => ({
              id: p.id,
              fileName: p.fileName,
              extractedText: p.extractedText,
            })),
            next.draftTex
          );
          if (rebuild.mode === "sync") {
            next.chunks = rebuild.chunks;
            next.chunkEmbeddings = undefined;
            await saveResearchProject(next);
            setProject(next);
            runSemanticRebuild(next.chunks, next.id);
          } else {
            next.chunkEmbeddings = undefined;
            await saveResearchProject(next, { skipChunks: true });
            setProject(next);
          }
          await refreshProjects();
          const paperId = next.papers[next.papers.length - 1]?.id ?? null;
          notePaperReady(paperId);
          toast({ title: "Source added", description: displayPaperTitle({ fileName: file.name, metadata: meta }) });
          return paperId;
        }
        const { extractResearchPdfWithOcr } = await import("@/lib/documents/pdfOcrIngest");
        const { text: extracted, ocrApplied, ocrAvailable } = await extractResearchPdfWithOcr(
          buf,
          file.name,
          { projectId: project.id },
        );
        const meta = inferPdfMetadata(extracted);
        const b64 = arrayBufferToBase64(buf);
        let reviewNotes: string[] | undefined;
        try {
          const ann = await extractPdfReviewAnnotations(buf);
          if (ann.length > 0) reviewNotes = ann.map((n) => `[p.${n.page}] ${n.text}`);
        } catch {
          /* optional */
        }
        const next = await addPaperToProject(project, file.name, extracted, meta, b64, reviewNotes);
        // addPaperToProject clears chunks — must rebuild corpus before embed.
        const rebuild = await rebuildProjectCorpus(
          next.id,
          next.papers.map((p) => ({
            id: p.id,
            fileName: p.fileName,
            extractedText: p.extractedText,
          })),
          next.draftTex
        );
        if (rebuild.mode === "sync") {
          next.chunks = rebuild.chunks;
          next.chunkEmbeddings = undefined;
          await saveResearchProject(next);
          setProject(next);
          runSemanticRebuild(next.chunks, next.id);
        } else {
          next.chunkEmbeddings = undefined;
          await saveResearchProject(next, { skipChunks: true });
          setProject(next);
        }
        await refreshProjects();
        const paperId = next.papers[next.papers.length - 1]?.id ?? null;
        notePaperReady(paperId);
        void createProjectSnapshot(project.id, "after-upload");
        const annCount = reviewNotes?.length ?? 0;
        const bodyOnly = extracted
          .replace(/--- PDF PAGE \d+ \/ \d+ ---/g, "")
          .replace(/\[Note:[\s\S]*$/g, "")
          .trim();
        const scannedEmpty = bodyOnly.length < 40;
        toast({
          title: "Paper added",
          description:
            displayPaperTitle({ fileName: file.name, metadata: meta }) +
            (ocrApplied ? " · OCR applied" : "") +
            (annCount > 0 ? ` · ${annCount} PDF review note(s) captured` : "") +
            (scannedEmpty && !ocrApplied
              ? ocrAvailable
                ? " · little text extracted (OCR did not improve it)"
                : " · scanned PDF — install system tesseract for OCR"
              : ""),
        });
        return paperId;
      },
      updatePaperReview,
      addProjectFile,
      deleteProjectFile,
      renameProjectFile,
      updateProjectFileContent,
      updateKnowledge: async (content) => {
        if (!project) return;
        setProject((prev) => (prev ? { ...prev, knowledge: content } : prev));
        await patchProjectKnowledge(project.id, content);
      },
      linkThread: async (threadId) => {
        if (!project) return;
        const ids = [...new Set([...project.linkedThreadIds, threadId])];
        await updateProject({ linkedThreadIds: ids });
      },
      recordModelAttribution: async (model, section) => {
        if (!project) return;
        const modelAttributions = [
          ...project.modelAttributions,
          { id: crypto.randomUUID(), model, section, appliedAt: new Date().toISOString() },
        ];
        await updateProject({ modelAttributions });
      },
      rebuildSemanticIndex,
      cancelSemanticIndexRebuild,
      retryRechunkJob,
      dismissBackgroundJob,
      createSnapshot,
      saveDraftNow,
    }),
    [
      project,
      projects,
      loading,
      draftSaveStatus,
      projectPressure,
      semanticIndexProgress,
      semanticIndexRebuilding,
      backgroundJob,
      refreshProjects,
      selectProject,
      createProject,
      createProjectFromTemplate,
      importProjectFromFile,
      importProjectFromFolder,
      removeProject,
      updateProject,
      setDraftTex,
      setBibliography,
      rebuildSemanticIndex,
      cancelSemanticIndexRebuild,
      retryRechunkJob,
      dismissBackgroundJob,
      createSnapshot,
      saveDraftNow,
      updatePaperReview,
      addProjectFile,
      deleteProjectFile,
      renameProjectFile,
      updateProjectFileContent,
    ]
  );

  return <ResearchProjectContext.Provider value={value}>{children}</ResearchProjectContext.Provider>;
}

export function useResearchProject(): ResearchProjectContextValue {
  const ctx = useContext(ResearchProjectContext);
  if (!ctx) throw new Error("useResearchProject requires ResearchProjectProvider");
  return ctx;
}
