/**
 * Centralized IPC authorization for the Openbentt desktop shell.
 *
 * Every ipcMain.handle/on registration is wrapped here. A request is only
 * delivered to the service when it comes from the one main-process-owned
 * BrowserWindow, from its main frame, from the trusted app/dev origin, with a
 * valid channel-specific payload and a capability grant that was issued by
 * main process code (never by the renderer).
 *
 * This module deliberately has no Electron API import so it can be unit-tested
 * in plain Node with synthetic events. Only node:fs/node:path are used for
 * canonicalizing main-owned workspace roots. main.mjs installs it before any
 * service registers a channel.
 */

import fs from "node:fs";
import path from "node:path";

const TRUSTED_APP_ORIGIN = "app://openbentt";
const DEFAULT_DEV_ORIGIN = "http://127.0.0.1:8080";

/** @typedef {{ sender: any, senderFrame?: any, frameId?: number }} IpcEvent */

function normalizeOrigin(url) {
  if (typeof url !== "string" || !url) return null;
  if (/^app:\/\/openbentt(?:\/|$)/i.test(url)) return TRUSTED_APP_ORIGIN;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    /* invalid URL */
  }
  return null;
}

function trustedOrigins() {
  const origins = new Set([TRUSTED_APP_ORIGIN]);
  const configured = process.env.VITE_DEV_SERVER_URL || DEFAULT_DEV_ORIGIN;
  const devOrigin = normalizeOrigin(configured);
  if (devOrigin) origins.add(devOrigin);
  // Vite may be reached through either loopback hostname in development.
  if (devOrigin && devOrigin.startsWith("http://127.0.0.1:")) {
    origins.add(devOrigin.replace("http://127.0.0.1:", "http://localhost:"));
  }
  return origins;
}

/* -------------------------- payload validation -------------------------- */

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const APPROVAL_RE = /^act_[A-Za-z0-9_-]{1,64}$/;
const OP_RE = /^[A-Za-z][A-Za-z0-9_:.\-]{0,63}$/;
const REPO_RE = /^[A-Za-z0-9_.-]{1,128}(?:\/[A-Za-z0-9_.-]{1,128})?$/;

const validators = {
  any: () => true,
  id: (v) => typeof v === "string" && ID_RE.test(v),
  nullableId: (v) => v === null || (typeof v === "string" && ID_RE.test(v)),
  approval: (v) => typeof v === "string" && APPROVAL_RE.test(v),
  op: (v) => typeof v === "string" && OP_RE.test(v),
  text: (v) => typeof v === "string" && v.length <= 20_000,
  longText: (v) => typeof v === "string" && v.length <= 2_000_000,
  path: (v) => typeof v === "string" && v.length > 0 && v.length <= 4096 && !/[\0\r\n]/.test(v),
  // Zotero uses "" as the "clear configured path" value, and its watch API
  // allows the path to be omitted so main falls back to the stored config.
  pathOrEmpty: (v) => typeof v === "string" && v.length <= 4096 && !/[\0\r\n]/.test(v),
  url: (v) => typeof v === "string" && v.length <= 2048 && /^https?:\/\//i.test(v),
  // externalUrlPolicy.mjs accepts only https with a hostname and no credentials.
  httpsUrl: (v) => typeof v === "string" && v.length <= 2048 && /^https:\/\//i.test(v),
  repoId: (v) => typeof v === "string" && REPO_RE.test(v),
  bool: (v) => typeof v === "boolean",
  num: (v) => typeof v === "number" && Number.isFinite(v),
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date),
  array: (v) => Array.isArray(v),
  base64: (v) =>
    typeof v === "string" && v.length <= 64 * 1024 * 1024 && /^[A-Za-z0-9+/=\s]*$/.test(v),
  audio: (v) => {
    if (v && typeof v === "object" && typeof v.base64 === "string") {
      return v.base64.length <= 256 * 1024 * 4 && /^[A-Za-z0-9+/=]*$/.test(v.base64);
    }
    return validators.base64(v) && v.length <= 256 * 1024 * 4;
  },
};

