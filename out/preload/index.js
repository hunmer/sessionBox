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
var injectBrowserAction = () => {
  const actionMap = /* @__PURE__ */ new Map();
  const observerCounts = /* @__PURE__ */ new Map();
  const internalEmitter = process;
  const invoke = (name, partition, ...args) => {
    return electron.ipcRenderer.invoke("crx-msg-remote", partition, name, ...args);
  };
  const __browserAction__ = {
    addEventListener(name, listener) {
      internalEmitter.addListener(`-actions-${name}`, listener);
    },
    removeEventListener(name, listener) {
      internalEmitter.removeListener(`-actions-${name}`, listener);
    },
    getAction(extensionId) {
      return actionMap.get(extensionId);
    },
    async getState(partition) {
      const state = await invoke("browserAction.getState", partition);
      for (const action of state.actions) {
        actionMap.set(action.id, action);
      }
      queueMicrotask(() => internalEmitter.emit("-actions-update", state));
      return state;
    },
    activate: (partition, details) => {
      return invoke("browserAction.activate", partition, details);
    },
    addObserver(partition) {
      let count = observerCounts.has(partition) ? observerCounts.get(partition) : 0;
      count = count + 1;
      observerCounts.set(partition, count);
      if (count === 1) {
        invoke("browserAction.addObserver", partition);
      }
    },
    removeObserver(partition) {
      let count = observerCounts.has(partition) ? observerCounts.get(partition) : 0;
      count = Math.max(count - 1, 0);
      observerCounts.set(partition, count);
      if (count === 0) {
        invoke("browserAction.removeObserver", partition);
        observerCounts.delete(partition);
      }
    }
  };
  electron.ipcRenderer.on("browserAction.update", () => {
    for (const partition of observerCounts.keys()) {
      __browserAction__.getState(partition);
    }
  });
  function mainWorldScript() {
    const DEFAULT_PARTITION = "_self";
    const browserAction = globalThis.browserAction || __browserAction__;
    class BrowserActionElement extends HTMLButtonElement {
      get id() {
        return this.getAttribute("id") || "";
      }
      set id(id) {
        this.setAttribute("id", id);
      }
      get tab() {
        const tabId = parseInt(this.getAttribute("tab") || "", 10);
        return typeof tabId === "number" && !isNaN(tabId) ? tabId : -1;
      }
      set tab(tab) {
        this.setAttribute("tab", `${tab}`);
      }
      get partition() {
        return this.getAttribute("partition");
      }
      set partition(partition) {
        if (partition) {
          this.setAttribute("partition", partition);
        } else {
          this.removeAttribute("partition");
        }
      }
      get alignment() {
        return this.getAttribute("alignment") || "";
      }
      set alignment(alignment) {
        this.setAttribute("alignment", alignment);
      }
      static get observedAttributes() {
        return ["id", "tab", "partition", "alignment"];
      }
      constructor() {
        super();
        this.addEventListener("click", this.onClick.bind(this));
        this.addEventListener("contextmenu", this.onContextMenu.bind(this));
      }
      connectedCallback() {
        if (this.isConnected) {
          this.update();
        }
      }
      disconnectedCallback() {
        if (this.updateId) {
          cancelAnimationFrame(this.updateId);
          this.updateId = void 0;
        }
        if (this.pendingIcon) {
          this.pendingIcon = void 0;
        }
      }
      attributeChangedCallback() {
        if (this.isConnected) {
          this.update();
        }
      }
      activate(event) {
        const rect = this.getBoundingClientRect();
        browserAction.activate(this.partition || DEFAULT_PARTITION, {
          eventType: event.type,
          extensionId: this.id,
          tabId: this.tab,
          alignment: this.alignment,
          anchorRect: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          }
        });
      }
      onClick(event) {
        this.activate(event);
      }
      onContextMenu(event) {
        event.stopImmediatePropagation();
        event.preventDefault();
        this.activate(event);
      }
      getBadge() {
        let badge = this.badge;
        if (!badge) {
          this.badge = badge = document.createElement("div");
          badge.className = "badge";
          badge.part = "badge";
          this.appendChild(badge);
        }
        return badge;
      }
      update() {
        if (this.updateId) return;
        this.updateId = requestAnimationFrame(this.updateCallback.bind(this));
      }
      updateIcon(info) {
        const iconSize = 32;
        const resizeType = 2;
        const searchParams = new URLSearchParams({
          tabId: `${this.tab}`,
          partition: `${this.partition || DEFAULT_PARTITION}`
        });
        if (info.iconModified) {
          searchParams.append("t", info.iconModified);
        }
        const iconUrl = `crx://extension-icon/${this.id}/${iconSize}/${resizeType}?${searchParams.toString()}`;
        const bgImage = `url(${iconUrl})`;
        if (this.pendingIcon) {
          this.pendingIcon.onload = this.pendingIcon.onerror = () => {
          };
          this.pendingIcon = void 0;
        }
        const img = this.pendingIcon = new Image();
        img.onerror = () => {
          if (this.isConnected) {
            this.classList.toggle("no-icon", true);
            if (this.title) {
              this.dataset.letter = this.title.charAt(0);
            }
            this.pendingIcon = void 0;
          }
        };
        img.onload = () => {
          if (this.isConnected) {
            this.classList.toggle("no-icon", false);
            this.style.backgroundImage = bgImage;
            this.pendingIcon = void 0;
          }
        };
        img.src = iconUrl;
      }
      updateCallback() {
        this.updateId = void 0;
        const action = browserAction.getAction(this.id);
        const activeTabId = this.tab;
        const tabInfo = activeTabId > -1 ? action.tabs[activeTabId] : {};
        const info = { ...tabInfo, ...action };
        this.title = typeof info.title === "string" ? info.title : "";
        this.updateIcon(info);
        if (info.text) {
          const badge = this.getBadge();
          badge.textContent = info.text;
          badge.style.color = "#fff";
          badge.style.backgroundColor = info.color;
        } else if (this.badge) {
          this.badge.remove();
          this.badge = void 0;
        }
      }
    }
    customElements.define("browser-action", BrowserActionElement, { extends: "button" });
    class BrowserActionListElement extends HTMLElement {
      constructor() {
        super();
        this.observing = false;
        this.fetchState = async () => {
          try {
            await browserAction.getState(this.partition || DEFAULT_PARTITION);
          } catch {
            console.error(
              `browser-action-list failed to update [tab: ${this.tab}, partition: '${this.partition}']`
            );
          }
        };
        this.update = (state) => {
          const tabId = typeof this.tab === "number" && this.tab >= 0 ? this.tab : state.activeTabId || -1;
          for (const action of state.actions) {
            let browserActionNode = this.shadowRoot?.querySelector(
              `[id=${action.id}]`
            );
            if (!browserActionNode) {
              const node = document.createElement("button", {
                is: "browser-action"
              });
              node.id = action.id;
              node.className = "action";
              node.alignment = this.alignment;
              node.part = "action";
              browserActionNode = node;
              this.shadowRoot?.appendChild(browserActionNode);
            }
            if (this.partition) browserActionNode.partition = this.partition;
            if (this.alignment) browserActionNode.alignment = this.alignment;
            browserActionNode.tab = tabId;
          }
          const actionNodes = Array.from(
            this.shadowRoot?.querySelectorAll(".action")
          );
          for (const actionNode of actionNodes) {
            if (!state.actions.some((action) => action.id === actionNode.id)) {
              actionNode.remove();
            }
          }
        };
        const shadowRoot = this.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = `
:host {
  display: flex;
  flex-direction: row;
  gap: 5px;
}

.action {
  width: 28px;
  height: 28px;
  background-color: transparent;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 70%;
  border: none;
  border-radius: 4px;
  padding: 0;
  position: relative;
  outline: none;
}

.action:hover {
  background-color: var(--browser-action-hover-bg, rgba(255, 255, 255, 0.3));
}

.action.no-icon::after {
  content: attr(data-letter);
  text-transform: uppercase;
  font-size: .7rem;
  background-color: #757575;
  color: white;
  border-radius: 4px;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80%;
  height: 80%;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
}

.badge {
  box-shadow: 0px 0px 1px 1px var(--browser-action-badge-outline, #444);
  box-sizing: border-box;
  max-width: 100%;
  height: 12px;
  padding: 0 2px;
  border-radius: 2px;
  position: absolute;
  bottom: 1px;
  right: 0;
  pointer-events: none;
  line-height: 1.5;
  font-size: 9px;
  font-weight: 400;
  overflow: hidden;
  white-space: nowrap;
}`;
        shadowRoot.appendChild(style);
      }
      get tab() {
        const tabId = parseInt(this.getAttribute("tab") || "", 10);
        return typeof tabId === "number" && !isNaN(tabId) ? tabId : null;
      }
      set tab(tab) {
        if (typeof tab === "number") {
          this.setAttribute("tab", `${tab}`);
        } else {
          this.removeAttribute("tab");
        }
      }
      get partition() {
        return this.getAttribute("partition");
      }
      set partition(partition) {
        if (partition) {
          this.setAttribute("partition", partition);
        } else {
          this.removeAttribute("partition");
        }
      }
      get alignment() {
        return this.getAttribute("alignment") || "";
      }
      set alignment(alignment) {
        this.setAttribute("alignment", alignment);
      }
      static get observedAttributes() {
        return ["tab", "partition", "alignment"];
      }
      connectedCallback() {
        if (this.isConnected) {
          this.startObserving();
          this.fetchState();
        }
      }
      disconnectedCallback() {
        this.stopObserving();
      }
      attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (this.isConnected) {
          this.fetchState();
        }
      }
      startObserving() {
        if (this.observing) return;
        browserAction.addEventListener("update", this.update);
        browserAction.addObserver(this.partition || DEFAULT_PARTITION);
        this.observing = true;
      }
      stopObserving() {
        if (!this.observing) return;
        browserAction.removeEventListener("update", this.update);
        browserAction.removeObserver(this.partition || DEFAULT_PARTITION);
        this.observing = false;
      }
    }
    customElements.define("browser-action-list", BrowserActionListElement);
  }
  if (process.contextIsolated) {
    electron.contextBridge.exposeInMainWorld("browserAction", __browserAction__);
    if ("executeInMainWorld" in electron.contextBridge) {
      electron.contextBridge.executeInMainWorld({
        func: mainWorldScript
      });
    } else {
      electron.webFrame.executeJavaScript(`(${mainWorldScript}());`);
    }
  } else {
    mainWorldScript();
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
  extension: {
    list: () => electron.ipcRenderer.invoke("extension:list"),
    select: () => electron.ipcRenderer.invoke("extension:select"),
    load: (extensionId) => electron.ipcRenderer.invoke("extension:load", extensionId),
    unload: (extensionId) => electron.ipcRenderer.invoke("extension:unload", extensionId),
    delete: (extensionId) => electron.ipcRenderer.invoke("extension:delete", extensionId),
    update: (id, data) => electron.ipcRenderer.invoke("extension:update", id, data),
    getLoaded: () => electron.ipcRenderer.invoke("extension:getLoaded")
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
injectBrowserAction();
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
