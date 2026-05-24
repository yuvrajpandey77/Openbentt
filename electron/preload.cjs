const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openbenttDesktop", {
  platform: process.platform,
  isElectron: true,
  softwareRenderingMode: process.env.OPENBENTT_SOFTWARE_RENDERING === "1",
  /** false in Linux safe mode → native frame, menu bar, and window icon (no in-app title strip). */
  framelessTitleBar:
    process.platform === "linux" && process.env.OPENBENTT_SOFTWARE_RENDERING !== "1",
  nativeMenuBar:
    process.platform === "linux" && process.env.OPENBENTT_SOFTWARE_RENDERING === "1",
  windowMinimize: () => ipcRenderer.invoke("desktop:windowMinimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("desktop:windowToggleMaximize"),
  windowClose: () => ipcRenderer.invoke("desktop:windowClose"),
  windowIsMaximized: () => ipcRenderer.invoke("desktop:windowIsMaximized"),
  editRole: (role) => ipcRenderer.invoke("desktop:editRole", role),
  reloadPage: () => ipcRenderer.invoke("desktop:reload"),
  toggleDevTools: () => ipcRenderer.invoke("desktop:toggleDevTools"),
  quitApp: () => ipcRenderer.invoke("desktop:quit"),
  showAbout: () => ipcRenderer.invoke("desktop:showAbout"),
  openExternal: (url) => ipcRenderer.invoke("desktop:openExternal", url),
  onMenuNavigate: (cb) => {
    const handler = (_event, path) => cb(path);
    ipcRenderer.on("desktop:menuNavigate", handler);
    return () => ipcRenderer.removeListener("desktop:menuNavigate", handler);
  },
  getAppVersion: () => ipcRenderer.invoke("desktop:getAppVersion"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:checkForUpdates"),
  downloadUpdate: () => ipcRenderer.invoke("desktop:downloadUpdate"),
  installUpdate: () => ipcRenderer.invoke("desktop:installUpdate"),
  onUpdateStatus: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("desktop:updateStatus", handler);
    return () => ipcRenderer.removeListener("desktop:updateStatus", handler);
  },
});

contextBridge.exposeInMainWorld("openbenttLocalGguf", {
  listRegistry: () => ipcRenderer.invoke("localGguf:listRegistry"),
  diskFree: () => ipcRenderer.invoke("localGguf:diskFree"),
  resolveBinary: (configuredPath) => ipcRenderer.invoke("localGguf:resolveBinary", configuredPath),
  searchHf: (query) => ipcRenderer.invoke("localGguf:searchHf", query),
  listGgufFiles: (repoId) => ipcRenderer.invoke("localGguf:listGgufFiles", repoId),
  addFromHf: (opts) => ipcRenderer.invoke("localGguf:addFromHf", opts),
  deleteEntry: (entryId) => ipcRenderer.invoke("localGguf:deleteEntry", entryId),
  ensureServer: (opts) => ipcRenderer.invoke("localGguf:ensureServer", opts),
  stopServer: () => ipcRenderer.invoke("localGguf:stopServer"),
  whoami: (token) => ipcRenderer.invoke("localGguf:whoami", token),
  hfSecretStatus: () => ipcRenderer.invoke("hfSecret:status"),
  hfSecretSet: (token) => ipcRenderer.invoke("hfSecret:set", token),
  hfSecretClear: () => ipcRenderer.invoke("hfSecret:clear"),
  onDownloadProgress: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("localGguf:downloadProgress", handler);
    return () => ipcRenderer.removeListener("localGguf:downloadProgress", handler);
  },
});

contextBridge.exposeInMainWorld("openbenttSecrets", {
  status: () => ipcRenderer.invoke("secretVault:status"),
  load: () => ipcRenderer.invoke("secretVault:load"),
  set: (key, value) => ipcRenderer.invoke("secretVault:set", key, value),
  clear: (key) => ipcRenderer.invoke("secretVault:clear", key),
});

contextBridge.exposeInMainWorld("openbenttZotero", {
  detectLocal: () => ipcRenderer.invoke("zotero:detectLocal"),
  status: () => ipcRenderer.invoke("zotero:status"),
  setCredentials: (userId, apiKey) => ipcRenderer.invoke("zotero:setCredentials", userId, apiKey),
  clearCredentials: () => ipcRenderer.invoke("zotero:clearCredentials"),
  setBbtExportPath: (exportPath) => ipcRenderer.invoke("zotero:setBbtExportPath", exportPath),
  sync: (opts) => ipcRenderer.invoke("zotero:sync", opts),
  getLibrarySnapshot: () => ipcRenderer.invoke("zotero:getLibrarySnapshot"),
  watchBetterBibTeX: (exportPath) => ipcRenderer.invoke("zotero:watchBetterBibTeX", exportPath),
  stopWatch: () => ipcRenderer.invoke("zotero:stopWatch"),
  secretStatus: () => ipcRenderer.invoke("zoteroSecret:status"),
  secretSet: (apiKey) => ipcRenderer.invoke("zoteroSecret:set", apiKey),
  secretClear: () => ipcRenderer.invoke("zoteroSecret:clear"),
  onSyncProgress: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("zotero:syncProgress", handler);
    return () => ipcRenderer.removeListener("zotero:syncProgress", handler);
  },
  onLibraryChanged: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("zotero:libraryChanged", handler);
    return () => ipcRenderer.removeListener("zotero:libraryChanged", handler);
  },
});