function plainValueBytes(value, seen = new Set(), depth = 0) {
  if (value === null || value === undefined) return 0;
  if (depth > 16) return Infinity;
  if (typeof value === "string") return value.length * 2;
  if (typeof value === "number" || typeof value === "boolean") return 8;
  if (typeof value !== "object") return Infinity; // function/symbol/bigint are not valid IPC payloads
  if (seen.has(value)) return Infinity;
  seen.add(value);
  let total = 0;
  if (Array.isArray(value)) {
    if (value.length > 100_000) return Infinity;
    for (const item of value) total += plainValueBytes(item, seen, depth + 1);
  } else {
    const keys = Object.keys(value);
    if (keys.length > 2000) return Infinity;
    for (const key of keys) {
      total += key.length * 2 + plainValueBytes(value[key], seen, depth + 1);
    }
  }
  seen.delete(value);
  return total;
}

const spec = (capabilities, argValidators = [], options = {}) => ({
  capabilities,
  argValidators,
  maxBytes: options.maxBytes ?? 2 * 1024 * 1024,
  required: options.required ?? [],
  evidence: options.evidence ?? [],
});

/* --------------------------- channel policy ---------------------------- */

/** Every channel in electron/** must appear here. Unknown channels are denied. */
const POLICY = Object.freeze({
  // Desktop window / shell -------------------------------------------------
  "desktop:windowMinimize": spec(["window.control"]),
  "desktop:windowToggleMaximize": spec(["window.control"]),
  "desktop:windowClose": spec(["window.control"]),
  "desktop:windowIsMaximized": spec(["window.control"]),
  "desktop:editRole": spec(["window.control"], ["text"]),
  "desktop:reload": spec(["window.control"]),
  "desktop:toggleDevTools": spec(["window.control"]),
  "desktop:quit": spec(["window.control"]),
  "desktop:showAbout": spec(["window.control"]),
  "desktop:openExternal": spec(["external.url"], ["httpsUrl"]),
  "desktop:openPath": spec(["external.path"], ["path"]),
  "desktop:pickWorkspaceFolder": spec(["workspace.fs"], ["text"]),
  "desktop:copyText": spec(["window.control"], ["longText"], { maxBytes: 8 * 1024 * 1024 }),
  "desktop:pasteText": spec(["window.control"]),
  "desktop:getAppVersion": spec([]),
  "desktop:checkForUpdates": spec(["updater.control"]),
  "desktop:downloadUpdate": spec(["updater.control"]),
  "desktop:installUpdate": spec(["updater.control"]),
  "agents:detect": spec(["agent.tasks"]),

  // Workspace filesystem (main-owned roots + approval-gated writes) -------
  "workspace:resolve": spec(["workspace.fs"], ["object"], { required: [0] }),
  "workspace:list": spec(["workspace.fs"], ["object"], { required: [0] }),
  "workspace:read": spec(["workspace.fs"], ["object"], { required: [0] }),
  "workspace:verify": spec(["workspace.fs"], ["object"], { required: [0] }),
  "workspace:instructions": spec(["workspace.fs"], ["object"], { required: [0] }),
  "workspace:git": spec(["workspace.fs"], ["object"], { required: [0] }),
  "workspace:snapshot": spec(["workspace.fs"], ["object"], { required: [0] }),
  "workspace:diff": spec(["workspace.fs"], ["object"], { required: [0] }),
  "workspace:undo": spec(["workspace.fs"], ["object"], { required: [0] }),
  "workspace:undoConfirm": spec(["workspace.fs"], ["object"], {
    required: [0], evidence: ["approval"],
  }),
  "workspace:write": spec(["workspace.fs"], ["object"], {
    required: [0],
    // Main allows 10 files × 256 KiB; strings are counted as 2 bytes here.
    maxBytes: 8 * 1024 * 1024,
  }),
  "workspace:writeConfirm": spec(["workspace.fs"], ["object"], {
    required: [0], evidence: ["approval"],
  }),
  "workspace:watch": spec(["workspace.fs"], ["object"], { required: [0] }),
  "workspace:unwatch": spec(["workspace.fs"], ["object"], { required: [0] }),
  "latex:detect": spec(["workspace.fs"], ["object"], { required: [0] }),
  "latex:compile": spec(["workspace.fs", "localBinary.exec"], ["object"], {
    required: [0], maxBytes: 8 * 1024 * 1024,
  }),
  "latex:openPdf": spec(["workspace.fs", "external.path"], ["object"], { required: [0] }),

  // Documents / OCR --------------------------------------------------------
  "documents:ocrStatus": spec([]),
  "documents:ocr": spec(["document.access"], ["object"], {
    // Up to 100 PNG pages are batched as base64; 2 bytes per string char.
    required: [0], maxBytes: 320 * 1024 * 1024,
  }),

  // Research database / project data --------------------------------------
  "research:init": spec(["research.data"]),
  "research:listProjects": spec(["research.data"]),
  "research:getActiveProjectId": spec(["research.data"]),
  "research:persistenceStatus": spec(["research.data"]),
  "research:setActiveProjectId": spec(["research.data"], ["nullableId"]),
  "research:loadProject": spec(["research.data"], ["id"]),
  "research:saveProject": spec(["research.data"], ["object"], {
    required: [0], maxBytes: 32 * 1024 * 1024,
  }),
  "research:patchDraft": spec(["research.data"], ["id", "longText"], {
    required: [0],
    // longText allows 2M chars = 4 MiB in plainValueBytes accounting.
    maxBytes: 8 * 1024 * 1024,
  }),
  "research:patchBibliography": spec(["research.data"], ["id", "longText"], { required: [0] }),
  "research:deleteProject": spec(["research.data"], ["id"], { required: [0] }),
  "research:storePaperPdf": spec(["research.data", "document.access"], ["id", "id", "base64"], {
    // Main accepts 48 MiB decoded; base64 chars count as 2 bytes here.
    required: [0, 1, 2], maxBytes: 160 * 1024 * 1024,
  }),
  "research:loadPaperPdf": spec(["research.data", "document.access"], ["id", "id"], {
    required: [0, 1],
  }),
  "research:listProjectAssets": spec(["research.data"], ["id"], { required: [0] }),
  "research:storeProjectAsset": spec(["research.data", "document.access"], ["id", "path", "base64"], {
    required: [0, 1, 2], maxBytes: 160 * 1024 * 1024,
  }),
  "research:loadProjectAsset": spec(["research.data", "document.access"], ["id", "path"], {
    required: [0, 1],
  }),
  "research:compileProjectLatex": spec(["research.data", "localBinary.exec"], ["object"], {
    required: [0], maxBytes: 160 * 1024 * 1024,
  }),
  "research:storePaperPdfPath": spec(["research.data", "document.access"], ["id", "id", "path"], {
    required: [0, 1, 2],
  }),
  "research:getCompileArtifact": spec(["research.data"], ["id", "id"], { required: [0, 1] }),
  "research:putCompileArtifact": spec(["research.data"], ["id", "id", "base64", "object"], {
    required: [0, 1, 2], maxBytes: 160 * 1024 * 1024,
  }),
  "research:loadEmbeddings": spec(["research.data"], ["id", "array"], { required: [0, 1] }),
  "research:upsertEmbeddings": spec(["research.data"], ["id", "array"], {
    required: [0, 1], maxBytes: 32 * 1024 * 1024,
  }),
  "research:embeddingStats": spec(["research.data"], ["id"], { required: [0] }),
  "research:clearEmbeddings": spec(["research.data"], ["id"], { required: [0] }),
  "research:deleteEmbeddingsForChunks": spec(["research.data"], ["id", "array"], {
    required: [0, 1],
  }),
  "research:enqueueJob": spec(["research.data"], ["id", "op", "object"], { required: [0, 1] }),
  "research:cancelJob": spec(["research.data"], ["id", "id"], { required: [0, 1] }),
  "research:cancelAllJobs": spec(["research.data"], ["id"], { required: [0] }),
  "research:listJobs": spec(["research.data"], ["id"], { required: [0] }),
  "research:createSnapshot": spec(["research.data"], ["id", "text"], { required: [0] }),
  "research:listSnapshots": spec(["research.data"], ["id"], { required: [0] }),
  "research:restoreSnapshot": spec(["research.data"], ["id"], { required: [0] }),
  "research:pushDraftHistory": spec(["research.data"], ["id", "longText", "text"], {
    required: [0, 1], maxBytes: 8 * 1024 * 1024,
  }),
  "research:listDraftHistory": spec(["research.data"], ["id"], { required: [0] }),
  "research:restoreDraftHistory": spec(["research.data"], ["id"], { required: [0] }),
  "research:exportFinetuneCorpus": spec(["research.data"], ["id"], { required: [0] }),
  "research:patchKnowledge": spec(["research.data"], ["id", "longText"], {
    required: [0, 1], maxBytes: 8 * 1024 * 1024,
  }),
  "research:appendChatLog": spec(["research.data"], ["id", "object"], {
    required: [0, 1], maxBytes: 4 * 1024 * 1024,
  }),
  "research:listChatLogs": spec(["research.data"], ["id", "object"], { required: [0] }),
  "research:listLinkedThreads": spec(["research.data"], ["id"], { required: [0] }),
  "research:knowledge": spec(["research.data"], ["op", "object"], { required: [0] }),
  "research:connectors": spec(["research.data"], ["op", "object"], { required: [0] }),
  "research:connectorAuth": spec(["research.data"], ["op", "object"], { required: [0] }),
  "research:mcp": spec(["research.data"], ["op", "object"], { required: [0] }),
  "research:tools": spec(["research.data", "terminal.exec"], ["op", "object"], { required: [0] }),
  "research:actions": spec(["research.data", "terminal.exec"], ["op", "object"], { required: [0] }),
  "research:sync": spec(["research.data"], ["op", "object"], { required: [0] }),
  "research:workflows": spec(["research.data"], ["op", "object"], { required: [0] }),
  "research:agents": spec(["research.data", "agent.tasks"], ["op", "object"], { required: [0] }),
  "research:mcpserver": spec(["research.data"], ["op", "object"], { required: [0] }),

  // Secrets ----------------------------------------------------------------
  "secretVault:status": spec([]),
  "secretVault:load": spec(["secrets.write"]),
  "secretVault:set": spec(["secrets.write"], ["text", "longText"], { required: [0, 1] }),
  "secretVault:clear": spec(["secrets.write"], ["text"], { required: [0] }),
  "hfSecret:status": spec([]),
  "hfSecret:set": spec(["secrets.write"], ["longText"], { required: [0] }),
  "hfSecret:clear": spec(["secrets.write"]),
  "zoteroSecret:status": spec([]),
  "zoteroSecret:set": spec(["secrets.write"], ["longText"], { required: [0] }),
  "zoteroSecret:clear": spec(["secrets.write"]),

  // Zotero -----------------------------------------------------------------
  "zotero:detectLocal": spec(["zotero.sync"]),
  "zotero:status": spec(["zotero.sync"]),
  "zotero:setCredentials": spec(["secrets.write", "zotero.sync"], ["text", "longText"], {
    required: [0, 1],
  }),
  "zotero:clearCredentials": spec(["secrets.write", "zotero.sync"]),
  "zotero:setBbtExportPath": spec(["external.path", "zotero.sync"], ["pathOrEmpty"], { required: [0] }),
  "zotero:sync": spec(["zotero.sync"], ["object"]),
  "zotero:refreshLibrary": spec(["zotero.sync"], ["object"]),
  "zotero:getLibrarySnapshot": spec(["zotero.sync"]),
  "zotero:watchBetterBibTeX": spec(["external.path", "zotero.sync"], ["pathOrEmpty"]),
  "zotero:stopWatch": spec(["zotero.sync"]),

  // Local models / Ollama --------------------------------------------------
  "localGguf:listRegistry": spec([]),
  "localGguf:diskFree": spec([]),
  "localGguf:resolveBinary": spec(["localBinary.exec"], ["path"]),
  "localGguf:searchHf": spec([], ["text"]),
  "localGguf:listGgufFiles": spec([], ["repoId"]),
  "localGguf:addFromHf": spec(["localBinary.exec"], ["object"], {
    required: [0], maxBytes: 4 * 1024 * 1024,
  }),
  "localGguf:deleteEntry": spec(["localBinary.exec"], ["id"], { required: [0] }),
  "localGguf:ensureServer": spec(["localBinary.exec"], ["object"], { required: [0] }),
  "localGguf:stopServer": spec(["localBinary.exec"]),
  "localGguf:whoami": spec(["secrets.write"], ["longText"], { required: [0] }),
  "ollama:status": spec(["ollama.local"], ["text"]),
  "ollama:listModels": spec(["ollama.local"], ["text"]),
  "ollama:pullModel": spec(["ollama.local", "localBinary.exec"], ["text", "text"], { required: [0] }),
  "ollama:cancelPull": spec(["ollama.local"], ["text"], { required: [0] }),
  "ollama:installInfo": spec(["ollama.local"]),
  "ollama:recommendedModels": spec(["ollama.local"]),

  // Agent / OpenCode / OmniRoute ------------------------------------------
  "agent:detectOpenCode": spec(["agent.tasks"]),
  "agent:defaultWorkspace": spec(["agent.tasks"]),
  "agent:status": spec(["agent.tasks"]),
  "agent:createTask": spec(["agent.tasks", "workspace.fs"], ["object"], {
    required: [0], maxBytes: 4 * 1024 * 1024,
  }),
  "agent:startTask": spec(["agent.tasks", "terminal.exec"], ["object"], {
    required: [0],
  }),
  "agent:cancelTask": spec(["agent.tasks"], ["object"], { required: [0] }),
  "agent:getTask": spec(["agent.tasks"], ["object"], { required: [0] }),
  "agent:listTasks": spec(["agent.tasks"]),
  "agent:permission": spec(["agent.tasks"], ["object"], {
    required: [0], evidence: ["approval"],
  }),
  "agent:question": spec(["agent.tasks"], ["object"], { required: [0] }),
  "agent:serverStatus": spec(["agent.tasks"]),
  "agent:sessionDiff": spec(["agent.tasks"], ["object"], { required: [0] }),
  "agent:sessionTodos": spec(["agent.tasks"], ["object"], { required: [0] }),
  "agent:sessionMessages": spec(["agent.tasks"], ["object"], { required: [0] }),
  "agent:fileStatus": spec(["agent.tasks"], ["object"], { required: [0] }),
  "agent:sessionChildren": spec(["agent.tasks"], ["object"], { required: [0] }),
  "agent:classify": spec(["agent.tasks"], ["object"], { required: [0] }),
  "agent:ask": spec(["agent.tasks"], ["object"], { required: [0], maxBytes: 8 * 1024 * 1024 }),
  "agent:opencodeModels": spec(["agent.tasks"]),
  "agent:detectOmniRoute": spec(["agent.tasks"]),
  "agent:runtimeStatus": spec(["agent.tasks"]),
  "agent:models": spec(["agent.tasks"], ["object"]),
  "agent:ensureRuntime": spec(["agent.tasks", "terminal.exec"]),
  "agent:restartRuntime": spec(["agent.tasks", "terminal.exec"]),

  // Computer use, voice, narration ----------------------------------------
  "computer:capabilities": spec(["computer.use"]),
  "computer:screenshot": spec(["computer.use"]),
  "computer:act": spec(["computer.use"], ["object"], { required: [0] }),
  "computer:request": spec(["computer.use"], ["object"], { required: [0] }),
  "computer:confirm": spec(["computer.use"], ["object"], {
    required: [0], evidence: ["approval"],
  }),
  "voice:startSession": spec(["voice.input"], ["object"], { required: [0] }),
  "voice:micReady": spec(["voice.input"], ["object"], { required: [0] }),
  "voice:sttStatus": spec([]),
  "voice:ensureStt": spec(["voice.input"], ["object"], { required: [0] }),
  "voice:clearSttCache": spec(["voice.input"]),
  "voice:micDenied": spec(["voice.input"], ["object"], { required: [0] }),
  "voice:beginUtterance": spec(["voice.input"], ["object"], { required: [0] }),
  "voice:audioChunk": spec(["voice.input"], ["audio"], {
    required: [0], maxBytes: 256 * 1024 * 4,
  }),
  "voice:cancelUtterance": spec(["voice.input"], ["object"], { required: [0] }),
  "voice:thinking": spec(["voice.input"], ["object"], { required: [0] }),
  "voice:speak": spec(["voice.input"], ["object"], { required: [0] }),
  "voice:stopSpeaking": spec(["voice.input"], ["object"], { required: [0] }),
  "voice:stopSession": spec(["voice.input"], ["object"], { required: [0] }),
  "voice:setMode": spec(["voice.input"], ["object"], { required: [0] }),
  "voice:status": spec(["voice.input"], ["object"], { required: [0] }),
  "narration:status": spec(["narration.audio"]),
  "narration:ensure": spec(["narration.audio"]),
  "narration:synthesize": spec(["narration.audio"], ["text"], { required: [0] }),

  // PaperOrchestra (intact Python CLI sidecar) -----------------------------
  "paperOrchestra:status": spec(["paperOrchestra.run"]),
  "paperOrchestra:listVenues": spec(["paperOrchestra.run"]),
  "paperOrchestra:cancel": spec(["paperOrchestra.run"]),
  "paperOrchestra:importArtifacts": spec(["paperOrchestra.run"], ["path"], { required: [0] }),
  "paperOrchestra:start": spec(["paperOrchestra.run", "localBinary.exec"], ["object"], {
    required: [0],
    maxBytes: 16 * 1024 * 1024,
  }),
});

