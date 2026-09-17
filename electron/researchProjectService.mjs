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
import {
  appendChatLog,
  backupDatabase,
  closeDb,
  createSnapshot,
  deleteProject,
  getActiveProjectId,
  getDraftHistoryEntry,
  getSchemaVersion,
  listChatLogs,
  listDraftHistory,
  listLinkedThreadsWithCount,
  listProjectSummaries,
  listSnapshots,
  loadProject,
  migrateLegacyProjects,
  patchBibliography,
  patchDraft,
  patchKnowledge,
  projectDir,
  pushDraftHistory,
  restoreSnapshot,
  saveProjectMeta,
  setActiveProjectId,
} from "./researchDb.mjs";
import {
  addEvidence,
  getEntity,
  getEvidenceFor,
  getRelationship,
  knowledgeStats,
  listEvidenceForDocument,
  listMerges,
  listRelationships,
  markEvidenceStaleForDocument,
  mergeEntities,
  resolveEntity,
  searchEntities,
  setEntityStatus,
  setEvidenceStatus,
  setRelationshipStatus,
  traverse,
  upsertEntity,
  upsertRelationship,
} from "./knowledgeStore.mjs";
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
import {
  dryRunConnectorImport,
  entityIdForConnectorItem,
  getConnectorSyncStatus,
  importConnectorItems,
  listConnectorSources,
  listConnectorSyncRuns,
  previewConnectorItems,
  recordConnectorSyncRun,
  resetConnector,
  upsertConnectorSource,
} from "./connectorStore.mjs";
import {
  executeToolMain,
  inspectToolDefinition,
  listToolAuditEvents,
  listToolDefinitions,
  recordToolAuditEvent,
} from "./toolStore.mjs";

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
  return { migrated, schemaVersion: getSchemaVersion(), resumed };
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

  ipcMain.handle("research:patchKnowledge", async (_e, projectId, content) => {
    assertSafeId(projectId, "project id");
    if (typeof content !== "string") throw new Error("Invalid knowledge content");
    return patchKnowledge(app, projectId, content);
  });

  ipcMain.handle("research:appendChatLog", async (_e, projectId, entry) => {
    assertSafeId(projectId, "project id");
    if (!entry?.id || !entry?.threadId || !entry?.role || typeof entry?.content !== "string")
      throw new Error("Invalid chat log entry");
    return appendChatLog(app, projectId, entry);
  });

  ipcMain.handle("research:listChatLogs", async (_e, projectId, opts) => {
    assertSafeId(projectId, "project id");
    return listChatLogs(app, projectId, opts ?? {});
  });

  ipcMain.handle("research:listLinkedThreads", async (_e, projectId) => {
    assertSafeId(projectId, "project id");
    return listLinkedThreadsWithCount(app, projectId);
  });

  /**
   * Phase 3 knowledge graph — one generic channel with an op allowlist, riding
   * the existing openbenttResearch bridge (no new preload surface).
   * Payloads are validated in knowledgeStore.mjs; errors are safe generics.
   */
  ipcMain.handle("research:knowledge", async (_e, op, payload) => {
    switch (op) {
      case "upsertEntity": return upsertEntity(app, payload);
      case "getEntity": return getEntity(app, payload?.id);
      case "resolveEntity": return resolveEntity(app, payload?.id);
      case "searchEntities": return searchEntities(app, payload ?? {});
      case "setEntityStatus": return setEntityStatus(app, payload?.id, payload?.status);
      case "mergeEntities":
        return mergeEntities(app, payload?.fromId, payload?.intoId, payload?.reason, payload?.origin);
      case "listMerges": return listMerges(app, payload?.entityId);
      case "upsertRelationship": return upsertRelationship(app, payload);
      case "getRelationship": return getRelationship(app, payload?.id);
      case "listRelationships": return listRelationships(app, payload?.entityId, payload?.opts);
      case "setRelationshipStatus": return setRelationshipStatus(app, payload?.id, payload?.status);
      case "addEvidence": return addEvidence(app, payload);
      case "getEvidenceFor": return getEvidenceFor(app, payload?.subjectType, payload?.subjectId);
      case "listEvidenceForDocument": return listEvidenceForDocument(app, payload?.documentId, payload?.opts);
      case "markEvidenceStale": return markEvidenceStaleForDocument(app, payload?.documentId, payload?.currentVersion);
      case "setEvidenceStatus": return setEvidenceStatus(app, payload?.id, payload?.status);
      case "traverse": return traverse(app, payload?.entityId, payload?.opts);
      case "stats": return knowledgeStats(app, payload?.projectId);
      default: throw new Error("Unknown knowledge operation");
    }
  });

  /**
   * Phase 4 connectors — one generic channel with an op allowlist, riding the
   * existing openbenttResearch bridge (one added preload method, no new
   * surface). Connector ids are registry-validated; no dynamic imports, no
   * arbitrary URLs/paths/SQL. Imports accept normalized items only.
   */
  ipcMain.handle("research:connectors", async (_e, op, payload) => {
    switch (op) {
      case "list": return listConnectorSources(app);
      case "get": {
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        return getConnectorSyncStatus(app, payload.connectorId, payload.scope);
      }
      case "capabilities": {
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        const id = payload.connectorId;
        if (id !== "crossref" && id !== "zotero") throw new Error("Unknown connector");
        return id === "crossref"
          ? ["SEARCH", "FETCH_ITEM", "METADATA", "AUTHORS", "IDENTIFIERS"]
          : ["FETCH_COLLECTION", "FETCH_ITEM", "METADATA", "AUTHORS", "IDENTIFIERS", "IMPORT"];
      }
      case "preview": return previewConnectorItems(payload?.items);
      case "dryRun": return dryRunConnectorImport(app, payload?.items, payload?.opts);
      case "import": {
        const startedAt = new Date().toISOString();
        void startedAt;
        try {
          const res = importConnectorItems(app, payload?.items, payload?.opts);
          const seen = (res.created.length + res.updated.length + res.unchanged.length + res.skipped.length + res.failed.length);
          const failed = res.failed.length;
          const status = failed === 0 ? "synced" : failed < seen ? "partial" : "failed";
          const first = Array.isArray(payload?.items) && payload.items.length ? payload.items[0] : null;
          if (first && typeof first.connectorId === "string") {
            recordConnectorSyncRun(app, {
              connectorId: first.connectorId,
              scope: payload?.opts?.projectId ?? "default",
              status,
              counts: { seen, created: res.created.length, updated: res.updated.length, failed },
            });
          }
          return res;
        } catch (err) {
          const first = Array.isArray(payload?.items) && payload.items.length ? payload.items[0] : null;
          if (first && typeof first.connectorId === "string" &&
            (first.connectorId === "crossref" || first.connectorId === "zotero")) {
            recordConnectorSyncRun(app, {
              connectorId: first.connectorId,
              scope: payload?.opts?.projectId ?? "default",
              status: "failed",
              counts: { seen: 0, created: 0, updated: 0, failed: 0 },
              error: err instanceof Error ? err.message : "import failed",
            });
          }
          throw err;
        }
      }
      case "syncStatus": return getConnectorSyncStatus(app, payload?.connectorId, payload?.scope);
      case "sync": {
        // Explicit sync = record source + report status (no polling daemon).
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        if (payload.connectorId !== "crossref" && payload.connectorId !== "zotero") throw new Error("Unknown connector");
        upsertConnectorSource(app, payload.connectorId, payload.connectorId);
        return getConnectorSyncStatus(app, payload.connectorId, payload?.scope);
      }
      case "syncRuns": return listConnectorSyncRuns(app, payload?.connectorId, payload?.limit);
      case "entityFor": return entityIdForConnectorItem(app, payload?.connectorId, payload?.externalId);
      case "disconnect":
      case "reset": return resetConnector(app, payload?.connectorId);
      default: throw new Error("Unknown connectors operation");
    }
  });

  /**
   * Phase 5 tools — one generic channel with an op allowlist, riding the
   * existing openbenttResearch bridge (one added preload method, no new
   * surface). Tool ids are registry-validated in toolStore.mjs; local-only
   * tools (document.*, utility.*) execute renderer-side and never reach IPC.
   */
  ipcMain.handle("research:tools", async (_e, op, payload) => {
    switch (op) {
      case "list": return listToolDefinitions();
      case "get": {
        if (!payload || typeof payload.toolId !== "string") throw new Error("Missing tool id");
        return inspectToolDefinition(payload.toolId);
      }
      case "execute": {
        if (!payload || typeof payload.toolId !== "string") throw new Error("Missing tool id");
        return executeToolMain(app, payload.toolId, payload.input, payload.context, {
          timeoutMs: payload.timeoutMs,
        });
      }
      case "audit": return listToolAuditEvents(app, payload ?? {});
      case "record": return recordToolAuditEvent(app, payload?.event);
      default: throw new Error("Unknown tools operation");
    }
  });
}

export function shutdownResearchServices() {
  shutdownAllJobs();
  closeDb();
}
