const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ---- 框架 & Token ----
    getInitialState: () => ipcRenderer.invoke('get-initial-state'),
    checkFramework: () => ipcRenderer.invoke('check-framework'),
    installFramework: () => ipcRenderer.invoke('install-framework'),
    onInstallProgress: (cb) => ipcRenderer.on('install-progress', (e, d) => cb(d)),
    setToken: (token) => ipcRenderer.invoke('set-token', token),
    getToken: () => ipcRenderer.invoke('get-token'),

    // ---- 角色管理 ----
    getRoles: () => ipcRenderer.invoke('get-roles'),
    saveRole: (params) => ipcRenderer.invoke('save-role', params),
    deleteRole: (id) => ipcRenderer.invoke('delete-role', id),

    // ---- 手动选择角色执行 ----
    runSelectedAgents: (params) => ipcRenderer.invoke('run-selected-agents', params),

    // ---- 进度监听 ----
    onChatProgress: (cb) => ipcRenderer.on('chat-progress', (e, d) => cb(d)),

    // ---- 模型管理 ----
    getModels: () => ipcRenderer.invoke('get-models'),
    addProvider: (params) => ipcRenderer.invoke('add-provider', params),
    removeProvider: (name) => ipcRenderer.invoke('remove-provider', name),

    // ---- 智能调度（保留） ----
    smartSchedule: (params) => ipcRenderer.invoke('smart-schedule', params),
});