/* ------------------------ trusted window registry ----------------------- */

const trustedWindows = new Map(); // webContents.id -> { windowId, webContents }
const workspaceRoots = new Set();
const denialLog = [];

/** Main-only: called from createWindow(), never from a renderer channel. */
export function registerTrustedWindow(win) {
  if (!win || typeof win.id !== "number" || !win.webContents) return null;
  const webContentsId = win.webContents.id;
  trustedWindows.set(webContentsId, { windowId: win.id, webContents: win.webContents });
  grantWindowCapabilities(webContentsId);
  // Return the id so callers can unregister from a "closed" handler without
  // touching the destroyed BrowserWindow/webContents again.
  return webContentsId;
}

export function unregisterTrustedWindow(winOrWebContentsId) {
  const id =
    typeof winOrWebContentsId === "number"
      ? winOrWebContentsId
      : winOrWebContentsId?.isDestroyed?.()
        ? null
        : winOrWebContentsId?.webContents?.id;
  if (typeof id !== "number") return;
  trustedWindows.delete(id);
  grants.delete(id);
}

/**
 * Capability grants are issued here, in main code. There is intentionally no
 * IPC channel that can add, remove or escalate a grant.
 * Each grant is scoped to channel prefixes so a capability for one surface
 * cannot be reused on another.
 */
