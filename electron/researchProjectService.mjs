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
  getConnectionMeta,
  getConnectorSyncStatus,
  importConnectorItems,
  listConnectorSources,
  listConnectorSyncRuns,
  previewConnectorItems,
  recordConnectorSyncRun,
  resetConnector,
  setConnectorCursor,
  upsertConnectionMeta,
  upsertConnectorSource,
} from "./connectorStore.mjs";
import {
  connectorAuthStatus,
  consumeOAuthState,
  grantedScopesFor,
  hasWriteGrant,
  isEnterpriseConnectorId,
  issueOAuthState,
  readOAuthTokenMaybe,
  writeOAuthToken,
  writeScopesFor,
} from "./connectorAuthStore.mjs";
import {
  approveAction,
  expireStaleApprovals,
  getApproval,
  listApprovals,
  listExecutions,
  rejectAction,
} from "./actionStore.mjs";
import {
  getSyncConfig,
  listSyncConfigs,
  runConnectorSyncNow,
  setSyncConfig,
  startSyncScheduler,
  stopSyncScheduler,
} from "./syncScheduler.mjs";
import {
  cancelWorkflowRun,
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  getWorkflowRun,
  listWorkflowRuns,
  listWorkflows,
  resumeWorkflowRun,
  startWorkflowRun,
  startWorkflowScheduler,
  stopWorkflowScheduler,
  updateWorkflow,
} from "./workflowStore.mjs";
import {
  clearMcpServerToken,
  getMcpServerConfig,
  mcpServerStatus,
  rotateMcpServerToken,
  setMcpServerConfig,
  startMcpServer,
  stopMcpServer,
} from "./mcpServer.mjs";
import {
  getMcpServer,
  listMcpServers,
  readMcpTokenMaybe,
  removeMcpServer,
  setMcpServerEnabled,
  upsertMcpServer,
  writeMcpToken,
} from "./mcpStore.mjs";
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
  // Phase 8 schedulers: inert until the user enables per-connector sync or
  // schedule-triggered workflows. No polling, no actions without config.
  startSyncScheduler(app);
  startWorkflowScheduler(app);
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
        // Static registry mirror (fail-closed; Tier-1 included).
        const CAPS = {
          crossref: ["SEARCH", "FETCH_ITEM", "METADATA", "AUTHORS", "IDENTIFIERS"],
          zotero: ["FETCH_COLLECTION", "FETCH_ITEM", "METADATA", "AUTHORS", "IDENTIFIERS", "IMPORT"],
          "google-drive": ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IMPORT", "SYNC"],
          gmail: ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IMPORT", "SYNC"],
          "google-calendar": ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IMPORT", "SYNC"],
          slack: ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IMPORT", "SYNC"],
          github: ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IDENTIFIERS", "IMPORT", "SYNC"],
          notion: ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IMPORT", "SYNC"],
        };
        const caps = CAPS[payload.connectorId];
        if (!caps) throw new Error("Unknown connector");
        return caps;
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
            (first.connectorId === "crossref" || first.connectorId === "zotero" || isEnterpriseConnectorId(first.connectorId))) {
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
        if (!isEnterpriseConnectorId(payload.connectorId) && payload.connectorId !== "crossref" && payload.connectorId !== "zotero") {
          throw new Error("Unknown connector");
        }
        upsertConnectorSource(app, payload.connectorId, payload.connectorId);
        return getConnectorSyncStatus(app, payload.connectorId, payload?.scope);
      }
      case "syncRuns": return listConnectorSyncRuns(app, payload?.connectorId, payload?.limit);
      case "entityFor": return entityIdForConnectorItem(app, payload?.connectorId, payload?.externalId);
      case "connectionMeta": {
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        return getConnectionMeta(app, payload.connectorId);
      }
      case "disconnect":
      case "reset": {
        // Disconnect also clears the OAuth vault token (revocation best-effort
        // happens client-side via provider revoke endpoints where configured).
        if (payload?.connectorId && isEnterpriseConnectorId(payload.connectorId)) {
          await writeOAuthToken(app, payload.connectorId, null);
          upsertConnectionMeta(app, payload.connectorId, { status: "DISCONNECTED", lastError: undefined });
        }
        return resetConnector(app, payload?.connectorId);
      }
      default: throw new Error("Unknown connectors operation");
    }
  });

  /**
   * Phase 7 enterprise auth — one generic channel with an op allowlist.
   * Returns safe metadata only; token values never cross IPC.
   * OAuth client secrets come from operator env (never renderer, never DB).
   */
  ipcMain.handle("research:connectorAuth", async (_e, op, payload) => {
    switch (op) {
      case "status": {
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        if (!isEnterpriseConnectorId(payload.connectorId)) throw new Error("Unknown connector");
        return connectorAuthStatus(app, payload.connectorId, {
          getConnectionMeta: (id) => getConnectionMeta(app, id),
        });
      }
      case "beginOAuth": {
        // Returns { authorizeUrl, state } — the renderer opens authorizeUrl in
        // the OS browser; the loopback callback completes the flow below.
        // Requires operator-configured client id (env), else BLOCKED with setup
        // instructions instead of a fake flow.
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        const connectorId = payload.connectorId;
        if (!isEnterpriseConnectorId(connectorId)) throw new Error("Unknown connector");
        const envKey = `OPENBENTT_${connectorId.toUpperCase().replace(/-/g, "_")}_CLIENT_ID`;
        const clientId = process.env[envKey];
        if (!clientId) {
          throw new Error(
            `OAuth not configured for ${connectorId}. Set ${envKey} (and matching CLIENT_SECRET) per docs/OPENBENTT_PHASE_7_INTEGRATIONS.md.`
          );
        }
        const redirectUri = `http://127.0.0.1:${process.env.OPENBENTT_OAUTH_PORT ?? "9876"}/oauth/callback`;
        // Phase 8: mode=actions requests incremental write scopes behind an
        // explicit "Enable actions" step. Anything else stays read-only.
        const withWrite = payload.mode === "actions";
        const state = issueOAuthState(connectorId, payload.projectId, withWrite ? "actions" : "read");
        upsertConnectionMeta(app, connectorId, { status: "CONNECTING" });
        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          state: state.raw,
        });
        // Least-privilege scopes are injected main-side from the registry —
        // the renderer cannot invent scopes (see oauthScopeFor below).
        const scope = oauthScopeFor(connectorId, withWrite);
        if (scope) params.set("scope", scope);
        if (state.codeChallenge) {
          params.set("code_challenge", state.codeChallenge);
          params.set("code_challenge_method", "S256");
        }
        return { authorizeUrl: `${oauthAuthorizeBase(connectorId)}?${params}`, state: state.raw };
      }
      case "completeOAuth": {
        // Loopback callback result: { connectorId, state, code } → token
        // exchange main-side → vault write → real verify request → CONNECTED.
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        return completeOAuthFlow(app, payload);
      }
      case "disconnect": {
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        if (!isEnterpriseConnectorId(payload.connectorId)) throw new Error("Unknown connector");
        await writeOAuthToken(app, payload.connectorId, null);
        upsertConnectionMeta(app, payload.connectorId, { status: "DISCONNECTED", lastError: undefined });
        return { ok: true };
      }
      case "setCursor": {
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        setConnectorCursor(app, payload.connectorId, payload.scope ?? "default", payload.cursor, payload.itemCount ?? 0);
        return { ok: true };
      }
      default: throw new Error("Unknown connectorAuth operation");
    }
  });

  /**
   * Phase 7 MCP management — one generic channel with an op allowlist.
   * Server configs are metadata; tokens live in the OS vault.
   */
  ipcMain.handle("research:mcp", async (_e, op, payload) => {
    const { getDb } = await import("./researchDb.mjs");
    const db = getDb(app);
    switch (op) {
      case "list": return listMcpServers(db).map((s) => ({ ...s, endpoint: s.transport === "stdio-local" ? s.endpoint : redactMcpEndpoint(s.endpoint) }));
      case "get": {
        if (!payload || typeof payload.serverId !== "string") throw new Error("Missing server id");
        const s = getMcpServer(db, payload.serverId);
        if (!s) throw new Error("Unknown MCP server");
        return s;
      }
      case "add": case "upsert": return upsertMcpServer(db, payload?.config ?? payload);
      case "remove": {
        if (!payload || typeof payload.serverId !== "string") throw new Error("Missing server id");
        await writeMcpToken(app, payload.serverId, null);
        return removeMcpServer(db, payload.serverId);
      }
      case "setEnabled": {
        if (!payload || typeof payload.serverId !== "string") throw new Error("Missing server id");
        return setMcpServerEnabled(db, payload.serverId, payload.enabled !== false);
      }
      case "setToken": {
        // Operator-provided bearer token → OS vault (never SQLite).
        if (!payload || typeof payload.serverId !== "string") throw new Error("Missing server id");
        if (!getMcpServer(db, payload.serverId)) throw new Error("Unknown MCP server");
        return writeMcpToken(app, payload.serverId, payload.token ?? "");
      }
      case "hasToken": {
        if (!payload || typeof payload.serverId !== "string") throw new Error("Missing server id");
        const t = await readMcpTokenMaybe(app, payload.serverId).catch(() => "");
        return { hasToken: Boolean(t) };
      }
      default: throw new Error("Unknown mcp operation");
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

  /**
   * Phase 8 actions — approvals + executions. Approvals originate here from
   * trusted UI state (never from model output); execution consumes them
   * single-use with fingerprint verification in toolStore.mjs.
   */
  ipcMain.handle("research:actions", async (_e, op, payload) => {
    switch (op) {
      case "get": {
        if (!payload || typeof payload.approvalId !== "string") throw new Error("Missing approval id");
        return getApproval(app, payload.approvalId);
      }
      case "list": {
        expireStaleApprovals(app);
        return listApprovals(app, payload ?? {});
      }
      case "approve": {
        if (!payload || typeof payload.approvalId !== "string") throw new Error("Missing approval id");
        const approval = approveAction(app, payload.approvalId);
        recordToolAuditEvent(app, {
          eventId: `aact_${Date.now().toString(36)}`,
          toolId: approval.toolId, toolVersion: "1",
          requestId: approval.requestId, timestamp: new Date().toISOString(),
          source: "approval-center", projectId: approval.projectId,
          permission: "USER_CONFIRMATION", risk: approval.risk,
          decision: "ALLOW", status: "ok", durationMs: 0,
          resourceSummary: { lifecycle: "ACTION_APPROVED", approvalId: approval.id, fingerprint: approval.fingerprint },
        });
        return approval;
      }
      case "reject": {
        if (!payload || typeof payload.approvalId !== "string") throw new Error("Missing approval id");
        const approval = rejectAction(app, payload.approvalId);
        recordToolAuditEvent(app, {
          eventId: `aact_${Date.now().toString(36)}`,
          toolId: approval.toolId, toolVersion: "1",
          requestId: approval.requestId, timestamp: new Date().toISOString(),
          source: "approval-center", projectId: approval.projectId,
          permission: "USER_CONFIRMATION", risk: approval.risk,
          decision: "DENY", status: "denied", durationMs: 0,
          resourceSummary: { lifecycle: "ACTION_REJECTED", approvalId: approval.id },
          errorCategory: "permission_denied",
        });
        return approval;
      }
      case "executions": return listExecutions(app, payload ?? {});
      case "writeGrant": {
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        if (!isEnterpriseConnectorId(payload.connectorId)) throw new Error("Unknown connector");
        return {
          connectorId: payload.connectorId,
          hasWriteGrant: await hasWriteGrant(app, payload.connectorId),
          grantedScopes: await grantedScopesFor(app, payload.connectorId),
          requiredScopes: writeScopesFor(payload.connectorId),
        };
      }
      default: throw new Error("Unknown actions operation");
    }
  });

  /**
   * Phase 8 sync — user-controlled background sync config + manual runs.
   * Disabled by default; enabling is an explicit user action per connector.
   */
  ipcMain.handle("research:sync", async (_e, op, payload) => {
    switch (op) {
      case "configs": return listSyncConfigs(app);
      case "get": {
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        return getSyncConfig(app, payload.connectorId);
      }
      case "set": {
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        return setSyncConfig(app, payload.connectorId, {
          enabled: payload.enabled,
          intervalMinutes: payload.intervalMinutes,
        });
      }
      case "runNow": {
        if (!payload || typeof payload.connectorId !== "string") throw new Error("Missing connector id");
        return runConnectorSyncNow(app, payload.connectorId, { reason: "manual" });
      }
      default: throw new Error("Unknown sync operation");
    }
  });

  /**
   * Phase 8 workflows — definitions validated by workflowCore.mjs; runs are
   * real tool executions with approval suspension. No simulated triggers.
   */
  ipcMain.handle("research:workflows", async (_e, op, payload) => {
    switch (op) {
      case "list": return listWorkflows(app);
      case "get": {
        if (!payload || typeof payload.workflowId !== "string") throw new Error("Missing workflow id");
        return getWorkflow(app, payload.workflowId);
      }
      case "create": return createWorkflow(app, payload?.workflow ?? payload);
      case "update": {
        if (!payload || typeof payload.workflowId !== "string") throw new Error("Missing workflow id");
        return updateWorkflow(app, payload.workflowId, payload.patch ?? {});
      }
      case "delete": {
        if (!payload || typeof payload.workflowId !== "string") throw new Error("Missing workflow id");
        return deleteWorkflow(app, payload.workflowId);
      }
      case "start": {
        if (!payload || typeof payload.workflowId !== "string") throw new Error("Missing workflow id");
        return startWorkflowRun(app, payload.workflowId, {
          triggerKind: "manual", state: { projectId: payload.projectId },
        });
      }
      case "resume": {
        if (!payload || typeof payload.runId !== "string") throw new Error("Missing run id");
        return resumeWorkflowRun(app, payload.runId);
      }
      case "cancel": {
        if (!payload || typeof payload.runId !== "string") throw new Error("Missing run id");
        return cancelWorkflowRun(app, payload.runId);
      }
      case "runs": return listWorkflowRuns(app, payload ?? {});
      case "getRun": {
        if (!payload || typeof payload.runId !== "string") throw new Error("Missing run id");
        return getWorkflowRun(app, payload.runId);
      }
      default: throw new Error("Unknown workflows operation");
    }
  });

  /**
   * Phase 8 agents — role configurations over the unchanged Phase 6 runtime.
   * Static registry mirror (fail-closed); execution still routes via tools.
   */
  ipcMain.handle("research:agents", async (_e, op, payload) => {
    const { listAgentRoleDefinitions, getAgentRoleDefinition } = await import("../src/lib/agent/agentRolesCore.mjs");
    switch (op) {
      case "list":
        return listAgentRoleDefinitions();
      case "get": {
        if (!payload || typeof payload.agentId !== "string") throw new Error("Missing agent id");
        return getAgentRoleDefinition(payload.agentId);
      }
      default: throw new Error("Unknown agents operation");
    }
  });

  /**
   * Phase 8 MCP server — opt-in loopback exposure of read-only tools.
   * Token value is returned ONCE on rotate; never stored outside the vault.
   */
  ipcMain.handle("research:mcpserver", async (_e, op, payload) => {
    switch (op) {
      case "status": return { ...getMcpServerConfig(app), ...mcpServerStatus() };
      case "configure": return setMcpServerConfig(app, payload ?? {});
      case "rotateToken": {
        const { token } = await rotateMcpServerToken(app);
        return { token };
      }
      case "clearToken": return clearMcpServerToken(app);
      case "start": return startMcpServer(app);
      case "stop": return stopMcpServer();
      default: throw new Error("Unknown mcpserver operation");
    }
  });
}

export function shutdownResearchServices() {
  stopSyncScheduler();
  stopWorkflowScheduler();
  stopMcpServer();
  shutdownAllJobs();
  closeDb();
}

/* ---------------- Phase 7 — OAuth helpers (main process only) ---------------- */

const OAUTH_AUTHORIZE_BASE = {
  "google-drive": "https://accounts.google.com/o/oauth2/v2/auth",
  gmail: "https://accounts.google.com/o/oauth2/v2/auth",
  "google-calendar": "https://accounts.google.com/o/oauth2/v2/auth",
  slack: "https://slack.com/oauth/v2/authorize",
  github: "https://github.com/login/oauth/authorize",
  notion: "https://api.notion.com/v1/oauth/authorize",
};

const OAUTH_TOKEN_URL = {
  "google-drive": "https://oauth2.googleapis.com/token",
  gmail: "https://oauth2.googleapis.com/token",
  "google-calendar": "https://oauth2.googleapis.com/token",
  slack: "https://slack.com/api/oauth.v2.access",
  github: "https://github.com/login/oauth/access_token",
  notion: "https://api.notion.com/v1/oauth/token",
};

/**
 * Least-privilege scopes — main-side registry; renderer cannot invent scopes.
 * Phase 8: `withWrite=true` appends the incremental write scopes declared in
 * connectorAuthStore.WRITE_SCOPES. Requested ONLY via the explicit
 * "Enable actions" step (beginOAuth mode=actions); existing read-only grants
 * keep working unchanged and must re-authorize to gain write access.
 */
function oauthScopeFor(connectorId, withWrite = false) {
  let base;
  switch (connectorId) {
    case "google-drive":
      base = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.metadata.readonly";
      break;
    case "gmail":
      base = "https://www.googleapis.com/auth/gmail.readonly";
      break;
    case "google-calendar":
      base = "https://www.googleapis.com/auth/calendar.readonly";
      break;
    case "slack":
      base = "channels:history,channels:read,groups:history,groups:read,users:read,search:read";
      break;
    case "github":
      base = "read:user read:org public_repo repo:status";
      break;
    case "notion":
      base = "";
      break;
    default:
      throw new Error("Unknown connector");
  }
  if (withWrite) {
    const extra = writeScopesFor(connectorId);
    if (extra.length) {
      // Slack uses comma-delimited scopes; Google/GitHub use spaces.
      const joiner = connectorId === "slack" ? "," : " ";
      base = base ? `${base}${joiner}${extra.join(joiner)}` : extra.join(joiner);
    }
  }
  return base;
}

function oauthAuthorizeBase(connectorId) {
  const base = OAUTH_AUTHORIZE_BASE[connectorId];
  if (!base) throw new Error("Unknown connector");
  return base;
}

function redactMcpEndpoint(endpoint) {
  try {
    const u = new URL(String(endpoint));
    u.username = "";
    u.password = "";
    u.search = "";
    u.hash = "";
    return u.toString().slice(0, 512);
  } catch {
    return String(endpoint ?? "").slice(0, 64);
  }
}

/**
 * Complete OAuth: validate state (CSRF) → token exchange (main-side secret)
 * → vault write → REAL provider verify request → CONNECTED.
 * CONNECTED is reported only after the verify request succeeds.
 */
async function completeOAuthFlow(app, payload) {
  const connectorId = payload.connectorId;
  if (!isEnterpriseConnectorId(connectorId)) throw new Error("Unknown connector");
  const state = consumeOAuthState(payload.state, connectorId);
  if (!state) {
    upsertConnectionMeta(app, connectorId, { status: "ERROR", lastError: "OAuth state mismatch or expired." });
    throw new Error("OAuth state mismatch or expired. Restart the connection flow.");
  }
  if (!payload.code || typeof payload.code !== "string" || payload.code.length > 512) {
    upsertConnectionMeta(app, connectorId, { status: "AUTH_REQUIRED", lastError: "Authorization code missing." });
    throw new Error("Authorization code missing.");
  }
  const envPrefix = `OPENBENTT_${connectorId.toUpperCase().replace(/-/g, "_")}`;
  const clientId = process.env[`${envPrefix}_CLIENT_ID`];
  const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`];
  if (!clientId) throw new Error(`OAuth not configured for ${connectorId}.`);
  const redirectUri = `http://127.0.0.1:${process.env.OPENBENTT_OAUTH_PORT ?? "9876"}/oauth/callback`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: payload.code,
    redirect_uri: redirectUri,
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    ...(state.codeVerifier ? { code_verifier: state.codeVerifier } : {}),
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let tokenJson;
  try {
    const res = await fetch(OAUTH_TOKEN_URL[connectorId], {
      method: "POST",
      signal: ctrl.signal,
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    clearTimeout(timer);
    if (!res.ok) {
      upsertConnectionMeta(app, connectorId, { status: "AUTH_REQUIRED", lastError: "Token exchange failed." });
      throw new Error("Token exchange failed.");
    }
    tokenJson = await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && /Token exchange|OAuth state/.test(err.message)) throw err;
    upsertConnectionMeta(app, connectorId, { status: "ERROR", lastError: "Token exchange unreachable." });
    throw new Error("Token exchange unreachable.");
  }
  const accessToken = tokenJson.access_token ?? tokenJson.authed_user?.access_token;
  if (!accessToken) {
    upsertConnectionMeta(app, connectorId, { status: "AUTH_REQUIRED", lastError: "Provider refused authorization." });
    throw new Error("Provider refused authorization.");
  }
  // Phase 8: persist the ACTUAL granted scopes for this flow mode so the
  // write-grant check (hasWriteGrant) reflects what the provider granted.
  const grantedScopeList = oauthScopeFor(connectorId, state.mode === "actions").split(/[\s,]+/).filter(Boolean);
  await writeOAuthToken(app, connectorId, {
    accessToken,
    refreshToken: tokenJson.refresh_token ?? tokenJson.authed_user?.refresh_token,
    expiresAt: tokenJson.expires_in ? Date.now() + Number(tokenJson.expires_in) * 1000 : undefined,
    scopes: grantedScopeList,
  });
  // Real verification: the provider itself confirms the connection.
  const { authorizedFetchFor: authFetchFor } = await import("./connectorAuthStore.mjs");
  const hosts = {
    "google-drive": ["googleapis.com", "www.googleapis.com"],
    gmail: ["googleapis.com", "gmail.googleapis.com"],
    "google-calendar": ["googleapis.com", "www.googleapis.com"],
    slack: ["slack.com"],
    github: ["api.github.com"],
    notion: ["api.notion.com"],
  };
  const authFetch = authFetchFor(app, connectorId, hosts[connectorId]);
  try {
    const { accountLabel } = await verifyEnterpriseConnection(connectorId, authFetch);
    const now = new Date().toISOString();
    upsertConnectionMeta(app, connectorId, {
      status: "CONNECTED",
      accountLabel,
      scopes: grantedScopeList,
      connectedAt: now,
      verifiedAt: now,
      lastError: undefined,
    });
    await writeOAuthToken(app, connectorId, {
      ...(await readOAuthTokenMaybe(app, connectorId)),
      accountLabel,
    });
    upsertConnectorSource(app, connectorId, accountLabel);
    return { ok: true, connectorId, accountLabel };
  } catch (err) {
    const authFailed = /authentication_failed|invalid_auth|token_revoked/i.test(err?.message ?? "");
    upsertConnectionMeta(app, connectorId, {
      status: authFailed ? "AUTH_REQUIRED" : "ERROR",
      lastError: "Provider verification failed.",
    });
    throw new Error("Provider verification failed.");
  }
}

async function verifyEnterpriseConnection(connectorId, authFetch) {
  switch (connectorId) {
    case "google-drive": {
      const { driveVerifyConnection } = await import("../src/lib/connectors/providers/googleDrive.mjs");
      return driveVerifyConnection(authFetch);
    }
    case "gmail": {
      const { gmailVerifyConnection } = await import("../src/lib/connectors/providers/gmail.mjs");
      return gmailVerifyConnection(authFetch);
    }
    case "google-calendar": {
      const { calendarVerifyConnection } = await import("../src/lib/connectors/providers/googleCalendar.mjs");
      return calendarVerifyConnection(authFetch);
    }
    case "slack": {
      const { slackVerifyConnection } = await import("../src/lib/connectors/providers/slack.mjs");
      return slackVerifyConnection(authFetch);
    }
    case "github": {
      const { githubVerifyConnection } = await import("../src/lib/connectors/providers/github.mjs");
      return githubVerifyConnection(authFetch);
    }
    case "notion": {
      const { notionVerifyConnection } = await import("../src/lib/connectors/providers/notion.mjs");
      return notionVerifyConnection(authFetch);
    }
    default:
      throw new Error("Unknown connector");
  }
}
