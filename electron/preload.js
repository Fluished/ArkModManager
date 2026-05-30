const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  fetchSteamModDetails: (args) => ipcRenderer.invoke('fetch-steam-mod-details', args),
  getModFolderInfos: (args) => ipcRenderer.invoke('get-mod-folder-infos', args),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  browseModsDir: () => ipcRenderer.invoke('browse-mods-dir'),
  importModList: () => ipcRenderer.invoke('import-mod-list'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
  getDefaultModsPath: () => ipcRenderer.invoke('get-default-mods-path'),
});