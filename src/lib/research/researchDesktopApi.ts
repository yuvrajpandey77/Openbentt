import type { ResearchProjectData } from "@/types/researchProject";

export type ResearchJobRow = {
  id: string;
  type: string;
  status: string;
  progress: number;
  message: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSnapshotSummary = {
  id: string;
  reason: string;
  createdAt: string;
};

function api() {
  return window.openbenttResearch;
}

export function hasResearchDesktopApi(): boolean {
  return Boolean(api());
}

export async function initResearchDesktop(): Promise<{ migrated?: number } | null> {
  return (await api()?.init?.()) ?? null;
}

export async function patchDraftDesktop(projectId: string, content: string) {
  return api()?.patchDraft?.(projectId, content);
}

export async function patchBibliographyDesktop(projectId: string, content: string) {
  return api()?.patchBibliography?.(projectId, content);
}

export async function upsertEmbeddingsDesktop(
  projectId: string,
  batch: { chunkId: string; vector: number[] }[]
) {
  return api()?.upsertEmbeddings?.(projectId, batch);
}

export async function loadEmbeddingsDesktop(projectId: string, chunkIds?: string[]) {
  return api()?.loadEmbeddings?.(projectId, chunkIds) ?? {};
}

export async function clearEmbeddingsDesktop(projectId: string): Promise<void> {
  await api()?.clearEmbeddings?.(projectId);
}

export async function enqueueResearchJob(
  projectId: string,
  type: string,
  payload: Record<string, unknown> = {}
) {
  return api()?.enqueueJob?.(projectId, type, payload);
}

export async function listResearchJobs(projectId: string): Promise<ResearchJobRow[]> {
  return api()?.listJobs?.(projectId) ?? [];
}

export async function createProjectSnapshot(projectId: string, reason = "auto") {
  return api()?.createSnapshot?.(projectId, reason);
}

export async function listProjectSnapshots(projectId: string): Promise<ProjectSnapshotSummary[]> {
  return api()?.listSnapshots?.(projectId) ?? [];
}

export async function restoreProjectSnapshot(snapshotId: string): Promise<ResearchProjectData | null> {
  const data = await api()?.restoreSnapshot?.(snapshotId);
  return (data as ResearchProjectData) ?? null;
}

export function onResearchJobProgress(
  cb: (payload: {
    projectId: string;
    jobId: string;
    status: string;
    progress: number;
    message?: string;
  }) => void
): () => void {
  return api()?.onJobProgress?.(cb) ?? (() => {});
}

export function onBeforeQuitSnapshot(cb: () => void): () => void {
  return api()?.onBeforeQuit?.(cb) ?? (() => {});
}
