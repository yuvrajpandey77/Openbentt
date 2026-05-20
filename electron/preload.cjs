const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openbenttDesktop", {
  platform: process.platform,
  isElectron: true,
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
