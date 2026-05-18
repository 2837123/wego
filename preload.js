const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  page: (f) => ipcRenderer.invoke('page', f),
  dates: () => ipcRenderer.invoke('dates'),
  save: (j) => ipcRenderer.invoke('save', j),
  loadSaved: () => ipcRenderer.invoke('load-saved'),
  saveState: (j) => ipcRenderer.invoke('save-state', j),
  loadState: () => ipcRenderer.invoke('load-state'),
  log: (a, d) => ipcRenderer.invoke('log', a, d),
  getLog: () => ipcRenderer.invoke('get-log'),
  export: (j) => ipcRenderer.invoke('export', j),
  fetch: () => ipcRenderer.invoke('fetch'),
  login: () => ipcRenderer.invoke('login'),
  onLoginDone: (cb) => ipcRenderer.on('login-done', (_e, d) => cb(d)),
  aiSaveConfig: (c) => ipcRenderer.invoke('ai-save-config', c),
  aiLoadConfig: () => ipcRenderer.invoke('ai-load-config'),
  aiTest: (c) => ipcRenderer.invoke('ai-test', c),
  aiChat: (c, m) => ipcRenderer.invoke('ai-chat', c, m),
  aiProcess: (cfg, products, prompts, enabled) => ipcRenderer.invoke('ai-process', cfg, products, prompts, enabled),
  onAiProgress: (cb) => ipcRenderer.on('ai-process-progress', (_e, d) => cb(d)),
});
