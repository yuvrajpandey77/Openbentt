/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_RESEARCH_PROXY_URL?: string;
  /** HTTPS URL of POST endpoint that accepts raw .tex (text/plain) and returns application/pdf */
  readonly VITE_LATEX_COMPILE_URL?: string;
  /** Set to "1" to skip client WASM and use HTTP compile only */
  readonly VITE_LATEX_REMOTE?: string;
  /** Optional `owner/repo` for GitHub Releases (defaults to the public upstream if unset) */
  readonly VITE_GITHUB_REPO?: string;
  /** Version string inside published asset names (e.g. 2.0.2 in Openbentt-2.0.2.AppImage) */
  readonly VITE_DESKTOP_ASSET_VERSION?: string;
  /** Injected from package.json in vite.config (semver for release asset filenames). */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Exposed from `electron/preload.cjs` in the desktop shell only. */
interface OpenbenttDesktopApi {
  readonly isElectron: boolean;
  readonly platform: string;
}

interface OpenbenttResearchApi {
  init: () => Promise<{ migrated: number; schemaVersion: number }>;
  listProjects: () => Promise<
    { id: string; title: string; updatedAt: string; paperCount: number }[]
  >;
  getActiveProjectId: () => Promise<string>;
  setActiveProjectId: (id: string | null) => Promise<{ ok: boolean }>;
  loadProject: (id: string) => Promise<unknown | null>;
  saveProject: (data: unknown) => Promise<{ ok: boolean }>;
  patchDraft: (projectId: string, content: string) => Promise<{ ok: boolean; updatedAt: string }>;
  patchBibliography: (projectId: string, content: string) => Promise<{ ok: boolean; updatedAt: string }>;
  deleteProject: (id: string) => Promise<{ ok: boolean }>;
  storePaperPdf: (projectId: string, paperId: string, base64: string) => Promise<{ ok: boolean }>;
  loadEmbeddings: (projectId: string, chunkIds?: string[]) => Promise<Record<string, number[]>>;
  upsertEmbeddings: (
    projectId: string,
    batch: { chunkId: string; vector: number[] }[]
  ) => Promise<{ count: number }>;
  embeddingStats: (projectId: string) => Promise<{ count: number; dim: number }>;
  clearEmbeddings: (projectId: string) => Promise<{ ok: boolean }>;
  deleteEmbeddingsForChunks: (projectId: string, chunkIds: string[]) => Promise<{ ok: boolean }>;
  enqueueJob: (projectId: string, type: string, payload: unknown) => Promise<{ jobId: string }>;
  cancelJob: (projectId: string, jobId: string) => Promise<{ ok: boolean }>;
  cancelAllJobs: (projectId: string) => Promise<{ ok: boolean }>;
  listJobs: (projectId: string) => Promise<unknown[]>;
  createSnapshot: (projectId: string, reason?: string) => Promise<{ id: string; createdAt: string } | null>;
  listSnapshots: (projectId: string) => Promise<{ id: string; reason: string; createdAt: string }[]>;
  restoreSnapshot: (snapshotId: string) => Promise<unknown>;
  pushDraftHistory: (
    projectId: string,
    content: string,
    label?: string
  ) => Promise<{ id: string; createdAt: string }>;
  listDraftHistory: (projectId: string) => Promise<unknown[]>;
  restoreDraftHistory: (entryId: string) => Promise<{ projectId: string; content: string }>;
  exportFinetuneCorpus: (projectId: string) => Promise<{ path: string; count: number }>;
  onJobProgress: (
    cb: (payload: {
      projectId: string;
      jobId: string;
      status: string;
      progress: number;
      message?: string;
    }) => void
  ) => () => void;
}

interface Window {
  readonly openbenttDesktop?: OpenbenttDesktopApi;
  readonly openbenttLocalGguf?: import("@/lib/localGguf/desktopApi").OpenbenttLocalGgufApi;
  readonly openbenttSecrets?: import("@/lib/privacy/desktopSecrets").OpenbenttSecretsApi;
  readonly openbenttResearch?: OpenbenttResearchApi;
  readonly openbenttZotero?: import("@/lib/zotero/desktopApi").OpenbenttZoteroApi;
}

/** WebGPU (Chrome / Edge / Electron); optional until DOM lib catches up. */
interface Navigator {
  readonly gpu?: GPU;
}
