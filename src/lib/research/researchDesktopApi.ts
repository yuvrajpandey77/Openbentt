import type { ResearchProjectData } from "@/types/researchProject";
import type { CompileBundle } from "@/lib/research/compileBundle";

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

export async function patchKnowledgeDesktop(
  projectId: string,
  content: string
): Promise<{ ok: boolean; updatedAt: string } | undefined> {
  return api()?.patchKnowledge?.(projectId, content);
}

export type ChatLogEntry = {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  createdAt?: string;
};

export async function appendChatLogDesktop(
  projectId: string,
  entry: { id: string; threadId: string; role: string; content: string; model?: string }
): Promise<void> {
  await api()?.appendChatLog?.(projectId, entry);
}

export async function listChatLogsDesktop(
  projectId: string,
  opts?: { limit?: number }
): Promise<ChatLogEntry[]> {
  const rows = await api()?.listChatLogs?.(projectId, opts);
  if (!Array.isArray(rows)) return [];
  return rows as ChatLogEntry[];
}

export async function listLinkedThreadsDesktop(
  projectId: string
): Promise<{ threadId: string; messageCount: number; lastAt: string }[]> {
  const rows = await api()?.listLinkedThreads?.(projectId);
  if (!Array.isArray(rows)) return [];
  return rows as { threadId: string; messageCount: number; lastAt: string }[];
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

export async function deleteEmbeddingsForChunksDesktop(
  projectId: string,
  chunkIds: string[]
): Promise<void> {
  if (!chunkIds.length) return;
  await api()?.deleteEmbeddingsForChunks?.(projectId, chunkIds);
}

export async function embeddingStatsDesktop(
  projectId: string
): Promise<{ count: number; dim: number }> {
  return (await api()?.embeddingStats?.(projectId)) ?? { count: 0, dim: 384 };
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

export async function pushDraftHistoryDesktop(
  projectId: string,
  content: string,
  label?: string
): Promise<{ id: string; createdAt: string } | null> {
  return (await api()?.pushDraftHistory?.(projectId, content, label)) ?? null;
}

export type DraftHistoryEntry = {
  id: string;
  content: string;
  label?: string | null;
  createdAt?: string;
};

export async function listDraftHistoryDesktop(projectId: string): Promise<DraftHistoryEntry[]> {
  const rows = await api()?.listDraftHistory?.(projectId);
  if (!Array.isArray(rows)) return [];
  return rows as DraftHistoryEntry[];
}

export async function restoreDraftHistoryDesktop(
  entryId: string
): Promise<{ projectId: string; content: string } | null> {
  const r = await api()?.restoreDraftHistory?.(entryId);
  return r ?? null;
}

export function onResearchJobProgress(
  cb: (payload: {
    projectId: string;
    jobId: string;
    jobType?: string;
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

export async function loadPaperPdfDesktop(
  projectId: string,
  paperId: string
): Promise<{ ok: boolean; base64?: string; message?: string } | null> {
  return (await api()?.loadPaperPdf?.(projectId, paperId)) ?? null;
}

export async function listProjectAssetsDesktop(projectId: string): Promise<string[]> {
  const r = await api()?.listProjectAssets?.(projectId);
  if (r?.ok && Array.isArray(r.files)) return r.files;
  return [];
}

export async function storeProjectAssetDesktop(
  projectId: string,
  fileName: string,
  base64: string
): Promise<boolean> {
  const r = await api()?.storeProjectAsset?.(projectId, fileName, base64);
  return Boolean(r?.ok);
}

export async function loadProjectAssetDesktop(
  projectId: string,
  fileName: string
): Promise<{ ok: boolean; base64?: string; mime?: string; message?: string } | null> {
  return (await api()?.loadProjectAsset?.(projectId, fileName)) ?? null;
}

export async function compileProjectLatexDesktop(
  bundle: CompileBundle
): Promise<{ ok: boolean; base64?: string; message?: string } | null> {
  const files = bundle.additionalFiles.map((f) => {
    if (typeof f.content === "string") {
      return { path: f.path, content: f.content, encoding: "utf8" as const };
    }
    let binary = "";
    const bytes = f.content;
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { path: f.path, content: btoa(binary), encoding: "base64" as const };
  });
  return (
    (await api()?.compileProjectLatex?.({
      mainTex: bundle.mainTex,
      mainPath: bundle.mainPath,
      bibtex: bundle.bibtex,
      files,
    })) ?? null
  );
}
