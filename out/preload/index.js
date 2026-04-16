"use strict";
const electron = require("electron");
const electronAPI = {
  ipcRenderer: {
    send(channel, ...args) {
      electron.ipcRenderer.send(channel, ...args);
    },
    sendTo(webContentsId, channel, ...args) {
      const electronVer = process.versions.electron;
      const electronMajorVer = electronVer ? parseInt(electronVer.split(".")[0]) : 0;
      if (electronMajorVer >= 28) {
        throw new Error('"sendTo" method has been removed since Electron 28.');
      } else {
        electron.ipcRenderer.sendTo(webContentsId, channel, ...args);
      }
    },
    sendSync(channel, ...args) {
      return electron.ipcRenderer.sendSync(channel, ...args);
    },
    sendToHost(channel, ...args) {
      electron.ipcRenderer.sendToHost(channel, ...args);
    },
    postMessage(channel, message, transfer) {
      electron.ipcRenderer.postMessage(channel, message, transfer);
    },
    invoke(channel, ...args) {
      return electron.ipcRenderer.invoke(channel, ...args);
    },
    on(channel, listener) {
      electron.ipcRenderer.on(channel, listener);
      return () => {
        electron.ipcRenderer.removeListener(channel, listener);
      };
    },
    once(channel, listener) {
      electron.ipcRenderer.once(channel, listener);
      return () => {
        electron.ipcRenderer.removeListener(channel, listener);
      };
    },
    removeListener(channel, listener) {
      electron.ipcRenderer.removeListener(channel, listener);
      return this;
    },
    removeAllListeners(channel) {
      electron.ipcRenderer.removeAllListeners(channel);
    }
  },
  webFrame: {
    insertCSS(css) {
      return electron.webFrame.insertCSS(css);
    },
    setZoomFactor(factor) {
      if (typeof factor === "number" && factor > 0) {
        electron.webFrame.setZoomFactor(factor);
      }
    },
    setZoomLevel(level) {
      if (typeof level === "number") {
        electron.webFrame.setZoomLevel(level);
      }
    }
  },
  webUtils: {
    getPathForFile(file) {
      return electron.webUtils.getPathForFile(file);
    }
  },
  process: {
    get platform() {
      return process.platform;
    },
    get versions() {
      return process.versions;
    },
    get env() {
      return { ...process.env };
    }
  }
};
const api = {
  workspace: {
    list: () => electron.ipcRenderer.invoke("workspace:list"),
    create: (title, color) => electron.ipcRenderer.invoke("workspace:create", title, color),
    update: (id, data) => electron.ipcRenderer.invoke("workspace:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("workspace:delete", id),
    reorder: (workspaceIds) => electron.ipcRenderer.invoke("workspace:reorder", workspaceIds)
  },
  group: {
    list: () => electron.ipcRenderer.invoke("group:list"),
    create: (name, color, workspaceId, proxyId, icon) => electron.ipcRenderer.invoke("group:create", name, color, workspaceId, proxyId, icon),
    update: (id, data) => electron.ipcRenderer.invoke("group:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("group:delete", id),
    reorder: (groupIds) => electron.ipcRenderer.invoke("group:reorder", groupIds)
  },
  container: {
    list: () => electron.ipcRenderer.invoke("container:list"),
    create: (data) => electron.ipcRenderer.invoke("container:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("container:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("container:delete", id),
    reorder: (containerIds) => electron.ipcRenderer.invoke("container:reorder", containerIds),
    uploadIcon: () => electron.ipcRenderer.invoke("container:uploadIcon"),
    uploadIconFromUrl: (url) => electron.ipcRenderer.invoke("container:uploadIconFromUrl", url),
    createDesktopShortcut: (containerId) => electron.ipcRenderer.invoke("container:createDesktopShortcut", containerId)
  },
  page: {
    list: () => electron.ipcRenderer.invoke("page:list"),
    create: (data) => electron.ipcRenderer.invoke("page:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("page:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("page:delete", id),
    reorder: (pageIds) => electron.ipcRenderer.invoke("page:reorder", pageIds)
  },
  proxy: {
    list: () => electron.ipcRenderer.invoke("proxy:list"),
    create: (data) => electron.ipcRenderer.invoke("proxy:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("proxy:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("proxy:delete", id),
    test: (proxyId) => electron.ipcRenderer.invoke("proxy:test", proxyId),
    testConfig: (config) => electron.ipcRenderer.invoke("proxy:test-config", config)
  },
  tab: {
    list: () => electron.ipcRenderer.invoke("tab:list"),
    create: (pageId, url, containerId, workspaceId) => electron.ipcRenderer.invoke("tab:create", pageId, url, containerId, workspaceId),
    close: (tabId) => electron.ipcRenderer.invoke("tab:close", tabId),
    switch: (tabId) => electron.ipcRenderer.invoke("tab:switch", tabId),
    update: (tabId, data) => electron.ipcRenderer.invoke("tab:update", tabId, data),
    reorder: (tabIds) => electron.ipcRenderer.invoke("tab:reorder", tabIds),
    navigate: (tabId, url) => electron.ipcRenderer.invoke("tab:navigate", tabId, url),
    goBack: (tabId) => electron.ipcRenderer.invoke("tab:goBack", tabId),
    goForward: (tabId) => electron.ipcRenderer.invoke("tab:goForward", tabId),
    reload: (tabId) => electron.ipcRenderer.invoke("tab:reload", tabId),
    forceReload: (tabId) => electron.ipcRenderer.invoke("tab:forceReload", tabId),
    zoomIn: (tabId) => electron.ipcRenderer.invoke("tab:zoomIn", tabId),
    zoomOut: (tabId) => electron.ipcRenderer.invoke("tab:zoomOut", tabId),
    zoomReset: (tabId) => electron.ipcRenderer.invoke("tab:zoomReset", tabId),
    getZoomLevel: (tabId) => electron.ipcRenderer.invoke("tab:getZoomLevel", tabId),
    detectProxy: (tabId) => electron.ipcRenderer.invoke("tab:detect-proxy", tabId),
    setProxyEnabled: (tabId, enabled) => electron.ipcRenderer.invoke("tab:set-proxy-enabled", tabId, enabled),
    applyProxy: (tabId, proxyId) => electron.ipcRenderer.invoke("tab:apply-proxy", tabId, proxyId),
    openDevTools: (tabId) => electron.ipcRenderer.invoke("tab:openDevTools", tabId),
    setMuted: (tabId, muted) => electron.ipcRenderer.invoke("tab:set-muted", tabId, muted),
    openInNewWindow: (tabId) => electron.ipcRenderer.invoke("tab:open-in-new-window", tabId),
    openInBrowser: (tabId) => electron.ipcRenderer.invoke("tab:open-in-browser", tabId),
    capture: (tabIds) => electron.ipcRenderer.invoke("tab:capture", tabIds),
    updateBounds: (rect) => electron.ipcRenderer.send("tab:update-bounds", rect),
    setOverlayVisible: (visible) => electron.ipcRenderer.send("tab:set-overlay-visible", visible),
    restoreAll: () => electron.ipcRenderer.invoke("tab:restore-all"),
    saveAll: (tabs) => electron.ipcRenderer.invoke("tab:save-all", tabs)
  },
  bookmark: {
    list: (folderId) => electron.ipcRenderer.invoke("bookmark:list", folderId),
    create: (data) => electron.ipcRenderer.invoke("bookmark:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("bookmark:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("bookmark:delete", id),
    batchDelete: (ids) => electron.ipcRenderer.invoke("bookmark:batchDelete", ids),
    reorder: (ids) => electron.ipcRenderer.invoke("bookmark:reorder", ids),
    importOpenFile: () => electron.ipcRenderer.invoke("bookmark:importOpenFile"),
    exportSaveFile: (html) => electron.ipcRenderer.invoke("bookmark:exportSaveFile", html),
    batchCreate: (data) => electron.ipcRenderer.invoke("bookmark:batchCreate", data)
  },
  bookmarkFolder: {
    list: () => electron.ipcRenderer.invoke("bookmarkFolder:list"),
    create: (data) => electron.ipcRenderer.invoke("bookmarkFolder:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("bookmarkFolder:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("bookmarkFolder:delete", id),
    deleteEmpty: () => electron.ipcRenderer.invoke("bookmarkFolder:deleteEmpty"),
    reorder: (ids) => electron.ipcRenderer.invoke("bookmarkFolder:reorder", ids)
  },
  bookmarkCheck: {
    start: (config) => electron.ipcRenderer.invoke("bookmark:checkStart", config),
    cancel: (taskId) => electron.ipcRenderer.invoke("bookmark:checkCancel", taskId)
  },
  extension: {
    list: () => electron.ipcRenderer.invoke("extension:list"),
    select: () => electron.ipcRenderer.invoke("extension:select"),
    load: (extensionId) => electron.ipcRenderer.invoke("extension:load", extensionId),
    unload: (extensionId) => electron.ipcRenderer.invoke("extension:unload", extensionId),
    delete: (extensionId) => electron.ipcRenderer.invoke("extension:delete", extensionId),
    update: (id, data) => electron.ipcRenderer.invoke("extension:update", id, data),
    getLoaded: () => electron.ipcRenderer.invoke("extension:getLoaded"),
    openBrowserActionPopup: (containerId, extensionId, anchorRect) => electron.ipcRenderer.invoke("extension:openBrowserActionPopup", containerId, extensionId, anchorRect)
  },
  window: {
    minimize: () => electron.ipcRenderer.invoke("window:minimize"),
    maximize: () => electron.ipcRenderer.invoke("window:maximize"),
    close: () => electron.ipcRenderer.invoke("window:close"),
    isMaximized: () => electron.ipcRenderer.invoke("window:isMaximized"),
    toggleFullscreen: () => electron.ipcRenderer.invoke("window:toggleFullscreen")
  },
  settings: {
    getTabFreezeMinutes: () => electron.ipcRenderer.invoke("settings:getTabFreezeMinutes"),
    setTabFreezeMinutes: (minutes) => electron.ipcRenderer.invoke("settings:setTabFreezeMinutes", minutes),
    setDefaultBrowser: (enabled) => electron.ipcRenderer.invoke("settings:setDefaultBrowser", enabled),
    checkDefaultBrowser: () => electron.ipcRenderer.invoke("settings:checkDefaultBrowser"),
    getMinimizeOnClose: () => electron.ipcRenderer.invoke("settings:getMinimizeOnClose"),
    setMinimizeOnClose: (enabled) => electron.ipcRenderer.invoke("settings:setMinimizeOnClose", enabled),
    getDefaultContainerId: () => electron.ipcRenderer.invoke("settings:getDefaultContainerId"),
    setDefaultContainerId: (id) => electron.ipcRenderer.invoke("settings:setDefaultContainerId", id),
    getAskContainerOnOpen: () => electron.ipcRenderer.invoke("settings:getAskContainerOnOpen"),
    setAskContainerOnOpen: (enabled) => electron.ipcRenderer.invoke("settings:setAskContainerOnOpen", enabled),
    getDefaultWorkspaceId: () => electron.ipcRenderer.invoke("settings:getDefaultWorkspaceId"),
    setDefaultWorkspaceId: (id) => electron.ipcRenderer.invoke("settings:setDefaultWorkspaceId", id)
  },
  mutedSites: {
    list: () => electron.ipcRenderer.invoke("mutedSites:list"),
    set: (sites) => electron.ipcRenderer.invoke("mutedSites:set", sites),
    add: (hostname) => electron.ipcRenderer.invoke("mutedSites:add", hostname),
    remove: (hostname) => electron.ipcRenderer.invoke("mutedSites:remove", hostname)
  },
  password: {
    list: () => electron.ipcRenderer.invoke("password:list"),
    listBySite: (siteOrigin) => electron.ipcRenderer.invoke("password:listBySite", siteOrigin),
    create: (data) => electron.ipcRenderer.invoke("password:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("password:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("password:delete", id),
    clearAll: () => electron.ipcRenderer.invoke("password:clearAll"),
    importOpenFile: () => electron.ipcRenderer.invoke("password:importOpenFile"),
    exportSaveFile: (csv) => electron.ipcRenderer.invoke("password:exportSaveFile", csv)
  },
  theme: {
    importOpenFile: () => electron.ipcRenderer.invoke("theme:importOpenFile"),
    exportSaveFile: (json) => electron.ipcRenderer.invoke("theme:exportSaveFile", json)
  },
  openExternal: (url) => electron.ipcRenderer.invoke("openExternal", url),
  searchEngine: {
    list: () => electron.ipcRenderer.invoke("searchEngine:list"),
    set: (engines) => electron.ipcRenderer.invoke("searchEngine:set", engines),
    getDefault: () => electron.ipcRenderer.invoke("searchEngine:getDefault"),
    setDefault: (id) => electron.ipcRenderer.invoke("searchEngine:setDefault", id)
  },
  sniffer: {
    toggle: (tabId, enabled) => electron.ipcRenderer.invoke("sniffer:toggle", tabId, enabled),
    setDomainEnabled: (domain, enabled) => electron.ipcRenderer.invoke("sniffer:setDomainEnabled", domain, enabled),
    getDomainList: () => electron.ipcRenderer.invoke("sniffer:getDomainList"),
    clearResources: (tabId) => electron.ipcRenderer.invoke("sniffer:clearResources", tabId),
    getState: (tabId) => electron.ipcRenderer.invoke("sniffer:getState", tabId)
  },
  shortcut: {
    list: () => electron.ipcRenderer.invoke("shortcut:list"),
    update: (id, accelerator, isGlobal, enabled) => electron.ipcRenderer.invoke("shortcut:update", id, accelerator, isGlobal, enabled),
    toggle: (id, enabled) => electron.ipcRenderer.invoke("shortcut:toggle", id, enabled),
    clear: (id) => electron.ipcRenderer.invoke("shortcut:clear", id),
    reset: () => electron.ipcRenderer.invoke("shortcut:reset")
  },
  split: {
    updateMultiBounds: (paneBounds) => electron.ipcRenderer.send("split:update-multi-bounds", paneBounds),
    getState: (workspaceId) => electron.ipcRenderer.invoke("split:get-state", workspaceId),
    setState: (workspaceId, data) => electron.ipcRenderer.invoke("split:set-state", workspaceId, data),
    clearState: (workspaceId) => electron.ipcRenderer.invoke("split:clear-state", workspaceId),
    listSchemes: () => electron.ipcRenderer.invoke("split:list-schemes"),
    createScheme: (data) => electron.ipcRenderer.invoke("split:create-scheme", data),
    deleteScheme: (id) => electron.ipcRenderer.invoke("split:delete-scheme", id)
  },
  download: {
    checkConnection: () => electron.ipcRenderer.invoke("download:checkConnection"),
    getConfig: () => electron.ipcRenderer.invoke("download:getConfig"),
    updateConfig: (config) => electron.ipcRenderer.invoke("download:updateConfig", config),
    start: () => electron.ipcRenderer.invoke("download:start"),
    stop: () => electron.ipcRenderer.invoke("download:stop"),
    add: (url, options) => electron.ipcRenderer.invoke("download:add", url, options),
    pause: (gid) => electron.ipcRenderer.invoke("download:pause", gid),
    resume: (gid) => electron.ipcRenderer.invoke("download:resume", gid),
    remove: (gid) => electron.ipcRenderer.invoke("download:remove", gid),
    listActive: () => electron.ipcRenderer.invoke("download:listActive"),
    listWaiting: () => electron.ipcRenderer.invoke("download:listWaiting"),
    listStopped: () => electron.ipcRenderer.invoke("download:listStopped"),
    globalStat: () => electron.ipcRenderer.invoke("download:globalStat"),
    purge: () => electron.ipcRenderer.invoke("download:purge"),
    showInFolder: (filePath) => electron.ipcRenderer.invoke("download:showInFolder", filePath),
    getFilePath: (dir, filename) => electron.ipcRenderer.invoke("download:getFilePath", dir, filename),
    startDrag: (filePath) => electron.ipcRenderer.send("download:startDrag", filePath),
    openFile: (filePath) => electron.ipcRenderer.invoke("download:openFile", filePath),
    pickDirectory: (defaultPath) => electron.ipcRenderer.invoke("download:pickDirectory", defaultPath)
  },
  chat: {
    completions: (params) => electron.ipcRenderer.invoke("chat:completions", params),
    abort: (requestId) => electron.ipcRenderer.invoke("chat:abort", requestId)
  },
  aiProvider: {
    list: () => electron.ipcRenderer.invoke("ai-provider:list"),
    create: (data) => electron.ipcRenderer.invoke("ai-provider:create", data),
    update: (data) => electron.ipcRenderer.invoke("ai-provider:update", data),
    delete: (id) => electron.ipcRenderer.invoke("ai-provider:delete", id),
    test: (id) => electron.ipcRenderer.invoke("ai-provider:test", id)
  },
  browser: {
    click: (args) => electron.ipcRenderer.invoke("browser:click", args),
    type: (args) => electron.ipcRenderer.invoke("browser:type", args),
    scroll: (args) => electron.ipcRenderer.invoke("browser:scroll", args),
    select: (args) => electron.ipcRenderer.invoke("browser:select", args),
    hover: (args) => electron.ipcRenderer.invoke("browser:hover", args),
    getContent: (args) => electron.ipcRenderer.invoke("browser:get-content", args),
    getDom: (args) => electron.ipcRenderer.invoke("browser:get-dom", args),
    screenshot: (args) => electron.ipcRenderer.invoke("browser:screenshot", args)
  },
  plugin: {
    list: () => electron.ipcRenderer.invoke("plugin:list"),
    enable: (pluginId) => electron.ipcRenderer.invoke("plugin:enable", pluginId),
    disable: (pluginId) => electron.ipcRenderer.invoke("plugin:disable", pluginId),
    getView: (pluginId) => electron.ipcRenderer.invoke("plugin:get-view", pluginId),
    getIcon: (pluginId) => electron.ipcRenderer.invoke("plugin:get-icon", pluginId),
    importZip: () => electron.ipcRenderer.invoke("plugin:import-zip"),
    openFolder: () => electron.ipcRenderer.invoke("plugin:open-folder"),
    install: (url) => electron.ipcRenderer.invoke("plugin:install", url),
    uninstall: (pluginId) => electron.ipcRenderer.invoke("plugin:uninstall", pluginId)
  },
  // 自动更新
  updater: {
    check: () => electron.ipcRenderer.invoke("updater:check"),
    download: () => electron.ipcRenderer.invoke("updater:download"),
    install: (isSilent = false) => electron.ipcRenderer.invoke("updater:install", isSilent),
    getVersion: () => electron.ipcRenderer.invoke("updater:get-version"),
    getInfo: () => electron.ipcRenderer.invoke("updater:get-info"),
    // 更新源管理
    listSources: () => electron.ipcRenderer.invoke("updater:list-sources"),
    getActiveSource: () => electron.ipcRenderer.invoke("updater:get-active-source"),
    setActiveSource: (id) => electron.ipcRenderer.invoke("updater:set-active-source", id),
    addSource: (source) => electron.ipcRenderer.invoke("updater:add-source", source),
    removeSource: (id) => electron.ipcRenderer.invoke("updater:remove-source", id),
    updateSource: (id, data) => electron.ipcRenderer.invoke("updater:update-source", id, data),
    onChecking: (callback) => {
      const handler = () => callback();
      electron.ipcRenderer.on("update:checking", handler);
      return () => electron.ipcRenderer.removeListener("update:checking", handler);
    },
    onAvailable: (callback) => {
      const handler = (_e, info) => callback(info);
      electron.ipcRenderer.on("update:available", handler);
      return () => electron.ipcRenderer.removeListener("update:available", handler);
    },
    onNotAvailable: (callback) => {
      const handler = (_e, info) => callback(info);
      electron.ipcRenderer.on("update:not-available", handler);
      return () => electron.ipcRenderer.removeListener("update:not-available", handler);
    },
    onDownloadProgress: (callback) => {
      const handler = (_e, progress) => callback(progress);
      electron.ipcRenderer.on("update:download-progress", handler);
      return () => electron.ipcRenderer.removeListener("update:download-progress", handler);
    },
    onDownloaded: (callback) => {
      const handler = (_e, info) => callback(info);
      electron.ipcRenderer.on("update:downloaded", handler);
      return () => electron.ipcRenderer.removeListener("update:downloaded", handler);
    },
    onError: (callback) => {
      const handler = (_e, error) => callback(error);
      electron.ipcRenderer.on("update:error", handler);
      return () => electron.ipcRenderer.removeListener("update:error", handler);
    }
  },
  // 系统内存信息
  system: {
    memory: () => electron.ipcRenderer.invoke("system:memory")
  },
  // MCP Server
  mcp: {
    start: () => electron.ipcRenderer.invoke("mcp:start"),
    stop: () => electron.ipcRenderer.invoke("mcp:stop"),
    getStatus: () => electron.ipcRenderer.invoke("mcp:get-status")
  },
  // Skill 管理
  skill: {
    list: () => electron.ipcRenderer.invoke("skill:list"),
    search: (query) => electron.ipcRenderer.invoke("skill:search", query),
    read: (name) => electron.ipcRenderer.invoke("skill:read", name),
    write: (name, description, content) => electron.ipcRenderer.invoke("skill:write", name, description, content),
    delete: (name) => electron.ipcRenderer.invoke("skill:delete", name)
  },
  workflow: {
    list: (folderId) => electron.ipcRenderer.invoke("workflow:list", folderId),
    get: (id) => electron.ipcRenderer.invoke("workflow:get", id),
    create: (data) => electron.ipcRenderer.invoke("workflow:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("workflow:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("workflow:delete", id)
  },
  workflowFolder: {
    list: () => electron.ipcRenderer.invoke("workflowFolder:list"),
    create: (data) => electron.ipcRenderer.invoke("workflowFolder:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("workflowFolder:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("workflowFolder:delete", id)
  },
  executionLog: {
    list: (workflowId) => electron.ipcRenderer.invoke("executionLog:list", workflowId),
    save: (workflowId, log) => electron.ipcRenderer.invoke("executionLog:save", workflowId, log),
    delete: (workflowId, logId) => electron.ipcRenderer.invoke("executionLog:delete", workflowId, logId),
    clear: (workflowId) => electron.ipcRenderer.invoke("executionLog:clear", workflowId)
  },
  // 主进程 → 渲染进程事件监听
  on: (event, callback) => {
    const channel = `on:${event}`;
    const handler = (_e, ...args) => callback(...args);
    electron.ipcRenderer.on(channel, handler);
    return () => electron.ipcRenderer.removeListener(channel, handler);
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = electronAPI;
  window.api = api;
}