contextBridge.exposeInMainWorld("openbenttResearch", {
  init: () => ipcRenderer.invoke("research:init"),
  listProjects: () => ipcRenderer.invoke("research:listProjects"),
  getActiveProjectId: () => ipcRenderer.invoke("research:getActiveProjectId"),
  setActiveProjectId: (id) => ipcRenderer.invoke("research:setActiveProjectId", id),
  loadProject: (id) => ipcRenderer.invoke("research:loadProject", id),
  saveProject: (data) => ipcRenderer.invoke("research:saveProject", data),
  patchDraft: (projectId, content) => ipcRenderer.invoke("research:patchDraft", projectId, content),
  patchBibliography: (projectId, content) =>
    ipcRenderer.invoke("research:patchBibliography", projectId, content),
  deleteProject: (id) => ipcRenderer.invoke("research:deleteProject", id),
  storePaperPdf: (projectId, paperId, base64) =>
    ipcRenderer.invoke("research:storePaperPdf", projectId, paperId, base64),
  loadPaperPdf: (projectId, paperId) =>
    ipcRenderer.invoke("research:loadPaperPdf", projectId, paperId),
  listProjectAssets: (projectId) => ipcRenderer.invoke("research:listProjectAssets", projectId),
  storeProjectAsset: (projectId, fileName, base64) =>
    ipcRenderer.invoke("research:storeProjectAsset", projectId, fileName, base64),
  loadProjectAsset: (projectId, fileName) =>
    ipcRenderer.invoke("research:loadProjectAsset", projectId, fileName),
  compileProjectLatex: (payload) => ipcRenderer.invoke("research:compileProjectLatex", payload),
  getCompileArtifact: (projectId, hash) =>
    ipcRenderer.invoke("research:getCompileArtifact", projectId, hash),
  putCompileArtifact: (projectId, hash, base64, meta) =>
    ipcRenderer.invoke("research:putCompileArtifact", projectId, hash, base64, meta),
  loadEmbeddings: (projectId, chunkIds) =>
    ipcRenderer.invoke("research:loadEmbeddings", projectId, chunkIds),
  upsertEmbeddings: (projectId, batch) =>
    ipcRenderer.invoke("research:upsertEmbeddings", projectId, batch),
  embeddingStats: (projectId) => ipcRenderer.invoke("research:embeddingStats", projectId),
  clearEmbeddings: (projectId) => ipcRenderer.invoke("research:clearEmbeddings", projectId),
  deleteEmbeddingsForChunks: (projectId, chunkIds) =>
    ipcRenderer.invoke("research:deleteEmbeddingsForChunks", projectId, chunkIds),
  enqueueJob: (projectId, type, payload) =>
    ipcRenderer.invoke("research:enqueueJob", projectId, type, payload),
  cancelJob: (projectId, jobId) => ipcRenderer.invoke("research:cancelJob", projectId, jobId),
  cancelAllJobs: (projectId) => ipcRenderer.invoke("research:cancelAllJobs", projectId),
  listJobs: (projectId) => ipcRenderer.invoke("research:listJobs", projectId),
  createSnapshot: (projectId, reason) =>
    ipcRenderer.invoke("research:createSnapshot", projectId, reason),
  listSnapshots: (projectId) => ipcRenderer.invoke("research:listSnapshots", projectId),
  restoreSnapshot: (snapshotId) => ipcRenderer.invoke("research:restoreSnapshot", snapshotId),
  exportFinetuneCorpus: (projectId) => ipcRenderer.invoke("research:exportFinetuneCorpus", projectId),
  pushDraftHistory: (projectId, content, label) =>
    ipcRenderer.invoke("research:pushDraftHistory", projectId, content, label),
  listDraftHistory: (projectId) => ipcRenderer.invoke("research:listDraftHistory", projectId),
  restoreDraftHistory: (entryId) => ipcRenderer.invoke("research:restoreDraftHistory", entryId),
  onJobProgress: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("research:jobProgress", handler);
    return () => ipcRenderer.removeListener("research:jobProgress", handler);
  },
  onBeforeQuit: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("research:beforeQuit", handler);
    return () => ipcRenderer.removeListener("research:beforeQuit", handler);
  },
  patchKnowledge: (projectId, content) =>
    ipcRenderer.invoke("research:patchKnowledge", projectId, content),
  appendChatLog: (projectId, entry) =>
    ipcRenderer.invoke("research:appendChatLog", projectId, entry),
  listChatLogs: (projectId, opts) =>
    ipcRenderer.invoke("research:listChatLogs", projectId, opts),
  listLinkedThreads: (projectId) =>
    ipcRenderer.invoke("research:listLinkedThreads", projectId),
});