const CAPABILITY_SCOPES = {
  "window.control": ["desktop:window", "desktop:editRole", "desktop:reload", "desktop:toggleDevTools", "desktop:quit", "desktop:showAbout", "desktop:copyText", "desktop:pasteText", "desktop:getAppVersion"],
  "external.path": ["desktop:openPath", "desktop:pickWorkspaceFolder", "latex:openPdf", "zotero:setBbtExportPath", "zotero:watchBetterBibTeX", "research:storePaperPdfPath"],
  "external.url": ["desktop:openExternal"],
  "workspace.fs": ["workspace:", "latex:", "agent:createTask", "desktop:pickWorkspaceFolder"],
  "document.access": ["documents:", "research:storePaperPdf", "research:loadPaperPdf", "research:storeProjectAsset", "research:loadProjectAsset", "research:storePaperPdfPath"],
  "research.data": ["research:"],
  "secrets.write": ["secretVault:", "hfSecret:", "zoteroSecret:", "zotero:setCredentials", "zotero:clearCredentials", "localGguf:whoami"],
  "localBinary.exec": ["localGguf:", "ollama:pullModel", "latex:compile", "research:compileProjectLatex"],
  "terminal.exec": ["agent:startTask", "agent:ensureRuntime", "agent:restartRuntime", "research:tools", "research:actions"],
  "computer.use": ["computer:"],
  "voice.input": ["voice:"],
  "narration.audio": ["narration:"],
  "paperOrchestra.run": ["paperOrchestra:"],
  "zotero.sync": ["zotero:"],
  "ollama.local": ["ollama:"],
  "agent.tasks": ["agent:", "agents:", "research:agents"],
  "updater.control": ["desktop:checkForUpdates", "desktop:downloadUpdate", "desktop:installUpdate"],
};

