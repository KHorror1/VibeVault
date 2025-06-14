const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickFiles: () => ipcRenderer.invoke('dialog:pick-files'),
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('file:exists', filePath),
  readFolderVideos: (folderPath) => ipcRenderer.invoke('folder:read-videos', folderPath),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // ✅ Persistent storage
  getPresets: () => ipcRenderer.invoke('presets:load'),
  savePresets: (data) => ipcRenderer.invoke('presets:save', data)
});
