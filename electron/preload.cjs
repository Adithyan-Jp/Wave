const { contextBridge, ipcRenderer } = require("electron");

// The only things the web UI can ask the desktop shell to do.
contextBridge.exposeInMainWorld("wave", {
  isDesktop: true,
  platform: process.platform,
  version: ipcRenderer.sendSync("wave:version"),
  send: (action, opts) => ipcRenderer.invoke("wave:send", String(action), opts && typeof opts === "object" ? { swipeKeys: opts.swipeKeys } : {}),
  setMini: (on) => ipcRenderer.invoke("wave:set-mini", !!on),
});
