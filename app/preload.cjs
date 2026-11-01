const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("typecase", {
  data: () => ipcRenderer.invoke("typecase:data"),
  usage: () => ipcRenderer.invoke("typecase:usage"),
  raw: (file) => ipcRenderer.invoke("typecase:raw", file),
  reveal: (file) => ipcRenderer.invoke("typecase:reveal", file),
  openEditor: (file) => ipcRenderer.invoke("typecase:open-editor", file),
  openExternal: (url) => ipcRenderer.invoke("typecase:open-external", url),
  setTheme: (theme) => ipcRenderer.send("typecase:set-theme", theme),
  onSkillsChanged: (fn) => ipcRenderer.on("skills-changed", fn),
});
