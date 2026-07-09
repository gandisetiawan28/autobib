const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    startServer: () => ipcRenderer.invoke('start-server'),
    stopServer: () => ipcRenderer.invoke('stop-server'),
    setupDependencies: () => ipcRenderer.invoke('setup-dependencies'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    loadConfig: () => ipcRenderer.invoke('load-config'),
    onLog: (callback) => ipcRenderer.on('log', (event, data) => callback(data)),
    onStatusChange: (callback) => ipcRenderer.on('status-change', (event, status) => callback(status))
});
