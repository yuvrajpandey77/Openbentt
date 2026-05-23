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
  saveProjectEmbeddingsOnly,
  saveResearchProject,
  setActiveProjectId,
} from "@/lib/research/projectStore";
import { rebuildProjectCorpus } from "@/lib/research/corpusPipeline";
import { arrayBufferToBase64 } from "@/lib/research/base64";
import { extractNotebookSourceFromPdf } from "@/lib/pdfText";
import { inferPdfMetadata } from "@/lib/research/citationTools";
import { displayPaperTitle } from "@/lib/research/displayPaperLabel";
import { extractPdfReviewAnnotations } from "@/lib/pdfAnnotations";
import { requestSemanticIndexRebuild } from "@/lib/research/embeddingPipeline";
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
import {
  migrateProjectIntegrity,
  pickCleanDraftHistoryEntry,
} from "@/lib/research/contentIntegrity";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { isDesktopApp } from "@/lib/isDesktopApp";

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
  importProjectFromFile: (file: File) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  updateProject: (patch: Partial<ResearchProjectData>) => Promise<void>;
  setDraftTex: (tex: string) => void;
  setBibliography: (bib: string) => void;
  setTargetVenue: (venue: ResearchProjectData["targetVenue"]) => Promise<void>;
  uploadPaperPdf: (file: File) => Promise<void>;
  updatePaperReview: (
    paperId: string,
    patch: Partial<import("@/types/researchProject").ResearchPaper>
  ) => Promise<void>;
  addProjectFile: (
    path: string,
    content: string,
    kind: import("@/types/researchProject").ProjectFileKind
  ) => Promise<void>;
  deleteProjectFile: (fileId: string) => Promise<void>;
  renameProjectFile: (fileId: string, newPath: string) => Promise<void>;
  updateProjectFileContent: (fileId: string, content: string) => void;
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
  const draftPendingRef = useRef<string | null>(null);
  const integrityWarnedRef = useRef<string | null>(null);

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
    const p = await loadResearchProject(activeId);
    setProject(p);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (isDesktopApp()) {
        try {
          await initResearchDesktop();
        } catch {
          /* non-fatal */
        }
      }
      await refreshProjects();
      const list = await listResearchProjects();
      if (list.length === 0) {
        const created = await createResearchProject("My research");
        setProject(created);
      } else {
        await loadActive();
        if (!(await getActiveProjectId())) {
          await setActiveProjectId(list[0].id);
          setProject(await loadResearchProject(list[0].id));
        }
      }
      setLoading(false);
    })();
  }, [loadActive, refreshProjects]);

  useEffect(() => {
    if (!isDesktopApp() || !project) return;
    return onResearchJobProgress((payload) => {
      if (payload.projectId !== project.id) return;
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
          const prevChunks = project.chunks;
          const reloaded = await loadResearchProject(project.id);
          if (!reloaded) return;
          const removed = chunkIdsRemovedAfterRechunk(prevChunks, reloaded.chunks);
          if (removed.length) await deleteEmbeddingsForChunksDesktop(project.id, removed);
          setProject(reloaded);
          runSemanticRebuildRef.current?.(reloaded.chunks, reloaded.id, { removedChunkIds: removed });
        })();
      }
      if (payload.status === "completed") {
        window.setTimeout(() => setBackgroundJob(null), 4000);
      }
    });
  }, [project?.id, project?.chunks, toast]);

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

  const maybeResumeIndexing = useCallback(
    (p: ResearchProjectData | null) => {
      if (!p) return;
      const cp = loadIndexCheckpoint(p.id);
      const lib = p.chunks.filter((c) => c.paperId !== "draft");
      const embedded = isDesktopApp()
        ? 0
        : Object.keys(p.chunkEmbeddings ?? {}).filter((k) => k !== "__query__").length;
      if (isDesktopApp()) {
        void embeddingStatsDesktop(p.id).then((stats) => {
          if (stats.count < lib.length) {
            runSemanticRebuildRef.current?.(p.chunks, p.id);
          }
        });
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
      const p = await loadResearchProject(id);
      setProject(p);
      maybeResumeIndexing(p);
    },
    [cancelSemanticIndexRebuildInner, maybeResumeIndexing]
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

  useEffect(() => {
    if (project && loadIndexCheckpoint(project.id)) {
      maybeResumeIndexing(project);
    }
  }, [project?.id, maybeResumeIndexing]);

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

  const importProjectFromFile = useCallback(
    async (file: File) => {
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
    [refreshProjects, toast]
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
      papers: ResearchProjectData["papers"]
    ) => {
      setDraftSaveStatus("saving");
      try {
        await patchProjectDraft(projectId, tex);
        if (isDesktopApp()) {
          await rebuildProjectCorpus(
            projectId,
            papers.map((p) => ({
              id: p.id,
              fileName: p.fileName,
              extractedText: p.extractedText,
            })),
            tex
          );
        } else {
          const loaded = await loadResearchProject(projectId);
          if (loaded) setProject(loaded);
        }
        setDraftSaveStatus("saved");
        window.setTimeout(() => setDraftSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
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
    (tex: string) => {
      if (!project) return;
      if (tex.length > LIMITS.maxDraftChars) {
        toast({
          title: "Draft too large",
          description: `Maximum ${LIMITS.maxDraftChars.toLocaleString()} characters.`,
          variant: "destructive",
        });
        return;
      }
      setProject((p) => (p ? { ...p, draftTex: tex } : p));
      setDraftSaveStatus("dirty");
      draftPendingRef.current = tex;
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        const pending = draftPendingRef.current;
        if (pending != null) void flushDraft(project.id, pending, project.papers);
      }, DRAFT_DEBOUNCE_MS);
    },
    [flushDraft, project, toast]
  );

  const bibTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectFileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectFilePendingRef = useRef<{ fileId: string; content: string } | null>(null);

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
      importProjectFromFile,
      removeProject,
      updateProject,
      setDraftTex,
      setBibliography,
      setTargetVenue: async (venue) => updateProject({ targetVenue: venue }),
      uploadPaperPdf: async (file) => {
        if (!project) return;
        if (project.papers.length >= LIMITS.maxPapers) {
          toast({
            title: "Paper limit reached",
            description: `This project supports up to ${LIMITS.maxPapers} PDFs.`,
            variant: "destructive",
          });
          return;
        }
        const buf = await file.arrayBuffer();
        const extracted = await extractNotebookSourceFromPdf(buf);
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
        setProject(next);
        await refreshProjects();
        void createProjectSnapshot(project.id, "after-upload");
        const annCount = reviewNotes?.length ?? 0;
        toast({
          title: "Paper added",
          description:
            displayPaperTitle({ fileName: file.name, metadata: meta }) +
            (annCount > 0 ? ` · ${annCount} PDF review note(s) captured` : ""),
        });
        runSemanticRebuild(next.chunks, next.id);
      },
      updatePaperReview,
      addProjectFile,
      deleteProjectFile,
      renameProjectFile,
      updateProjectFileContent,
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
      importProjectFromFile,
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
