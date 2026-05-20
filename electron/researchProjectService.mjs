/**
 * Research projects — SQLite persistence, vector store, job queue, snapshots.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  backupDatabase,
  closeDb,
  createSnapshot,
  deleteProject,
  getActiveProjectId,
  getDraftHistoryEntry,
  listDraftHistory,
  listProjectSummaries,
  listSnapshots,
  loadProject,
  migrateLegacyProjects,
  patchBibliography,
  patchDraft,
  projectDir,
  pushDraftHistory,
  restoreSnapshot,
  saveProjectMeta,
  setActiveProjectId,
} from "./researchDb.mjs";
import {
  deleteEmbeddingsForChunks,
  deleteEmbeddingsForProject,
  embeddingStats,
  loadEmbeddings,
  upsertEmbeddings,
} from "./researchVectorStore.mjs";
import {
  cancelAllJobs,
  cancelJob,
  enqueueJob,
  listJobs,
  resumeInterruptedJobs,
  setJobProgressTarget,
  shutdownAllJobs,
} from "./researchJobQueue.mjs";
import { assertBase64Pdf, assertPathUnderRoots, assertSafeId } from "./ipcValidate.mjs";

export async function initResearchStorage(app) {
  const { migrated } = await migrateLegacyProjects(app);
  backupDatabase(app);
  const { resumed } = resumeInterruptedJobs(app);
  return { migrated, schemaVersion: 4, resumed };
}

export function registerResearchProjectIpc(ipcMain, app) {
  ipcMain.handle("research:init", async () => initResearchStorage(app));

  ipcMain.handle("research:listProjects", async () => listProjectSummaries(app));

  ipcMain.handle("research:getActiveProjectId", async () => getActiveProjectId(app));

  ipcMain.handle("research:setActiveProjectId", async (_e, id) => {
    setActiveProjectId(app, id);
    return { ok: true };
  });

  ipcMain.handle("research:loadProject", async (_e, id) => {
    assertSafeId(id, "project id");
    const data = loadProject(app, id);
    if (!data) return null;
    return data;
  });

  ipcMain.handle("research:saveProject", async (_e, data) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid project");
    assertSafeId(data.id, "project id");
    saveProjectMeta(app, data, { skipChunks: data.skipChunks === true });
    if (data.chunkEmbeddings) {
      const batch = Object.entries(data.chunkEmbeddings)
        .filter(([k]) => k !== "__query__")
        .map(([chunkId, vector]) => ({ chunkId, vector }));
      if (batch.length) upsertEmbeddings(app, data.id, batch);
    }
    return { ok: true };
  });

  ipcMain.handle("research:patchDraft", async (_e, projectId, content) => {
    if (!projectId) throw new Error("Missing project id");
    return patchDraft(app, projectId, content);
  });

  ipcMain.handle("research:patchBibliography", async (_e, projectId, content) => {
    if (!projectId) throw new Error("Missing project id");
    return patchBibliography(app, projectId, content);
  });

  ipcMain.handle("research:deleteProject", async (_e, id) => {
    assertSafeId(id, "project id");
    deleteEmbeddingsForProject(app, id);
    deleteProject(app, id);
    return { ok: true };
  });

  ipcMain.handle("research:storePaperPdf", async (_e, projectId, paperId, base64) => {
    assertSafeId(projectId, "project id");
    assertSafeId(paperId, "paper id");
    const cleanB64 = assertBase64Pdf(base64);
    const dir = path.join(projectDir(app, projectId), "papers");
    await fs.mkdir(dir, { recursive: true });
    const buf = Buffer.from(cleanB64, "base64");
    await fs.writeFile(path.join(dir, `${paperId}.pdf`), buf);
    return { ok: true };
  });

  /** Main-process only (not exposed in preload). Paths must stay under userData. */
  ipcMain.handle("research:storePaperPdfPath", async (_e, projectId, paperId, filePath) => {
    assertSafeId(projectId, "project id");
    assertSafeId(paperId, "paper id");
    const userData = app.getPath("userData");
    const allowed = assertPathUnderRoots(
      filePath,
      [userData, projectDir(app, projectId)],
      "PDF source path"
    );
    const dir = path.join(projectDir(app, projectId), "papers");
    await fs.mkdir(dir, { recursive: true });
    await fs.copyFile(allowed, path.join(dir, `${paperId}.pdf`));
    return { ok: true };
  });

  ipcMain.handle("research:loadEmbeddings", async (_e, projectId, chunkIds) =>
    loadEmbeddings(app, projectId, chunkIds)
  );

  ipcMain.handle("research:upsertEmbeddings", async (_e, projectId, batch) =>
    upsertEmbeddings(app, projectId, batch)
  );

  ipcMain.handle("research:embeddingStats", async (_e, projectId) => embeddingStats(app, projectId));

  ipcMain.handle("research:clearEmbeddings", async (_e, projectId) => {
    assertSafeId(projectId, "project id");
    deleteEmbeddingsForProject(app, projectId);
    return { ok: true };
  });

  ipcMain.handle("research:deleteEmbeddingsForChunks", async (_e, projectId, chunkIds) => {
    assertSafeId(projectId, "project id");
    if (!Array.isArray(chunkIds)) throw new Error("chunkIds must be an array");
    deleteEmbeddingsForChunks(app, projectId, chunkIds);
    return { ok: true };
  });

  ipcMain.handle("research:enqueueJob", async (e, projectId, type, payload) => {
    const win = e.sender?.getOwnerBrowserWindow?.() ?? null;
    setJobProgressTarget(projectId, win);
    return enqueueJob(app, projectId, type, payload);
  });

  ipcMain.handle("research:cancelJob", async (_e, projectId, jobId) =>
    cancelJob(app, projectId, jobId)
  );

  ipcMain.handle("research:cancelAllJobs", async (_e, projectId) => cancelAllJobs(app, projectId));

  ipcMain.handle("research:listJobs", async (_e, projectId) => listJobs(app, projectId));

  ipcMain.handle("research:createSnapshot", async (_e, projectId, reason) =>
    createSnapshot(app, projectId, reason ?? "manual")
  );

  ipcMain.handle("research:listSnapshots", async (_e, projectId) => listSnapshots(app, projectId));

  ipcMain.handle("research:restoreSnapshot", async (_e, snapshotId) => {
    return restoreSnapshot(app, snapshotId);
  });

  ipcMain.handle("research:pushDraftHistory", async (_e, projectId, content, label) =>
    pushDraftHistory(app, projectId, content, label)
  );

  ipcMain.handle("research:listDraftHistory", async (_e, projectId) =>
    listDraftHistory(app, projectId)
  );

  ipcMain.handle("research:restoreDraftHistory", async (_e, entryId) => {
    const row = getDraftHistoryEntry(app, entryId);
    if (!row) throw new Error("Draft history entry not found");
    patchDraft(app, row.project_id, row.content);
    return { projectId: row.project_id, content: row.content };
  });

  ipcMain.handle("research:exportFinetuneCorpus", async (_e, projectId) => {
    const data = loadProject(app, projectId);
    if (!data) throw new Error("Project not found");
    const lines = (data.papers ?? []).map((p) =>
      JSON.stringify({
        text: (p.extractedText ?? "").slice(0, 8000),
        meta: p.metadata,
      })
    );
    const outDir = path.join(projectDir(app, projectId), "exports");
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, "finetune-corpus.jsonl");
    await fs.writeFile(outPath, lines.join("\n"), "utf8");
    return { path: outPath, count: lines.length };
  });
}

export function shutdownResearchServices() {
  shutdownAllJobs();
  closeDb();
}