const grants = new Map(); // webContents.id -> Map<capability, string[]>

function grantWindowCapabilities(webContentsId) {
  grants.set(webContentsId, new Map(Object.entries(CAPABILITY_SCOPES)));
}

export function getCapabilityGrants(webContentsId) {
  const entry = grants.get(webContentsId);
  return entry ? Object.fromEntries([...entry].map(([k, v]) => [k, [...v]])) : null;
}

/**
 * Canonicalize a main-owned workspace root. realpath() is used when the path
 * exists so a renderer-supplied symlink/relative path cannot be compared by a
 * different spelling than the one main validated. Falls back to path.resolve
 * for paths that main has not materialized yet.
 */
function canonicalPath(value) {
  if (typeof value !== "string" || !value || value.length > 4096) return null;
  try {
    return path.normalize(fs.realpathSync.native(value));
  } catch {
    try {
      return path.normalize(path.resolve(value));
    } catch {
      return null;
    }
  }
}

/** Main-only helper for tests and main-owned flows. Never exposed to IPC. */
export function registerWorkspaceRoot(root) {
  const canonical = canonicalPath(root);
  if (canonical && !/[\0\r\n]/.test(root)) {
    workspaceRoots.add(canonical);
    return true;
  }
  return false;
}

function extractRoot(arg) {
  if (!arg || typeof arg !== "object" || Array.isArray(arg)) return null;
  return typeof arg.root === "string"
    ? arg.root
    : typeof arg.workspaceRoot === "string"
      ? arg.workspaceRoot
      : null;
}

