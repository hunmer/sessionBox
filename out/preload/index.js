import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
// IPC API 定义
const api = {
    workspace: {
        list: () => ipcRenderer.invoke('workspace:list'),
        create: (title, color) => ipcRenderer.invoke('workspace:create', title, color),
        update: (id, data) => ipcRenderer.invoke('workspace:update', id, data),
        delete: (id) => ipcRenderer.invoke('workspace:delete', id),
        reorder: (workspaceIds) => ipcRenderer.invoke('workspace:reorder', workspaceIds)
    },
    group: {
        list: () => ipcRenderer.invoke('group:list'),
        create: (name, color, workspaceId, proxyId, icon) => ipcRenderer.invoke('group:create', name, color, workspaceId, proxyId, icon),
        update: (id, data) => ipcRenderer.invoke('group:update', id, data),
        delete: (id) => ipcRenderer.invoke('group:delete', id),
        reorder: (groupIds) => ipcRenderer.invoke('group:reorder', groupIds)
    },
    container: {
        list: () => ipcRenderer.invoke('container:list'),
        create: (data) => ipcRenderer.invoke('container:create', data),
        update: (id, data) => ipcRenderer.invoke('container:update', id, data),
        delete: (id) => ipcRenderer.invoke('container:delete', id),
        reorder: (containerIds) => ipcRenderer.invoke('container:reorder', containerIds),
        uploadIcon: () => ipcRenderer.invoke('container:uploadIcon'),
        uploadIconFromUrl: (url) => ipcRenderer.invoke('container:uploadIconFromUrl', url),
        createDesktopShortcut: (containerId) => ipcRenderer.invoke('container:createDesktopShortcut', containerId)
    },
    page: {
        list: () => ipcRenderer.invoke('page:list'),
        create: (data) => ipcRenderer.invoke('page:create', data),
        update: (id, data) => ipcRenderer.invoke('page:update', id, data),
        delete: (id) => ipcRenderer.invoke('page:delete', id),
        reorder: (pageIds) => ipcRenderer.invoke('page:reorder', pageIds)
    },
    proxy: {
        list: () => ipcRenderer.invoke('proxy:list'),
        create: (data) => ipcRenderer.invoke('proxy:create', data),
        update: (id, data) => ipcRenderer.invoke('proxy:update', id, data),
        delete: (id) => ipcRenderer.invoke('proxy:delete', id),
        test: (proxyId) => ipcRenderer.invoke('proxy:test', proxyId),
        testConfig: (config) => ipcRenderer.invoke('proxy:test-config', config)
    },
    tab: {
        list: () => ipcRenderer.invoke('tab:list'),
        create: (pageId, url, containerId, workspaceId) => ipcRenderer.invoke('tab:create', pageId, url, containerId, workspaceId),
        close: (tabId) => ipcRenderer.invoke('tab:close', tabId),
        switch: (tabId) => ipcRenderer.invoke('tab:switch', tabId),
        update: (tabId, data) => ipcRenderer.invoke('tab:update', tabId, data),
        reorder: (tabIds) => ipcRenderer.invoke('tab:reorder', tabIds),
        navigate: (tabId, url) => ipcRenderer.invoke('tab:navigate', tabId, url),
        goBack: (tabId) => ipcRenderer.invoke('tab:goBack', tabId),
        goForward: (tabId) => ipcRenderer.invoke('tab:goForward', tabId),
        reload: (tabId) => ipcRenderer.invoke('tab:reload', tabId),
        forceReload: (tabId) => ipcRenderer.invoke('tab:forceReload', tabId),
        zoomIn: (tabId) => ipcRenderer.invoke('tab:zoomIn', tabId),
        zoomOut: (tabId) => ipcRenderer.invoke('tab:zoomOut', tabId),
        zoomReset: (tabId) => ipcRenderer.invoke('tab:zoomReset', tabId),
        getZoomLevel: (tabId) => ipcRenderer.invoke('tab:getZoomLevel', tabId),
        detectProxy: (tabId) => ipcRenderer.invoke('tab:detect-proxy', tabId),
        setProxyEnabled: (tabId, enabled) => ipcRenderer.invoke('tab:set-proxy-enabled', tabId, enabled),
        applyProxy: (tabId, proxyId) => ipcRenderer.invoke('tab:apply-proxy', tabId, proxyId),
        openDevTools: (tabId) => ipcRenderer.invoke('tab:openDevTools', tabId),
        setMuted: (tabId, muted) => ipcRenderer.invoke('tab:set-muted', tabId, muted),
        openInNewWindow: (tabId) => ipcRenderer.invoke('tab:open-in-new-window', tabId),
        openInBrowser: (tabId) => ipcRenderer.invoke('tab:open-in-browser', tabId),
        capture: (tabIds) => ipcRenderer.invoke('tab:capture', tabIds),
        updateBounds: (rect) => ipcRenderer.send('tab:update-bounds', rect),
        setOverlayVisible: (visible) => ipcRenderer.send('tab:set-overlay-visible', visible),
        restoreAll: () => ipcRenderer.invoke('tab:restore-all'),
        saveAll: (tabs) => ipcRenderer.invoke('tab:save-all', tabs)
    },
    bookmark: {
        list: (folderId) => ipcRenderer.invoke('bookmark:list', folderId),
        create: (data) => ipcRenderer.invoke('bookmark:create', data),
        update: (id, data) => ipcRenderer.invoke('bookmark:update', id, data),
        delete: (id) => ipcRenderer.invoke('bookmark:delete', id),
        batchDelete: (ids) => ipcRenderer.invoke('bookmark:batchDelete', ids),
        reorder: (ids) => ipcRenderer.invoke('bookmark:reorder', ids),
        importOpenFile: () => ipcRenderer.invoke('bookmark:importOpenFile'),
        exportSaveFile: (html) => ipcRenderer.invoke('bookmark:exportSaveFile', html),
        batchCreate: (data) => ipcRenderer.invoke('bookmark:batchCreate', data)
    },
    bookmarkFolder: {
        list: () => ipcRenderer.invoke('bookmarkFolder:list'),
        create: (data) => ipcRenderer.invoke('bookmarkFolder:create', data),
        update: (id, data) => ipcRenderer.invoke('bookmarkFolder:update', id, data),
        delete: (id) => ipcRenderer.invoke('bookmarkFolder:delete', id),
        deleteEmpty: () => ipcRenderer.invoke('bookmarkFolder:deleteEmpty'),
        reorder: (ids) => ipcRenderer.invoke('bookmarkFolder:reorder', ids)
    },
    bookmarkCheck: {
        start: (config) => ipcRenderer.invoke('bookmark:checkStart', config),
        cancel: (taskId) => ipcRenderer.invoke('bookmark:checkCancel', taskId)
    },
    extension: {
        list: () => ipcRenderer.invoke('extension:list'),
        select: () => ipcRenderer.invoke('extension:select'),
        load: (extensionId) => ipcRenderer.invoke('extension:load', extensionId),
        unload: (extensionId) => ipcRenderer.invoke('extension:unload', extensionId),
        delete: (extensionId) => ipcRenderer.invoke('extension:delete', extensionId),
        update: (id, data) => ipcRenderer.invoke('extension:update', id, data),
        getLoaded: () => ipcRenderer.invoke('extension:getLoaded'),
        openBrowserActionPopup: (containerId, extensionId, anchorRect) => ipcRenderer.invoke('extension:openBrowserActionPopup', containerId, extensionId, anchorRect)
    },
    window: {
        minimize: () => ipcRenderer.invoke('window:minimize'),
        maximize: () => ipcRenderer.invoke('window:maximize'),
        close: () => ipcRenderer.invoke('window:close'),
        isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
        toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen')
    },
    settings: {
        getTabFreezeMinutes: () => ipcRenderer.invoke('settings:getTabFreezeMinutes'),
        setTabFreezeMinutes: (minutes) => ipcRenderer.invoke('settings:setTabFreezeMinutes', minutes),
        setDefaultBrowser: (enabled) => ipcRenderer.invoke('settings:setDefaultBrowser', enabled),
        checkDefaultBrowser: () => ipcRenderer.invoke('settings:checkDefaultBrowser'),
        getMinimizeOnClose: () => ipcRenderer.invoke('settings:getMinimizeOnClose'),
        setMinimizeOnClose: (enabled) => ipcRenderer.invoke('settings:setMinimizeOnClose', enabled),
        getDefaultContainerId: () => ipcRenderer.invoke('settings:getDefaultContainerId'),
        setDefaultContainerId: (id) => ipcRenderer.invoke('settings:setDefaultContainerId', id),
        getAskContainerOnOpen: () => ipcRenderer.invoke('settings:getAskContainerOnOpen'),
        setAskContainerOnOpen: (enabled) => ipcRenderer.invoke('settings:setAskContainerOnOpen', enabled),
        getDefaultWorkspaceId: () => ipcRenderer.invoke('settings:getDefaultWorkspaceId'),
        setDefaultWorkspaceId: (id) => ipcRenderer.invoke('settings:setDefaultWorkspaceId', id)
    },
    mutedSites: {
        list: () => ipcRenderer.invoke('mutedSites:list'),
        set: (sites) => ipcRenderer.invoke('mutedSites:set', sites),
        add: (hostname) => ipcRenderer.invoke('mutedSites:add', hostname),
        remove: (hostname) => ipcRenderer.invoke('mutedSites:remove', hostname)
    },
    password: {
        list: () => ipcRenderer.invoke('password:list'),
        listBySite: (siteOrigin) => ipcRenderer.invoke('password:listBySite', siteOrigin),
        create: (data) => ipcRenderer.invoke('password:create', data),
        update: (id, data) => ipcRenderer.invoke('password:update', id, data),
        delete: (id) => ipcRenderer.invoke('password:delete', id),
        clearAll: () => ipcRenderer.invoke('password:clearAll'),
        importOpenFile: () => ipcRenderer.invoke('password:importOpenFile'),
        exportSaveFile: (csv) => ipcRenderer.invoke('password:exportSaveFile', csv),
    },
    theme: {
        importOpenFile: () => ipcRenderer.invoke('theme:importOpenFile'),
        exportSaveFile: (json) => ipcRenderer.invoke('theme:exportSaveFile', json),
    },
    openExternal: (url) => ipcRenderer.invoke('openExternal', url),
    searchEngine: {
        list: () => ipcRenderer.invoke('searchEngine:list'),
        set: (engines) => ipcRenderer.invoke('searchEngine:set', engines),
        getDefault: () => ipcRenderer.invoke('searchEngine:getDefault'),
        setDefault: (id) => ipcRenderer.invoke('searchEngine:setDefault', id)
    },
    sniffer: {
        toggle: (tabId, enabled) => ipcRenderer.invoke('sniffer:toggle', tabId, enabled),
        setDomainEnabled: (domain, enabled) => ipcRenderer.invoke('sniffer:setDomainEnabled', domain, enabled),
        getDomainList: () => ipcRenderer.invoke('sniffer:getDomainList'),
        clearResources: (tabId) => ipcRenderer.invoke('sniffer:clearResources', tabId),
        getState: (tabId) => ipcRenderer.invoke('sniffer:getState', tabId),
    },
    shortcut: {
        list: () => ipcRenderer.invoke('shortcut:list'),
        update: (id, accelerator, isGlobal, enabled) => ipcRenderer.invoke('shortcut:update', id, accelerator, isGlobal, enabled),
        toggle: (id, enabled) => ipcRenderer.invoke('shortcut:toggle', id, enabled),
        clear: (id) => ipcRenderer.invoke('shortcut:clear', id),
        reset: () => ipcRenderer.invoke('shortcut:reset')
    },
    split: {
        updateMultiBounds: (paneBounds) => ipcRenderer.send('split:update-multi-bounds', paneBounds),
        getState: (workspaceId) => ipcRenderer.invoke('split:get-state', workspaceId),
        setState: (workspaceId, data) => ipcRenderer.invoke('split:set-state', workspaceId, data),
        clearState: (workspaceId) => ipcRenderer.invoke('split:clear-state', workspaceId),
        listSchemes: () => ipcRenderer.invoke('split:list-schemes'),
        createScheme: (data) => ipcRenderer.invoke('split:create-scheme', data),
        deleteScheme: (id) => ipcRenderer.invoke('split:delete-scheme', id)
    },
    download: {
        checkConnection: () => ipcRenderer.invoke('download:checkConnection'),
        getConfig: () => ipcRenderer.invoke('download:getConfig'),
        updateConfig: (config) => ipcRenderer.invoke('download:updateConfig', config),
        start: () => ipcRenderer.invoke('download:start'),
        stop: () => ipcRenderer.invoke('download:stop'),
        add: (url, options) => ipcRenderer.invoke('download:add', url, options),
        pause: (gid) => ipcRenderer.invoke('download:pause', gid),
        resume: (gid) => ipcRenderer.invoke('download:resume', gid),
        remove: (gid) => ipcRenderer.invoke('download:remove', gid),
        listActive: () => ipcRenderer.invoke('download:listActive'),
        listWaiting: () => ipcRenderer.invoke('download:listWaiting'),
        listStopped: () => ipcRenderer.invoke('download:listStopped'),
        globalStat: () => ipcRenderer.invoke('download:globalStat'),
        purge: () => ipcRenderer.invoke('download:purge'),
        showInFolder: (filePath) => ipcRenderer.invoke('download:showInFolder', filePath),
        getFilePath: (dir, filename) => ipcRenderer.invoke('download:getFilePath', dir, filename),
        startDrag: (filePath) => ipcRenderer.send('download:startDrag', filePath),
        openFile: (filePath) => ipcRenderer.invoke('download:openFile', filePath),
        pickDirectory: (defaultPath) => ipcRenderer.invoke('download:pickDirectory', defaultPath)
    },
    chat: {
        completions: (params) => ipcRenderer.invoke('chat:completions', params),
        abort: (requestId) => ipcRenderer.invoke('chat:abort', requestId),
    },
    workflowTool: {
        respond: (requestId, result) => ipcRenderer.invoke('workflow-tool:respond', requestId, result),
    },
    aiProvider: {
        list: () => ipcRenderer.invoke('ai-provider:list'),
        create: (data) => ipcRenderer.invoke('ai-provider:create', data),
        update: (data) => ipcRenderer.invoke('ai-provider:update', data),
        delete: (id) => ipcRenderer.invoke('ai-provider:delete', id),
        test: (id) => ipcRenderer.invoke('ai-provider:test', id),
    },
    browser: {
        click: (args) => ipcRenderer.invoke('browser:click', args),
        type: (args) => ipcRenderer.invoke('browser:type', args),
        scroll: (args) => ipcRenderer.invoke('browser:scroll', args),
        select: (args) => ipcRenderer.invoke('browser:select', args),
        hover: (args) => ipcRenderer.invoke('browser:hover', args),
        getContent: (args) => ipcRenderer.invoke('browser:get-content', args),
        getDom: (args) => ipcRenderer.invoke('browser:get-dom', args),
        screenshot: (args) => ipcRenderer.invoke('browser:screenshot', args),
    },
    plugin: {
        list: () => ipcRenderer.invoke('plugin:list'),
        enable: (pluginId) => ipcRenderer.invoke('plugin:enable', pluginId),
        disable: (pluginId) => ipcRenderer.invoke('plugin:disable', pluginId),
        getView: (pluginId) => ipcRenderer.invoke('plugin:get-view', pluginId),
        getIcon: (pluginId) => ipcRenderer.invoke('plugin:get-icon', pluginId),
        importZip: () => ipcRenderer.invoke('plugin:import-zip'),
        openFolder: () => ipcRenderer.invoke('plugin:open-folder'),
        install: (url) => ipcRenderer.invoke('plugin:install', url),
        uninstall: (pluginId) => ipcRenderer.invoke('plugin:uninstall', pluginId)
    },
    // 自动更新
    updater: {
        check: () => ipcRenderer.invoke('updater:check'),
        download: () => ipcRenderer.invoke('updater:download'),
        install: (isSilent = false) => ipcRenderer.invoke('updater:install', isSilent),
        getVersion: () => ipcRenderer.invoke('updater:get-version'),
        getInfo: () => ipcRenderer.invoke('updater:get-info'),
        // 更新源管理
        listSources: () => ipcRenderer.invoke('updater:list-sources'),
        getActiveSource: () => ipcRenderer.invoke('updater:get-active-source'),
        setActiveSource: (id) => ipcRenderer.invoke('updater:set-active-source', id),
        addSource: (source) => ipcRenderer.invoke('updater:add-source', source),
        removeSource: (id) => ipcRenderer.invoke('updater:remove-source', id),
        updateSource: (id, data) => ipcRenderer.invoke('updater:update-source', id, data),
        onChecking: (callback) => {
            const handler = () => callback();
            ipcRenderer.on('update:checking', handler);
            return () => ipcRenderer.removeListener('update:checking', handler);
        },
        onAvailable: (callback) => {
            const handler = (_e, info) => callback(info);
            ipcRenderer.on('update:available', handler);
            return () => ipcRenderer.removeListener('update:available', handler);
        },
        onNotAvailable: (callback) => {
            const handler = (_e, info) => callback(info);
            ipcRenderer.on('update:not-available', handler);
            return () => ipcRenderer.removeListener('update:not-available', handler);
        },
        onDownloadProgress: (callback) => {
            const handler = (_e, progress) => callback(progress);
            ipcRenderer.on('update:download-progress', handler);
            return () => ipcRenderer.removeListener('update:download-progress', handler);
        },
        onDownloaded: (callback) => {
            const handler = (_e, info) => callback(info);
            ipcRenderer.on('update:downloaded', handler);
            return () => ipcRenderer.removeListener('update:downloaded', handler);
        },
        onError: (callback) => {
            const handler = (_e, error) => callback(error);
            ipcRenderer.on('update:error', handler);
            return () => ipcRenderer.removeListener('update:error', handler);
        }
    },
    // 系统内存信息
    system: {
        memory: () => ipcRenderer.invoke('system:memory')
    },
    // MCP Server
    mcp: {
        start: () => ipcRenderer.invoke('mcp:start'),
        stop: () => ipcRenderer.invoke('mcp:stop'),
        getStatus: () => ipcRenderer.invoke('mcp:get-status')
    },
    // Workflow agent 工具执行
    agent: {
        execTool: (toolType, params) => ipcRenderer.invoke('agent:execTool', toolType, params),
    },
    // Skill 管理
    skill: {
        list: () => ipcRenderer.invoke('skill:list'),
        search: (query) => ipcRenderer.invoke('skill:search', query),
        read: (name) => ipcRenderer.invoke('skill:read', name),
        write: (name, description, content) => ipcRenderer.invoke('skill:write', name, description, content),
        delete: (name) => ipcRenderer.invoke('skill:delete', name),
    },
    workflow: {
        list: (folderId) => ipcRenderer.invoke('workflow:list', folderId),
        get: (id) => ipcRenderer.invoke('workflow:get', id),
        create: (data) => ipcRenderer.invoke('workflow:create', data),
        update: (id, data) => ipcRenderer.invoke('workflow:update', id, data),
        delete: (id) => ipcRenderer.invoke('workflow:delete', id),
        importOpenFile: () => ipcRenderer.invoke('workflow:importOpenFile'),
        exportSaveFile: (json) => ipcRenderer.invoke('workflow:exportSaveFile', json),
    },
    workflowFolder: {
        list: () => ipcRenderer.invoke('workflowFolder:list'),
        create: (data) => ipcRenderer.invoke('workflowFolder:create', data),
        update: (id, data) => ipcRenderer.invoke('workflowFolder:update', id, data),
        delete: (id) => ipcRenderer.invoke('workflowFolder:delete', id),
    },
    executionLog: {
        list: (workflowId) => ipcRenderer.invoke('executionLog:list', workflowId),
        save: (workflowId, log) => ipcRenderer.invoke('executionLog:save', workflowId, log),
        delete: (workflowId, logId) => ipcRenderer.invoke('executionLog:delete', workflowId, logId),
        clear: (workflowId) => ipcRenderer.invoke('executionLog:clear', workflowId),
    },
    workflowVersion: {
        list: (workflowId) => ipcRenderer.invoke('workflowVersion:list', workflowId),
        add: (workflowId, name, nodes, edges) => ipcRenderer.invoke('workflowVersion:add', workflowId, name, nodes, edges),
        get: (workflowId, versionId) => ipcRenderer.invoke('workflowVersion:get', workflowId, versionId),
        delete: (workflowId, versionId) => ipcRenderer.invoke('workflowVersion:delete', workflowId, versionId),
        clear: (workflowId) => ipcRenderer.invoke('workflowVersion:clear', workflowId),
        nextName: (workflowId) => ipcRenderer.invoke('workflowVersion:nextName', workflowId),
    },
    // 主进程 → 渲染进程事件监听
    on: (event, callback) => {
        const channel = `on:${event}`;
        const handler = (_e, ...args) => callback(...args);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    }
};
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI);
        contextBridge.exposeInMainWorld('api', api);
    }
    catch (error) {
        console.error(error);
    }
}
else {
    window.electron = electronAPI;
    window.api = api;
}
