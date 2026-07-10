const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    startServer: () => ipcRenderer.invoke('start-server'),
    stopServer: () => ipcRenderer.invoke('stop-server'),
    setupDependencies: () => ipcRenderer.invoke('setup-dependencies'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    loadConfig: () => ipcRenderer.invoke('load-config'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    getVersion: () => ipcRenderer.invoke('get-version'),
    installUpdate: () => ipcRenderer.send('install-update'),
    onLog: (callback) => ipcRenderer.on('log', (event, data) => callback(data)),
    onStatusChange: (callback) => ipcRenderer.on('status-change', (event, status) => callback(status)),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, info) => callback(info)),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, progressObj) => callback(progressObj)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, info) => callback(info))
});