function isAuthorizedRoot(value) {
  const canonical = canonicalPath(value);
  return canonical !== null && workspaceRoots.has(canonical);
}

export function resetAuthorizationForTests() {
  trustedWindows.clear();
  grants.clear();
  workspaceRoots.clear();
  denialLog.length = 0;
}

export function getAuthorizationDenials() {
  return denialLog.slice(-200);
}

export function getChannelPolicy() {
  return POLICY;
}

/* ---------------------------- authorization ---------------------------- */

function isTrustedSender(event) {
  if (!event || typeof event !== "object") return false;
  const sender = event.sender;
  if (!sender || sender.isDestroyed?.()) return false;
  const trusted = trustedWindows.get(sender.id);
  if (!trusted || trusted.webContents !== sender) return false;

  const frame = event.senderFrame ?? sender.mainFrame;
  if (!frame || frame.isDestroyed?.()) return false;
  if (frame.parent !== null && frame.parent !== undefined) return false; // iframe / subframe
  const mainFrame = sender.mainFrame;
  if (mainFrame && frame !== mainFrame) {
    if (frame.routingId !== mainFrame.routingId) return false;
  }
  const frameUrl = frame.url ?? sender.getURL?.();
  const origins = trustedOrigins();
  const urlOrigin = normalizeOrigin(frameUrl);
  const frameOrigin = normalizeOrigin(frame.origin ?? frameUrl);
  if (!urlOrigin || !origins.has(urlOrigin)) return false;
  // Chromium can report an opaque ("null") origin for custom standard schemes
  // such as app://. Accept it only when the frame URL itself is the trusted
  // app origin and the frame is the registered main frame. about:blank, data:
  // and sandboxed frames are still rejected by the URL check and parent check.
  const opaqueAppOrigin =
    frameOrigin === null && urlOrigin === TRUSTED_APP_ORIGIN && String(frame.origin) === "null";
  if (!opaqueAppOrigin && (!frameOrigin || !origins.has(frameOrigin))) return false;
  return true;
}

