const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("openbenttDesktop", {
  platform: process.platform,
  isElectron: true,
});
