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
  pickWorkspaceFolder: (currentPath) => ipcRenderer.invoke("desktop:pickWorkspaceFolder", currentPath),
  // Workspace authority (read-only + approval-gated writes; renderer never touches fs).
  workspaceResolve: (root) => ipcRenderer.invoke("workspace:resolve", { root }),
  workspaceList: (root, dir, depth) => ipcRenderer.invoke("workspace:list", { root, dir, depth }),
  workspaceRead: (root, path, maxBytes) => ipcRenderer.invoke("workspace:read", { root, path, maxBytes }),
  workspaceVerify: (root, claims) => ipcRenderer.invoke("workspace:verify", { root, claims }),
  workspaceInstructions: (root) => ipcRenderer.invoke("workspace:instructions", { root }),
  workspaceGit: (root) => ipcRenderer.invoke("workspace:git", { root }),
  workspaceSnapshot: (root, taskKey, files) => ipcRenderer.invoke("workspace:snapshot", { root, taskKey, files }),
  workspaceDiff: (taskKey) => ipcRenderer.invoke("workspace:diff", { taskKey }),
  workspaceUndo: (taskKey, files) => ipcRenderer.invoke("workspace:undo", { taskKey, files }),
  workspaceUndoConfirm: (approvalId, decision) => ipcRenderer.invoke("workspace:undoConfirm", { approvalId, decision }),
  workspaceWatch: (root) => ipcRenderer.invoke("workspace:watch", { root }),
  workspaceUnwatch: (root) => ipcRenderer.invoke("workspace:unwatch", { root }),
  onWorkspaceFilesChanged: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("workspace:files-changed", handler);
    return () => ipcRenderer.removeListener("workspace:files-changed", handler);
  },
  latexDetect: (root) => ipcRenderer.invoke("latex:detect", { root }),
  latexCompile: (root, engine) => ipcRenderer.invoke("latex:compile", { root, engine }),
  latexOpenPdf: (root, path) => ipcRenderer.invoke("latex:openPdf", { root, path }),
  computerCapabilities: () => ipcRenderer.invoke("computer:capabilities"),
  computerScreenshot: () => ipcRenderer.invoke("computer:screenshot"),
  computerAct: (action, params) => ipcRenderer.invoke("computer:act", { action, params }),
  computerRequest: (action, params, taskId) => ipcRenderer.invoke("computer:request", { action, params, taskId }),
  computerConfirm: (approvalId, decision) => ipcRenderer.invoke("computer:confirm", { approvalId, decision }),
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
  knowledge: (op, payload) => ipcRenderer.invoke("research:knowledge", op, payload),
  connectors: (op, payload) => ipcRenderer.invoke("research:connectors", op, payload),
  tools: (op, payload) => ipcRenderer.invoke("research:tools", op, payload),
  /* Phase 7: metadata-only bridges — token values never cross IPC. */
  connectorAuth: (op, payload) => ipcRenderer.invoke("research:connectorAuth", op, payload),
  mcp: (op, payload) => ipcRenderer.invoke("research:mcp", op, payload),
  /* Phase 8: controlled actions + sync + workflows + agents + MCP server.
   * Explicit allowlisted channels (no generic IPC). Approval decisions and
   * bearer tokens for the MCP server cross here only as opaque values the
   * main process validates; provider OAuth tokens never cross IPC. */
  actions: (op, payload) => ipcRenderer.invoke("research:actions", op, payload),
  sync: (op, payload) => ipcRenderer.invoke("research:sync", op, payload),
  workflows: (op, payload) => ipcRenderer.invoke("research:workflows", op, payload),
  agents: (op, payload) => ipcRenderer.invoke("research:agents", op, payload),
  mcpserver: (op, payload) => ipcRenderer.invoke("research:mcpserver", op, payload),
});

/* Phase 9: Ollama local-AI lifecycle — narrow allowlisted channels only.
 * Loopback endpoints + allowlisted model names are enforced in the main
 * process. No shell, no binary execution, no arbitrary URLs. */
