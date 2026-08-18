const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  launchGame: (options) => ipcRenderer.send('launch-game', options),
  cancelLaunch: () => ipcRenderer.send('cancel-launch'),
  getWorldCount: (profileId) => ipcRenderer.invoke('get-world-count', profileId),
  
  onLaunchProgress: (callback) => ipcRenderer.on('launch-progress', (event, data) => callback(data)),
  onLaunchStatus: (callback) => ipcRenderer.on('launch-status', (event, status) => callback(status)),
  onLaunchLog: (callback) => ipcRenderer.on('launch-log', (event, log) => callback(log)),
  onLaunchError: (callback) => ipcRenderer.on('launch-error', (event, error) => callback(error)),
  onMaximizedStatus: (callback) => ipcRenderer.on('window-maximized-status', (event, status) => callback(status)),
  fetchMcVersions: () => ipcRenderer.invoke('fetch-mc-versions'),
  downloadMod: (data) => ipcRenderer.invoke('download-mod', data),
  getInstalledMods: (profileId) => ipcRenderer.invoke('get-installed-mods', profileId),
  deleteMod: (data) => ipcRenderer.invoke('delete-mod', data),
  openProfileFolder: (profileId) => ipcRenderer.invoke('open-profile-folder', profileId),
  getStoragePath: () => ipcRenderer.invoke('get-storage-path'),
  saveActiveSkinCape: (data) => ipcRenderer.invoke('save-active-skin-cape', data),
  loadActiveSkinCape: (username) => ipcRenderer.invoke('load-active-skin-cape', username),
  fetchMojangSkinCape: (username) => ipcRenderer.invoke('fetch-mojang-skin-cape', username),
  fetchElybySkinCape: (username) => ipcRenderer.invoke('fetch-elyby-skin-cape', username),
  uploadLog: (logText) => ipcRenderer.invoke('upload-log', logText),
  exportProfile: (profileId) => ipcRenderer.invoke('export-profile', profileId),
  onPlaytimeUpdated: (callback) => ipcRenderer.on('playtime-updated', (event, data) => callback(data)),
  getLauncherConfig: () => ipcRenderer.invoke('get-launcher-config'),
  setLauncherConfig: (config) => ipcRenderer.invoke('set-launcher-config', config),
  selectAndInstallModpack: (progressCallback) => {
    const listener = (event, data) => progressCallback(data);
    ipcRenderer.on('modpack-install-progress', listener);
    return ipcRenderer.invoke('select-and-install-modpack').finally(() => {
      ipcRenderer.removeListener('modpack-install-progress', listener);
    });
  },
  getWorlds: (profileId) => ipcRenderer.invoke('get-worlds', profileId),
  deleteWorld: (profileId, folderName) => ipcRenderer.invoke('delete-world', { profileId, folderName }),
  backupWorld: (profileId, folderName, worldName) => ipcRenderer.invoke('backup-world', { profileId, folderName, worldName }),
  openSavesFolder: (profileId) => ipcRenderer.invoke('open-saves-folder', profileId),
  openWorldFolder: (profileId, folderName) => ipcRenderer.invoke('open-world-folder', { profileId, folderName }),
  getInstalledResourcePacks: (profileId) => ipcRenderer.invoke('get-installed-resourcepacks', profileId),
  deleteResourcePack: (profileId, filename) => ipcRenderer.invoke('delete-resourcepack', { profileId, filename }),
  downloadResourcePack: (profileId, packUrl, filename) => ipcRenderer.invoke('download-resourcepack', { profileId, packUrl, filename }),
  importResourcePack: (profileId) => ipcRenderer.invoke('import-resourcepack', profileId),
  openResourcePacksFolder: (profileId) => ipcRenderer.invoke('open-resourcepacks-folder', profileId),
  
  getServers: (profileId) => ipcRenderer.invoke('get-servers', profileId),
  saveServers: (profileId, serversList) => ipcRenderer.invoke('save-servers', { profileId, serversList }),
  pingServer: (host, port) => ipcRenderer.invoke('ping-server', { host, port }),
  
  getLocalServers: () => ipcRenderer.invoke('get-local-servers'),
  createLocalServer: (opts) => ipcRenderer.invoke('create-local-server', opts),
  startLocalServer: (name) => ipcRenderer.invoke('start-local-server', name),
  stopLocalServer: (name) => ipcRenderer.invoke('stop-local-server', name),
  sendServerCommand: (name, cmd) => ipcRenderer.invoke('send-server-command', { name, cmd }),
  deleteLocalServer: (name) => ipcRenderer.invoke('delete-local-server', name),
  openServerFolder: (name) => ipcRenderer.invoke('open-server-folder', name),
  
  onServerLog: (callback) => ipcRenderer.on('server-log', (event, data) => callback(data)),
  onServerStatus: (callback) => ipcRenderer.on('server-status', (event, data) => callback(data)),
  getSystemDiagnostics: () => ipcRenderer.invoke('get-system-diagnostics')
});
