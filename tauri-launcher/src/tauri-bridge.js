(function() {
  console.log('[TAURI-BRIDGE] Initializing Tauri WebView bridge...');
  if (typeof window !== 'undefined' && window.__TAURI__) {
    console.log('[TAURI-BRIDGE] Tauri detected! Exposing window.api');
    const { invoke } = window.__TAURI__.core;
    const { listen } = window.__TAURI__.event;

    // Helper to call backend sidecar commands
    async function fnCall(cmd, ...args) {
      try {
        return await invoke('call_backend', { cmd, args });
      } catch (err) {
        console.error(`[TAURI-BRIDGE] Error calling sidecar backend for ${cmd}:`, err);
        throw err;
      }
    }

    window.api = {
      minimizeWindow: () => invoke('minimize_window'),
      maximizeWindow: () => invoke('maximize_window'),
      closeWindow: () => invoke('close_window'),
      
      launchGame: (options) => fnCall('launch-game', options),
      cancelLaunch: () => fnCall('cancel-launch'),
      getWorldCount: (profileId) => fnCall('get-world-count', profileId),
      
      onLaunchProgress: (callback) => {
        listen('launch-progress', (event) => callback(event.payload));
      },
      onLaunchStatus: (callback) => {
        listen('launch-status', (event) => callback(event.payload));
      },
      onLaunchLog: (callback) => {
        listen('launch-log', (event) => callback(event.payload));
      },
      onLaunchError: (callback) => {
        listen('launch-error', (event) => callback(event.payload));
      },
      onMaximizedStatus: (callback) => {
        listen('window-maximized-status', (event) => callback(event.payload));
      },
      fetchMcVersions: () => fnCall('fetch-mc-versions'),
      downloadMod: (data) => fnCall('download-mod', data),
      getInstalledMods: (profileId) => fnCall('get-installed-mods', profileId),
      deleteMod: (data) => fnCall('delete-mod', data),
      openProfileFolder: (profileId) => fnCall('open-profile-folder', profileId),
      getStoragePath: () => fnCall('get-storage-path'),
      saveActiveSkinCape: (data) => fnCall('save-active-skin-cape', data),
      loadActiveSkinCape: (username) => fnCall('load-active-skin-cape', username),
      fetchMojangSkinCape: (username) => fnCall('fetch-mojang-skin-cape', username),
      fetchElybySkinCape: (username) => fnCall('fetch-elyby-skin-cape', username),
      uploadLog: (logText) => fnCall('upload-log', logText),
      exportProfile: (profileId) => fnCall('export-profile', profileId),
      onPlaytimeUpdated: (callback) => {
        listen('playtime-updated', (event) => callback(event.payload));
      },
      getLauncherConfig: () => fnCall('get-launcher-config'),
      setLauncherConfig: (config) => fnCall('set-launcher-config', config),
      
      selectAndInstallModpack: async (progressCallback) => {
        let unlistenFn = null;
        if (listen) {
          unlistenFn = await listen('modpack-install-progress', (event) => {
            progressCallback(event.payload);
          });
        }
        try {
          return await fnCall('select-and-install-modpack');
        } finally {
          if (unlistenFn) unlistenFn();
        }
      },
      
      getWorlds: (profileId) => fnCall('get-worlds', profileId),
      deleteWorld: (profileId, folderName) => fnCall('delete-world', { profileId, folderName }),
      backupWorld: (profileId, folderName, worldName) => fnCall('backup-world', { profileId, folderName, worldName }),
      openSavesFolder: (profileId) => fnCall('open-saves-folder', profileId),
      openWorldFolder: (profileId, folderName) => fnCall('open-world-folder', { profileId, folderName }),
      getInstalledResourcePacks: (profileId) => fnCall('get-installed-resourcepacks', profileId),
      deleteResourcePack: (profileId, filename) => fnCall('delete-resourcepack', { profileId, filename }),
      downloadResourcePack: (profileId, packUrl, filename) => fnCall('download-resourcepack', { profileId, packUrl, filename }),
      importResourcePack: (profileId) => fnCall('import-resourcepack', profileId),
      openResourcePacksFolder: (profileId) => fnCall('open-resourcepacks-folder', profileId),
      
      getServers: (profileId) => fnCall('get-servers', profileId),
      saveServers: (profileId, serversList) => fnCall('save-servers', { profileId, serversList }),
      pingServer: (host, port) => fnCall('ping-server', { host, port }),
      
      getLocalServers: () => fnCall('get-local-servers'),
      createLocalServer: (opts) => fnCall('create-local-server', opts),
      startLocalServer: (name) => fnCall('start-local-server', name),
      stopLocalServer: (name) => fnCall('stop-local-server', name),
      sendServerCommand: (name, cmd) => fnCall('send-server-command', { name, cmd }),
      deleteLocalServer: (name) => fnCall('delete-local-server', name),
      openServerFolder: (name) => fnCall('open-server-folder', name),
      
      onServerLog: (callback) => {
        listen('server-log', (event) => callback(event.payload));
      },
      onServerStatus: (callback) => {
        listen('server-status', (event) => callback(event.payload));
      },
      getSystemDiagnostics: () => fnCall('get-system-diagnostics')
    };
    console.log('[TAURI-BRIDGE] window.api successfully exposed!');
  } else {
    console.warn('[TAURI-BRIDGE] Tauri not detected. Not running inside a Tauri WebView.');
  }
})();