function evidenceAllowed(channel, evidence, args) {
  for (const kind of evidence) {
    if (kind === "approval") {
      const found = args.some((arg) =>
        arg && typeof arg === "object" && !Array.isArray(arg)
          ? APPROVAL_RE.test(arg.approvalId ?? "")
          : APPROVAL_RE.test(typeof arg === "string" ? arg : "")
      );
      if (!found) return false;
    }
    if (kind === "workspace.root") {
      const roots = args.map(extractRoot).filter(Boolean);
      if (!roots.length) return false;
      if (!roots.some(isAuthorizedRoot)) return false;
    }
  }
  return true;
}

function validateArgs(channel, rule, args) {
  if (args.length > 12) return `too many arguments (${args.length})`;
  for (const index of rule.required) {
    if (args[index] === undefined || args[index] === null) {
      return `missing argument ${index}`;
    }
  }
  rule.argValidators.forEach((validatorName, index) => {
    const value = args[index];
    if (value === undefined) return; // optional unless listed in required
    const validator = validators[validatorName];
    if (!validator || !validator(value)) {
      throw new Error(`invalid argument ${index} (${validatorName})`);
    }
  });
  const bytes = plainValueBytes(args);
  if (!Number.isFinite(bytes) || bytes > rule.maxBytes) {
    return `payload too large (${Math.round(bytes / 1024)} KiB > ${Math.round(rule.maxBytes / 1024)} KiB)`;
  }
  // Workspace filesystem capability only applies to roots vouched for by main.
  // Bootstrap channels are exempt: the native picker and workspace:resolve are
  // the main-owned operations that *establish* a valid root (resolve performs
  // realpath + isDirectory validation in main before returning it). Their
  // successful results are registered by observeResult().
  // agent:createTask also canonicalizes/validates workspaceRoot in main and
  // returns the canonical root in its result, which observeResult() registers.
  const workspaceBootstrap =
    channel === "desktop:pickWorkspaceFolder" ||
    channel === "workspace:resolve" ||
    channel === "agent:createTask";
  if (rule.capabilities.includes("workspace.fs") && !workspaceBootstrap) {
    const roots = args.map(extractRoot).filter(Boolean);
    if (roots.length && !roots.some(isAuthorizedRoot)) {
      return "workspace path has not been authorized by main process";
    }
  }
  if (!evidenceAllowed(channel, rule.evidence, args)) {
    return `missing main-issued evidence for ${channel}`;
  }
  return null;
}

