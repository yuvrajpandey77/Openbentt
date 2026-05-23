/**
 * Research projects — SQLite persistence, vector store, job queue, snapshots.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  getCompileArtifactDesktop,
  putCompileArtifactDesktop,
} from "./compileArtifactStore.mjs";
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

function mimeForAsset(fileName) {
  const lower = String(fileName).toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

export async function initResearchStorage(app) {
  const { migrated } = await migrateLegacyProjects(app);
  backupDatabase(app);
  const { resumed } = resumeInterruptedJobs(app);
  return { migrated, schemaVersion: 5, resumed };
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

  ipcMain.handle("research:loadPaperPdf", async (_e, projectId, paperId) => {
    assertSafeId(projectId, "project id");
    assertSafeId(paperId, "paper id");
    const fp = path.join(projectDir(app, projectId), "papers", `${paperId}.pdf`);
    try {
      const buf = await fs.readFile(fp);
      return { ok: true, base64: buf.toString("base64") };
    } catch {
      return { ok: false, message: "PDF not found on disk" };
    }
  });

  ipcMain.handle("research:listProjectAssets", async (_e, projectId) => {
    assertSafeId(projectId, "project id");
    const dir = path.join(projectDir(app, projectId), "assets");
    try {
      const entries = await fs.readdir(dir);
      return { ok: true, files: entries.filter((f) => !f.startsWith(".")) };
    } catch {
      return { ok: true, files: [] };
    }
  });

  ipcMain.handle("research:storeProjectAsset", async (_e, projectId, fileName, base64) => {
    assertSafeId(projectId, "project id");
    if (!fileName || /[/\\]/.test(fileName)) throw new Error("Invalid asset name");
    const dir = path.join(projectDir(app, projectId), "assets");
    await fs.mkdir(dir, { recursive: true });
    const buf = Buffer.from(base64, "base64");
    await fs.writeFile(path.join(dir, fileName), buf);
    return { ok: true };
  });

  ipcMain.handle("research:loadProjectAsset", async (_e, projectId, fileName) => {
    assertSafeId(projectId, "project id");
    if (!fileName || /[/\\]/.test(fileName)) throw new Error("Invalid asset name");
    const fp = path.join(projectDir(app, projectId), "assets", fileName);
    try {
      const buf = await fs.readFile(fp);
      return { ok: true, base64: buf.toString("base64"), mime: mimeForAsset(fileName) };
    } catch {
      return { ok: false, message: "Asset not found" };
    }
  });

  ipcMain.handle("research:compileProjectLatex", async (_e, payload) => {
    const { mainTex, mainPath = "main.tex", files = [], bibtex = false } = payload ?? {};
    if (!mainTex || typeof mainTex !== "string") throw new Error("Missing mainTex");
    const pdflatexCheck = spawnSync("pdflatex", ["--version"], { encoding: "utf8" });
    if (pdflatexCheck.status !== 0) {
      return { ok: false, message: "pdflatex not found on PATH. Install TeX Live or MacTeX." };
    }

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openbentt-proj-tex-"));
    try {
      await fs.writeFile(path.join(dir, mainPath), mainTex, "utf8");
      for (const f of files) {
        if (!f?.path || typeof f.path !== "string") continue;
        const safe = f.path.replace(/\\/g, "/").replace(/^(\.\.\/)+/, "").trim();
        if (
          !safe ||
          safe.length > 200 ||
          safe.startsWith("/") ||
          /[\0\n\r]/.test(safe) ||
          /^documentclass|^\\documentclass|^usepackage|^\\usepackage/i.test(safe) ||
          !/^[\w./-]+$/i.test(safe)
        ) {
          continue;
        }
        const fp = path.join(dir, safe);
        await fs.mkdir(path.dirname(fp), { recursive: true });
        if (f.encoding === "base64") {
          await fs.writeFile(fp, Buffer.from(f.content, "base64"));
        } else {
          await fs.writeFile(fp, String(f.content ?? ""), "utf8");
        }
      }

      const opts = { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
      const baseName = mainPath.replace(/\.tex$/i, "") || "main";
      const args = ["-interaction=nonstopmode", "-halt-on-error", mainPath];
      let log = "";
      const runPdf = () => {
        const r = spawnSync("pdflatex", args, opts);
        log += (r.stdout || "") + (r.stderr || "");
        return r.status ?? 1;
      };

      let status = runPdf();
      if (bibtex) {
        spawnSync("bibtex", [baseName], opts);
        status = runPdf();
        status = runPdf();
      } else {
        status = runPdf();
      }

      const pdfPath = path.join(dir, `${baseName}.pdf`);
      try {
        await fs.access(pdfPath);
      } catch {
        return { ok: false, message: log.slice(-24000) || "pdflatex failed" };
      }
      if (status !== 0) {
        return { ok: false, message: log.slice(-24000) || "pdflatex failed" };
      }
      const pdfBuf = await fs.readFile(pdfPath);
      return { ok: true, base64: pdfBuf.toString("base64") };
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
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

  ipcMain.handle("research:getCompileArtifact", async (_e, projectId, hash) => {
    const buf = await getCompileArtifactDesktop(app, projectId, hash);
    if (!buf) return { ok: false };
    return { ok: true, base64: Buffer.from(buf).toString("base64") };
  });

  ipcMain.handle("research:putCompileArtifact", async (_e, projectId, hash, base64, meta) => {
    const buf = Buffer.from(base64, "base64");
    await putCompileArtifactDesktop(app, projectId, hash, buf, meta ?? {});
    return { ok: true };
  });
}

export function shutdownResearchServices() {
  shutdownAllJobs();
  closeDb();
}
