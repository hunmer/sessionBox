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
  group: {
    list: () => electron.ipcRenderer.invoke("group:list"),
    create: (name, color) => electron.ipcRenderer.invoke("group:create", name, color),
    update: (id, data) => electron.ipcRenderer.invoke("group:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("group:delete", id),
    reorder: (groupIds) => electron.ipcRenderer.invoke("group:reorder", groupIds)
  },
  account: {
    list: () => electron.ipcRenderer.invoke("account:list"),
    create: (data) => electron.ipcRenderer.invoke("account:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("account:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("account:delete", id),
    reorder: (accountIds) => electron.ipcRenderer.invoke("account:reorder", accountIds),
    uploadIcon: () => electron.ipcRenderer.invoke("account:uploadIcon"),
    createDesktopShortcut: (accountId) => electron.ipcRenderer.invoke("account:createDesktopShortcut", accountId)
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
    create: (accountId, url) => electron.ipcRenderer.invoke("tab:create", accountId, url),
    close: (tabId) => electron.ipcRenderer.invoke("tab:close", tabId),
    switch: (tabId) => electron.ipcRenderer.invoke("tab:switch", tabId),
    update: (tabId, data) => electron.ipcRenderer.invoke("tab:update", tabId, data),
    reorder: (tabIds) => electron.ipcRenderer.invoke("tab:reorder", tabIds),
    navigate: (tabId, url) => electron.ipcRenderer.invoke("tab:navigate", tabId, url),
    goBack: (tabId) => electron.ipcRenderer.invoke("tab:goBack", tabId),
    goForward: (tabId) => electron.ipcRenderer.invoke("tab:goForward", tabId),
    reload: (tabId) => electron.ipcRenderer.invoke("tab:reload", tabId),
    openDevTools: (tabId) => electron.ipcRenderer.invoke("tab:openDevTools", tabId),
    openInNewWindow: (tabId) => electron.ipcRenderer.invoke("tab:open-in-new-window", tabId),
    openInBrowser: (tabId) => electron.ipcRenderer.invoke("tab:open-in-browser", tabId),
    updateBounds: (rect) => electron.ipcRenderer.send("tab:update-bounds", rect),
    setOverlayVisible: (visible) => electron.ipcRenderer.send("tab:set-overlay-visible", visible),
    restoreAll: () => electron.ipcRenderer.invoke("tab:restore-all"),
    saveAll: (tabs) => electron.ipcRenderer.invoke("tab:save-all", tabs)
  },
  favoriteSite: {
    list: () => electron.ipcRenderer.invoke("favoriteSite:list"),
    create: (data) => electron.ipcRenderer.invoke("favoriteSite:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("favoriteSite:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("favoriteSite:delete", id)
  },
  window: {
    minimize: () => electron.ipcRenderer.invoke("window:minimize"),
    maximize: () => electron.ipcRenderer.invoke("window:maximize"),
    close: () => electron.ipcRenderer.invoke("window:close"),
    isMaximized: () => electron.ipcRenderer.invoke("window:isMaximized")
  },
  openExternal: (url) => electron.ipcRenderer.invoke("openExternal", url),
  // 自动更新
  updater: {
    check: () => electron.ipcRenderer.invoke("updater:check"),
    download: () => electron.ipcRenderer.invoke("updater:download"),
    install: (isSilent = false) => electron.ipcRenderer.invoke("updater:install", isSilent),
    getVersion: () => electron.ipcRenderer.invoke("updater:get-version"),
    getInfo: () => electron.ipcRenderer.invoke("updater:get-info"),
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