function authorize(channel, event, args) {
  const rule = POLICY[channel];
  if (!rule) return { ok: false, reason: "channel is not in the IPC authorization policy" };
  if (!isTrustedSender(event)) return { ok: false, reason: "untrusted sender frame or origin" };

  const senderId = event.sender.id;
  const granted = grants.get(senderId);
  if (!granted) return { ok: false, reason: "no capability grants for sender" };
  for (const capability of rule.capabilities) {
    const scopes = granted.get(capability);
    if (!scopes || !scopes.some((scope) => channel.startsWith(scope))) {
      return { ok: false, reason: `missing capability ${capability}` };
    }
  }
  try {
    const payloadError = validateArgs(channel, rule, args);
    if (payloadError) return { ok: false, reason: payloadError };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true };
}

function deny(channel, reason, event) {
  const entry = {
    channel,
    reason,
    at: new Date().toISOString(),
    senderId: event?.sender?.id ?? null,
    url: event?.senderFrame?.url ?? event?.sender?.getURL?.() ?? null,
  };
  denialLog.push(entry);
  console.error(`[ipc-auth] denied ${channel}: ${reason}`);
  return entry;
}

/** Observe successful results that legitimately establish main-owned state. */
function observeResult(channel, result) {
  if (channel === "desktop:pickWorkspaceFolder" && typeof result?.path === "string") {
    registerWorkspaceRoot(result.path);
  } else if (channel === "workspace:resolve" && typeof result?.root === "string") {
    registerWorkspaceRoot(result.root);
  } else if (channel === "agent:defaultWorkspace" && typeof result?.path === "string") {
    registerWorkspaceRoot(result.path);
  } else if (
    channel === "agent:createTask" &&
    typeof result?.workspace?.rootPath === "string"
  ) {
    // opencodeService canonicalizes workspaceRoot with resolveWorkspaceRoot()
    // before creating the task; the returned rootPath is main-vouched.
    registerWorkspaceRoot(result.workspace.rootPath);
  }
}

function wrapListener(channel, listener) {
  return async function authorizedListener(event, ...args) {
    const decision = authorize(channel, event, args);
    if (!decision.ok) {
      deny(channel, decision.reason, event);
      throw new Error(`IPC authorization denied for ${channel}: ${decision.reason}`);
    }
    const result = await listener(event, ...args);
    observeResult(channel, result);
    return result;
  };
}

/** Install the guard on the real ipcMain object before any service registers. */
export function installIpcAuthorization(ipcMain) {
  if (!ipcMain || ipcMain.__openbenttAuthorized) return ipcMain;
  const originalHandle = ipcMain.handle.bind(ipcMain);
  const originalHandleOnce = ipcMain.handleOnce?.bind(ipcMain);
  const originalOn = ipcMain.on.bind(ipcMain);
  const originalOnce = ipcMain.once?.bind(ipcMain);

  ipcMain.handle = (channel, listener) => originalHandle(channel, wrapListener(channel, listener));
  if (originalHandleOnce) {
    ipcMain.handleOnce = (channel, listener) =>
      originalHandleOnce(channel, wrapListener(channel, listener));
  }
  ipcMain.on = (channel, listener) => originalOn(channel, wrapListener(channel, listener));
  if (originalOnce) {
    ipcMain.once = (channel, listener) => originalOnce(channel, wrapListener(channel, listener));
  }
  ipcMain.__openbenttAuthorized = true;
  return ipcMain;
}

/** Test helper: run a guarded listener against a synthetic event. */
export async function invokeGuarded(
  channel,
  listener,
  event,
  args = [],
) {
  const decision = authorize(channel, event, args);
  if (!decision.ok) {
    deny(channel, decision.reason, event);
    return { ok: false, reason: decision.reason };
  }
  const result = await listener(event, ...args);
  observeResult(channel, result);
  return { ok: true, result };
}
