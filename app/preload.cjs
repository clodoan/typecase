const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("typecase", {
  data: () => ipcRenderer.invoke("typecase:data"),
  raw: (file) => ipcRenderer.invoke("typecase:raw", file),
  reveal: (file) => ipcRenderer.invoke("typecase:reveal", file),
  openEditor: (file) => ipcRenderer.invoke("typecase:open-editor", file),
  openExternal: (url) => ipcRenderer.invoke("typecase:open-external", url),
  setTheme: (theme) => ipcRenderer.send("typecase:set-theme", theme),
  source: (dir) => ipcRenderer.invoke("typecase:source", dir),
  connect: (target) => ipcRenderer.invoke("typecase:connect", target),
  mirror: () => ipcRenderer.invoke("typecase:mirror"),
  onSkillsChanged: (fn) => ipcRenderer.on("skills-changed", fn),
});