contextBridge.exposeInMainWorld("openbenttOllama", {
  status: (origin) => ipcRenderer.invoke("ollama:status", origin),
  listModels: (origin) => ipcRenderer.invoke("ollama:listModels", origin),
  pullModel: (model, origin) => ipcRenderer.invoke("ollama:pullModel", model, origin),
  cancelPull: (model) => ipcRenderer.invoke("ollama:cancelPull", model),
  installInfo: () => ipcRenderer.invoke("ollama:installInfo"),
  recommendedModels: () => ipcRenderer.invoke("ollama:recommendedModels"),
  onPullProgress: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("ollama:pullProgress", handler);
    return () => ipcRenderer.removeListener("ollama:pullProgress", handler);
  },
});

/* Phase 10 (OpenCode runtime, Phase 1) + Phase 11 (OmniRoute) +
 * Phase 12 (Voice): capability-specific agent bridge. No ipcRenderer,
 * no child_process, no fs, no generic execute. Voice methods route through
 * validated `voice:*` handlers in voiceService.mjs — transcripts are
 * untrusted input, and voice can never approve permissions. */
contextBridge.exposeInMainWorld("openbenttAgent", {
  detectOpenCode: () => ipcRenderer.invoke("agent:detectOpenCode"),
  getStatus: () => ipcRenderer.invoke("agent:status"),
  createTask: (args) => ipcRenderer.invoke("agent:createTask", args),
  startTask: (taskId) => ipcRenderer.invoke("agent:startTask", { taskId }),
  cancelTask: (taskId) => ipcRenderer.invoke("agent:cancelTask", { taskId }),
  getTask: (taskId) => ipcRenderer.invoke("agent:getTask", { taskId }),
  listTasks: () => ipcRenderer.invoke("agent:listTasks"),
  respondToPermission: (args) => ipcRenderer.invoke("agent:permission", args),
  classify: (text) => ipcRenderer.invoke("agent:classify", { text }),
  askOpenCode: (args) => ipcRenderer.invoke("agent:ask", args),
  listOpenCodeModels: () => ipcRenderer.invoke("agent:opencodeModels"),
  detectOmniRoute: () => ipcRenderer.invoke("agent:detectOmniRoute"),
  getRuntimeStatus: () => ipcRenderer.invoke("agent:runtimeStatus"),
  getModels: (refresh) => ipcRenderer.invoke("agent:models", { refresh: refresh !== false }),
  ensureRuntime: () => ipcRenderer.invoke("agent:ensureRuntime"),
  restartRuntime: () => ipcRenderer.invoke("agent:restartRuntime"),
  onEvent: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  },
  startVoiceSession: (mode) => ipcRenderer.invoke("voice:startSession", { mode }),
  voiceMicReady: (sessionId) => ipcRenderer.invoke("voice:micReady", { sessionId }),
  voiceMicDenied: (sessionId, reason) => ipcRenderer.invoke("voice:micDenied", { sessionId, reason }),
  beginVoiceUtterance: (sessionId) => ipcRenderer.invoke("voice:beginUtterance", { sessionId }),
  sendVoiceAudio: (args) => ipcRenderer.invoke("voice:audioChunk", args),
  cancelVoiceUtterance: (sessionId) => ipcRenderer.invoke("voice:cancelUtterance", { sessionId }),
  voiceThinking: (sessionId) => ipcRenderer.invoke("voice:thinking", { sessionId }),
  speakVoiceText: (sessionId, text) => ipcRenderer.invoke("voice:speak", { sessionId, text }),
  stopVoiceSpeaking: (sessionId) => ipcRenderer.invoke("voice:stopSpeaking", { sessionId }),
  stopVoiceSession: (sessionId) => ipcRenderer.invoke("voice:stopSession", { sessionId }),
  setVoiceMode: (sessionId, mode) => ipcRenderer.invoke("voice:setMode", { sessionId, mode }),
  getVoiceStatus: (sessionId) => ipcRenderer.invoke("voice:status", { sessionId }),
  getVoiceEngineStatus: () => ipcRenderer.invoke("voice:sttStatus"),
  ensureVoiceStt: (sessionId) => ipcRenderer.invoke("voice:ensureStt", { sessionId }),
  onVoiceEvent: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("voice:event", handler);
    return () => ipcRenderer.removeListener("voice:event", handler);
  },
});
