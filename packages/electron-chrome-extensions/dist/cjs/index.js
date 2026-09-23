"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ElectronChromeExtensions: () => ElectronChromeExtensions,
  setSessionPartitionResolver: () => setSessionPartitionResolver
});
module.exports = __toCommonJS(index_exports);

// src/browser/index.ts
var import_electron13 = require("electron");
var import_node_events4 = require("node:events");
var import_node_path3 = __toESM(require("node:path"));
var import_node_fs5 = require("node:fs");
var import_node_module = require("node:module");

// src/browser/api/browser-action.ts
var import_electron3 = require("electron");

// src/browser/popup.ts
var import_node_events = require("node:events");
var import_electron2 = require("electron");

// src/browser/api/common.ts
var import_node_fs = require("node:fs");
var path = __toESM(require("node:path"));
var import_electron = require("electron");
var getExtensionManifest = (extension) => extension.manifest;
var getExtensionUrl = (extension, uri) => {
  try {
    return new URL(uri, extension.url).href;
  } catch {
  }
};
var validateExtensionUrl = (url, extension) => {
  try {
    url = new URL(url, extension.url).href;
  } catch (e) {
    throw new Error("Invalid URL");
  }
  if (url.startsWith("chrome:") || url.startsWith("javascript:")) {
    throw new Error("Invalid URL");
  }
  return url;
};
var resolveExtensionPath = (extension, uri, requestPath) => {
  const relativePath = path.join(requestPath || "/", uri);
  const resPath = path.join(extension.path, relativePath);
  if (!resPath.startsWith(extension.path)) return;
  return resPath;
};
var validateExtensionResource = async (extension, uri) => {
  const resPath = resolveExtensionPath(extension, uri);
  if (!resPath) return;
  try {
    await import_node_fs.promises.stat(resPath);
  } catch {
    return;
  }
  return resPath;
};
var matchSize = (imageSet, size, match) => {
  const first = parseInt(Object.keys(imageSet).pop(), 10);
  return imageSet[first];
};
var getIconPath = (extension, iconSize = 32, resizeType = 1 /* Up */) => {
  const manifest = getExtensionManifest(extension);
  const { icons } = manifest;
  const default_icon = (manifest.manifest_version === 3 ? manifest.action : manifest.browser_action)?.default_icon;
  if (typeof default_icon === "string") {
    const iconPath = default_icon;
    return iconPath;
  } else if (typeof default_icon === "object") {
    const iconPath = matchSize(default_icon, iconSize, resizeType);
    return iconPath;
  } else if (typeof icons === "object") {
    const iconPath = matchSize(icons, iconSize, resizeType);
    return iconPath;
  }
};
var getIconImage = (extension) => {
  const iconPath = getIconPath(extension);
  const iconAbsolutePath = iconPath && resolveExtensionPath(extension, iconPath);
  return iconAbsolutePath ? import_electron.nativeImage.createFromPath(iconAbsolutePath) : void 0;
};
var escapePattern = (pattern) => pattern.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
var matchesPattern = (pattern, url) => {
  if (pattern === "<all_urls>") return true;
  const match = pattern.match(/^(\*|http|https|file|ftp):\/\/([^/]*)(\/.*)$/);
  if (!match) return false;
  try {
    const [, scheme, hostPattern, pathPattern] = match;
    const parsed = new URL(url);
    const actualScheme = parsed.protocol.slice(0, -1);
    if (scheme === "*") {
      if (actualScheme !== "http" && actualScheme !== "https") return false;
    } else if (actualScheme !== scheme) {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    const host = hostPattern.toLowerCase();
    const hostMatches = host === "*" || host === hostname || host.startsWith("*.") && (hostname === host.slice(2) || hostname.endsWith(host.slice(1)));
    if (!hostMatches) return false;
    const path5 = parsed.pathname;
    const pathRegexp = new RegExp(`^${pathPattern.split("*").map(escapePattern).join(".*")}$`);
    return pathRegexp.test(path5);
  } catch {
    return false;
  }
};
var matchesTitlePattern = (pattern, title) => {
  const regexp = new RegExp(`^${pattern.split("*").map(escapePattern).join(".*")}$`);
  return title.match(regexp);
};
var getAllWindows = () => [...import_electron.BaseWindow.getAllWindows(), ...import_electron.BrowserWindow.getAllWindows()];

// src/browser/popup.ts
var import_debug = __toESM(require("debug"));
var d = (0, import_debug.default)("electron-chrome-extensions:popup");
var supportsPreferredSize = () => {
  const major = parseInt(process.versions.electron.split(".").shift() || "", 10);
  return major >= 12;
};
var _PopupView = class _PopupView extends import_node_events.EventEmitter {
  constructor(opts) {
    super();
    __publicField(this, "browserWindow");
    __publicField(this, "parent");
    __publicField(this, "extensionId");
    __publicField(this, "anchorRect");
    __publicField(this, "destroyed", false);
    __publicField(this, "hidden", true);
    __publicField(this, "alignment");
    __publicField(this, "initialSizeApplied", false);
    __publicField(this, "pendingPreferredSize");
    __publicField(this, "preferredSizeTimer");
    /** Preferred size changes are only received in Electron v12+ */
    __publicField(this, "usingPreferredSize", supportsPreferredSize());
    __publicField(this, "readyPromise");
    __publicField(this, "destroy", () => {
      if (this.destroyed) return;
      this.destroyed = true;
      if (this.preferredSizeTimer) {
        clearTimeout(this.preferredSizeTimer);
        this.preferredSizeTimer = void 0;
      }
      d(`destroying ${this.extensionId}`);
      if (this.parent) {
        if (!this.parent.isDestroyed()) {
          this.parent.off("closed", this.destroy);
        }
        this.parent = void 0;
      }
      if (this.browserWindow) {
        if (!this.browserWindow.isDestroyed()) {
          const { webContents: webContents2 } = this.browserWindow;
          if (!webContents2.isDestroyed() && webContents2.isDevToolsOpened()) {
            webContents2.closeDevTools();
          }
          this.browserWindow.off("closed", this.destroy);
          this.browserWindow.destroy();
        }
        this.browserWindow = void 0;
      }
    });
    __publicField(this, "maybeClose", () => {
      if (!this.browserWindow?.isDestroyed() && this.browserWindow?.webContents.isDevToolsOpened()) {
        d("preventing close due to DevTools being open");
        return;
      }
      if (!getAllWindows().some((win) => win.isFocused())) {
        d("preventing close due to focus residing outside of the app");
        return;
      }
      this.destroy();
    });
    __publicField(this, "updatePreferredSize", (event, size) => {
      d("updatePreferredSize", size);
      if (this.initialSizeApplied || this.destroyed) return;
      this.usingPreferredSize = true;
      this.pendingPreferredSize = size;
      if (this.preferredSizeTimer) clearTimeout(this.preferredSizeTimer);
      this.preferredSizeTimer = setTimeout(() => {
        this.preferredSizeTimer = void 0;
        if (this.destroyed || this.initialSizeApplied || !this.pendingPreferredSize) return;
        this.setSize(this.pendingPreferredSize);
        this.updatePosition();
        this.initialSizeApplied = true;
        this.pendingPreferredSize = void 0;
        if (this.hidden) this.show();
      }, 32);
    });
    this.parent = opts.parent;
    this.extensionId = opts.extensionId;
    this.anchorRect = opts.anchorRect;
    this.alignment = opts.alignment;
    this.browserWindow = new import_electron2.BrowserWindow({
      show: false,
      frame: false,
      parent: opts.parent,
      movable: false,
      maximizable: false,
      minimizable: false,
      // https://github.com/electron/electron/issues/47579
      fullscreenable: false,
      resizable: false,
      skipTaskbar: true,
      backgroundColor: "#ffffff",
      roundedCorners: false,
      webPreferences: {
        session: opts.session,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        enablePreferredSizeMode: true
      }
    });
    const untypedWebContents = this.browserWindow.webContents;
    untypedWebContents.on("preferred-size-changed", this.updatePreferredSize);
    this.browserWindow.webContents.on("devtools-closed", this.maybeClose);
    this.browserWindow.on("blur", this.maybeClose);
    this.browserWindow.on("closed", this.destroy);
    this.parent.once("closed", this.destroy);
    this.readyPromise = this.load(opts.url);
  }
  show() {
    this.hidden = false;
    this.browserWindow?.show();
  }
  async load(url) {
    const win = this.browserWindow;
    try {
      await win.webContents.loadURL(url);
    } catch (e) {
      console.error(e);
    }
    if (this.destroyed) return;
    if (this.usingPreferredSize) {
      this.setSize({ width: _PopupView.BOUNDS.minWidth, height: _PopupView.BOUNDS.minHeight });
    } else {
      this.setSize({ width: _PopupView.BOUNDS.maxWidth, height: _PopupView.BOUNDS.maxHeight });
      await new Promise((resolve2) => setTimeout(resolve2, 100));
      if (this.destroyed) return;
      await this.queryPreferredSize();
      if (this.destroyed) return;
      this.show();
    }
  }
  isDestroyed() {
    return this.destroyed;
  }
  /** Resolves when the popup finishes loading. */
  whenReady() {
    return this.readyPromise;
  }
  setSize(rect) {
    if (!this.browserWindow || !this.parent) return;
    const width = Math.floor(
      Math.min(_PopupView.BOUNDS.maxWidth, Math.max(rect.width || 0, _PopupView.BOUNDS.minWidth))
    );
    const height = Math.floor(
      Math.min(_PopupView.BOUNDS.maxHeight, Math.max(rect.height || 0, _PopupView.BOUNDS.minHeight))
    );
    const size = { width, height };
    d(`setSize`, size);
    this.emit("will-resize", size);
    this.browserWindow?.setBounds({
      ...this.browserWindow.getBounds(),
      ...size
    });
    this.emit("resized");
  }
  updatePosition() {
    if (!this.browserWindow || !this.parent) return;
    const winBounds = this.parent.getBounds();
    const winContentBounds = this.parent.getContentBounds();
    const nativeTitlebarHeight = winBounds.height - winContentBounds.height;
    const viewBounds = this.browserWindow.getBounds();
    let x = winBounds.x + this.anchorRect.x + this.anchorRect.width - viewBounds.width;
    let y = winBounds.y + nativeTitlebarHeight + this.anchorRect.y + this.anchorRect.height + _PopupView.POSITION_PADDING;
    if (this.alignment?.includes("right")) x = winBounds.x + this.anchorRect.x;
    if (this.alignment?.includes("top"))
      y = winBounds.y + nativeTitlebarHeight - viewBounds.height + this.anchorRect.y - _PopupView.POSITION_PADDING;
    x = Math.floor(x);
    y = Math.floor(y);
    const display = import_electron2.screen.getDisplayNearestPoint({ x, y });
    const workArea = display.workArea;
    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - viewBounds.width));
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - viewBounds.height));
    const position = { x, y };
    d(`updatePosition`, position);
    this.emit("will-move", position);
    this.browserWindow.setBounds({
      ...this.browserWindow.getBounds(),
      ...position
    });
    this.emit("moved");
  }
  /** Backwards compat for Electron <12 */
  async queryPreferredSize() {
    if (this.usingPreferredSize || this.destroyed) return;
    const rect = await this.browserWindow.webContents.executeJavaScript(
      `((${() => {
        const rect2 = document.body.getBoundingClientRect();
        return { width: rect2.width, height: rect2.height };
      }})())`
    );
    if (this.destroyed) return;
    this.setSize({ width: rect.width, height: rect.height });
    this.updatePosition();
  }
};
__publicField(_PopupView, "POSITION_PADDING", 5);
__publicField(_PopupView, "BOUNDS", {
  minWidth: 25,
  minHeight: 25,
  maxWidth: 800,
  maxHeight: 600
});
var PopupView = _PopupView;

// src/browser/api/browser-action.ts
var import_debug2 = __toESM(require("debug"));
var d2 = (0, import_debug2.default)("electron-chrome-extensions:browserAction");
if (!import_electron3.app.isReady()) {
  import_electron3.protocol.registerSchemesAsPrivileged([{ scheme: "crx", privileges: { bypassCSP: true } }]);
}
var getBrowserActionDefaults = (extension) => {
  const manifest = getExtensionManifest(extension);
  const browserAction = manifest.manifest_version === 3 ? manifest.action : manifest.manifest_version === 2 ? manifest.browser_action : void 0;
  if (typeof browserAction === "object") {
    const manifestAction = browserAction;
    const action = {};
    action.title = manifestAction.default_title || manifest.name;
    const iconPath = getIconPath(extension);
    if (iconPath) action.icon = { path: iconPath };
    if (manifestAction.default_popup) {
      action.popup = manifestAction.default_popup;
    }
    return action;
  }
};
var BrowserActionAPI = class {
  constructor(ctx) {
    this.ctx = ctx;
    __publicField(this, "actionMap", /* @__PURE__ */ new Map());
    __publicField(this, "popup");
    __publicField(this, "observers", /* @__PURE__ */ new Set());
    __publicField(this, "queuedUpdate", false);
    __publicField(this, "openPopup", (event, options) => {
      const window = typeof options?.windowId === "number" ? this.ctx.store.getWindowById(options.windowId) : this.ctx.store.getCurrentWindow();
      if (!window || window.isDestroyed()) {
        d2("openPopup: window %d destroyed", window?.id);
        return;
      }
      const activeTab = this.ctx.store.getActiveTabFromWindow(window);
      if (!activeTab) return;
      this.activateClick({
        eventType: "click",
        extensionId: event.extension.id,
        tabId: typeof options?.tabId === "number" ? options.tabId : activeTab.id,
        anchorRect: options?.anchorRect ?? (() => {
          const [width] = window.getSize();
          const anchorSize = 64;
          return { x: width - anchorSize, y: 0, width: anchorSize, height: anchorSize };
        })(),
        alignment: options?.alignment
      });
    });
    const handle = this.ctx.router.apiHandler();
    const getter = (propName) => ({ extension }, details = {}) => {
      const { tabId } = details;
      const action = this.getAction(extension.id);
      let result;
      if (tabId) {
        if (action.tabs[tabId]) {
          result = action.tabs[tabId][propName];
        } else {
          result = action[propName];
        }
      } else {
        result = action[propName];
      }
      return result;
    };
    const setDetails = ({ extension }, details, propName) => {
      const { tabId } = details;
      let value = details[propName];
      if (typeof value === "undefined" || value === null) {
        const defaults = getBrowserActionDefaults(extension);
        value = defaults ? defaults[propName] : value;
      }
      const valueObj = { [propName]: value };
      const action = this.getAction(extension.id);
      if (tabId) {
        const tabAction = action.tabs[tabId] || (action.tabs[tabId] = {});
        Object.assign(tabAction, valueObj);
      } else {
        Object.assign(action, valueObj);
      }
      this.onUpdate();
    };
    const setter = (propName) => (event, details) => setDetails(event, details, propName);
    const handleProp = (prop, key) => {
      handle(`browserAction.get${prop}`, getter(key));
      handle(`browserAction.set${prop}`, setter(key));
    };
    handleProp("BadgeBackgroundColor", "color");
    handleProp("BadgeText", "text");
    handleProp("Title", "title");
    handleProp("Popup", "popup");
    handle("browserAction.getUserSettings", () => {
      return { isOnToolbar: true };
    });
    handle(
      "browserAction.setIcon",
      (event, { tabId, ...details }) => {
        setDetails(event, { tabId, icon: details }, "icon");
        setDetails(event, { tabId, iconModified: Date.now() }, "iconModified");
      }
    );
    handle("browserAction.openPopup", this.openPopup);
    const preloadOpts = { allowRemote: true, extensionContext: false };
    handle("browserAction.getState", this.getState.bind(this), preloadOpts);
    handle("browserAction.activate", this.activate.bind(this), preloadOpts);
    handle(
      "browserAction.addObserver",
      (event) => {
        if (event.type != "frame") return;
        const observer = event.sender;
        this.observers.add(observer);
        observer.once?.("destroyed", () => {
          this.observers.delete(observer);
        });
      },
      preloadOpts
    );
    handle(
      "browserAction.removeObserver",
      (event) => {
        if (event.type != "frame") return;
        const { sender: observer } = event;
        this.observers.delete(observer);
      },
      preloadOpts
    );
    this.ctx.store.on("active-tab-changed", () => {
      this.onUpdate();
    });
    this.ctx.store.on("tab-removed", (tabId) => {
      for (const [, actionDetails] of this.actionMap) {
        if (actionDetails.tabs[tabId]) {
          delete actionDetails.tabs[tabId];
        }
      }
      this.onUpdate();
    });
    this.setupSession(this.ctx.session);
  }
  setupSession(session2) {
    const sessionExtensions = session2.extensions || session2;
    sessionExtensions.on("extension-loaded", (event, extension) => {
      this.processExtension(extension);
    });
    sessionExtensions.on("extension-unloaded", (event, extension) => {
      this.removeActions(extension.id);
    });
  }
  handleCRXRequest(request) {
    d2("%s", request.url);
    try {
      const url = new URL(request.url);
      const { hostname: requestType } = url;
      switch (requestType) {
        case "extension-icon": {
          const tabId = url.searchParams.get("tabId");
          const fragments = url.pathname.split("/");
          const extensionId = fragments[1];
          const imageSize = parseInt(fragments[2], 10);
          const resizeType = parseInt(fragments[3], 10) || 1 /* Up */;
          const sessionExtensions = this.ctx.session.extensions || this.ctx.session;
          const extension = sessionExtensions.getExtension(extensionId);
          let iconDetails;
          const action = this.actionMap.get(extensionId);
          if (action) {
            iconDetails = tabId && action.tabs[tabId]?.icon || action.icon;
          }
          let iconImage;
          if (extension && iconDetails) {
            if (typeof iconDetails.path === "string") {
              const iconAbsPath = resolveExtensionPath(extension, iconDetails.path);
              if (iconAbsPath) iconImage = import_electron3.nativeImage.createFromPath(iconAbsPath);
            } else if (typeof iconDetails.path === "object") {
              const imagePath = matchSize(iconDetails.path, imageSize, resizeType);
              const iconAbsPath = imagePath && resolveExtensionPath(extension, imagePath);
              if (iconAbsPath) iconImage = import_electron3.nativeImage.createFromPath(iconAbsPath);
            } else if (typeof iconDetails.imageData === "string") {
              iconImage = import_electron3.nativeImage.createFromDataURL(iconDetails.imageData);
            } else if (typeof iconDetails.imageData === "object") {
              const imageData = matchSize(iconDetails.imageData, imageSize, resizeType);
              iconImage = imageData ? import_electron3.nativeImage.createFromDataURL(imageData) : void 0;
            }
            if (iconImage?.isEmpty()) {
              d2("crx: icon image is empty", iconDetails);
            }
          }
          if (iconImage) {
            return new Response(iconImage.toPNG(), {
              status: 200,
              headers: {
                "Content-Type": "image/png"
              }
            });
          }
          d2("crx: no icon image for %s", extensionId);
          return new Response(null, { status: 400 });
        }
        default: {
          d2("crx: invalid request %s", requestType);
          return new Response(null, { status: 400 });
        }
      }
    } catch (e) {
      console.error(e);
      return new Response(null, { status: 500 });
    }
  }
  getAction(extensionId) {
    let action = this.actionMap.get(extensionId);
    if (!action) {
      action = { tabs: {} };
      this.actionMap.set(extensionId, action);
      this.onUpdate();
    }
    return action;
  }
  // TODO: Make private for v4 major release.
  removeActions(extensionId) {
    if (this.actionMap.has(extensionId)) {
      this.actionMap.delete(extensionId);
    }
    this.onUpdate();
  }
  getPopupUrl(extensionId, tabId) {
    const action = this.getAction(extensionId);
    const tabPopupValue = action.tabs[tabId]?.popup;
    const actionPopupValue = action.popup;
    let popupPath;
    if (typeof tabPopupValue !== "undefined") {
      popupPath = tabPopupValue;
    } else if (typeof actionPopupValue !== "undefined") {
      popupPath = actionPopupValue;
    }
    let url;
    try {
      url = popupPath && new URL(popupPath).href;
    } catch {
    }
    if (!url) {
      try {
        url = popupPath && new URL(popupPath, `chrome-extension://${extensionId}`).href;
      } catch {
      }
    }
    return url;
  }
  // TODO: Make private for v4 major release.
  processExtension(extension) {
    const defaultAction = getBrowserActionDefaults(extension);
    if (defaultAction) {
      const action = this.getAction(extension.id);
      Object.assign(action, defaultAction);
    }
  }
  getState() {
    const actions = Array.from(this.actionMap.entries()).map(([id, details]) => {
      const { icon, tabs, ...rest } = details;
      const tabsInfo = {};
      for (const tabId of Object.keys(tabs)) {
        const { icon: icon2, ...rest2 } = tabs[tabId];
        tabsInfo[tabId] = rest2;
      }
      return {
        id,
        tabs: tabsInfo,
        ...rest
      };
    });
    const activeTab = this.ctx.store.getActiveTabOfCurrentWindow();
    return { activeTabId: activeTab?.id, actions };
  }
  activate({ type, sender }, details) {
    if (type != "frame") return;
    const { eventType, extensionId, tabId } = details;
    d2(
      `activate [eventType: ${eventType}, extensionId: '${extensionId}', tabId: ${tabId}, senderId: ${sender?.id}]`
    );
    switch (eventType) {
      case "click":
        this.activateClick(details);
        break;
      case "contextmenu":
        this.activateContextMenu(details);
        break;
      default:
        console.debug(`Ignoring unknown browserAction.activate event '${eventType}'`);
    }
  }
  activateClick(details) {
    const { extensionId, tabId, anchorRect, alignment } = details;
    if (this.popup) {
      const toggleExtension = !this.popup.isDestroyed() && this.popup.extensionId === extensionId;
      this.popup.destroy();
      this.popup = void 0;
      if (toggleExtension) {
        d2("skipping activate to close popup");
        return;
      }
    }
    const tab = tabId >= 0 ? this.ctx.store.getTabById(tabId) : this.ctx.store.getActiveTabOfCurrentWindow();
    if (!tab) {
      throw new Error(`Unable to get active tab`);
    }
    const popupUrl = this.getPopupUrl(extensionId, tab.id);
    if (popupUrl) {
      const win = this.ctx.store.tabToWindow.get(tab);
      if (!win) {
        throw new Error("Unable to get BrowserWindow from active tab");
      }
      this.popup = new PopupView({
        extensionId,
        session: this.ctx.session,
        parent: win,
        url: popupUrl,
        anchorRect,
        alignment
      });
      d2(`opened popup: ${popupUrl}`);
      this.ctx.emit("browser-action-popup-created", this.popup);
    } else {
      d2(`dispatching onClicked for ${extensionId}`);
      const tabDetails = this.ctx.store.tabDetailsCache.get(tab.id);
      this.ctx.router.sendEvent(extensionId, "browserAction.onClicked", tabDetails);
    }
  }
  activateContextMenu(details) {
    const { extensionId, anchorRect } = details;
    const sessionExtensions = this.ctx.session.extensions || this.ctx.session;
    const extension = sessionExtensions.getExtension(extensionId);
    if (!extension) {
      throw new Error(`Unregistered extension '${extensionId}'`);
    }
    const manifest = getExtensionManifest(extension);
    const menu = new import_electron3.Menu();
    const append = (opts) => menu.append(new import_electron3.MenuItem(opts));
    const appendSeparator = () => menu.append(new import_electron3.MenuItem({ type: "separator" }));
    append({
      label: extension.name,
      click: () => {
        const homePageUrl = manifest.homepage_url || `https://chrome.google.com/webstore/detail/${extension.id}`;
        this.ctx.store.createTab({ url: homePageUrl });
      }
    });
    appendSeparator();
    const contextMenuItems = this.ctx.store.buildMenuItems(
      extensionId,
      "browser_action"
    );
    if (contextMenuItems.length > 0) {
      contextMenuItems.forEach((item) => menu.append(item));
      appendSeparator();
    }
    const optionsPage = manifest.options_page || manifest.options_ui?.page;
    const optionsPageUrl = optionsPage ? getExtensionUrl(extension, optionsPage) : void 0;
    append({
      label: "Options",
      enabled: typeof optionsPageUrl === "string",
      click: () => {
        this.ctx.store.createTab({ url: optionsPageUrl });
      }
    });
    if (process.env.NODE_ENV === "development" && process.env.DEBUG) {
      append({
        label: "Remove extension",
        click: () => {
          d2(`removing extension "${extension.name}" (${extension.id})`);
          sessionExtensions.removeExtension(extension.id);
        }
      });
    }
    menu.popup({
      x: Math.floor(anchorRect.x),
      y: Math.floor(anchorRect.y + anchorRect.height)
    });
  }
  onUpdate() {
    if (this.queuedUpdate) return;
    this.queuedUpdate = true;
    queueMicrotask(() => {
      this.queuedUpdate = false;
      if (this.observers.size === 0) return;
      d2(`dispatching update to ${this.observers.size} observer(s)`);
      Array.from(this.observers).forEach((observer) => {
        if (!observer.isDestroyed()) {
          observer.send?.("browserAction.update");
        }
      });
    });
  }
};

// src/browser/api/tabs.ts
var import_electron4 = require("electron");
var import_node_crypto = require("node:crypto");

// src/browser/api/windows.ts
var import_debug3 = __toESM(require("debug"));
var d3 = (0, import_debug3.default)("electron-chrome-extensions:windows");
var getWindowState = (win) => {
  if (win.isMaximized()) return "maximized";
  if (win.isMinimized()) return "minimized";
  if (win.isFullScreen()) return "fullscreen";
  return "normal";
};
var _WindowsAPI = class _WindowsAPI {
  constructor(ctx) {
    this.ctx = ctx;
    const handle = this.ctx.router.apiHandler();
    handle("windows.get", this.get.bind(this));
    handle("windows.getCurrent", this.getLastFocused.bind(this));
    handle("windows.getLastFocused", this.getLastFocused.bind(this));
    handle("windows.getAll", this.getAll.bind(this));
    handle("windows.create", this.create.bind(this));
    handle("windows.update", this.update.bind(this));
    handle("windows.remove", this.remove.bind(this));
    this.ctx.store.on("window-added", this.observeWindow.bind(this));
  }
  observeWindow(window) {
    const windowId = window.id;
    window.on("focus", () => {
      this.onFocusChanged(windowId);
    });
    window.on("resized", () => {
      this.onBoundsChanged(windowId);
    });
    window.once("closed", () => {
      this.ctx.store.windowDetailsCache.delete(windowId);
      this.ctx.store.removeWindow(window);
      this.onRemoved(windowId);
    });
    this.onCreated(windowId);
    d3(`Observing window[${windowId}]`);
  }
  createWindowDetails(win) {
    const details = {
      id: win.id,
      focused: win.isFocused(),
      top: win.getPosition()[1],
      left: win.getPosition()[0],
      width: win.getSize()[0],
      height: win.getSize()[1],
      tabs: Array.from(this.ctx.store.tabs).filter((tab) => {
        const ownerWindow = this.ctx.store.tabToWindow.get(tab);
        return ownerWindow?.isDestroyed() ? false : ownerWindow?.id === win.id;
      }).map((tab) => this.ctx.store.tabDetailsCache.get(tab.id)).filter(Boolean),
      incognito: !this.ctx.session.isPersistent(),
      type: "normal",
      // TODO
      state: getWindowState(win),
      alwaysOnTop: win.isAlwaysOnTop(),
      sessionId: "default"
      // TODO
    };
    this.ctx.store.windowDetailsCache.set(win.id, details);
    return details;
  }
  getWindowDetails(win) {
    if (this.ctx.store.windowDetailsCache.has(win.id)) {
      return this.ctx.store.windowDetailsCache.get(win.id);
    }
    const details = this.createWindowDetails(win);
    return details;
  }
  getWindowFromId(id) {
    if (id === _WindowsAPI.WINDOW_ID_CURRENT) {
      return this.ctx.store.getCurrentWindow();
    } else {
      return this.ctx.store.getWindowById(id);
    }
  }
  get(event, windowId) {
    const win = this.getWindowFromId(windowId);
    if (!win) return { id: _WindowsAPI.WINDOW_ID_NONE };
    return this.getWindowDetails(win);
  }
  getLastFocused(event) {
    const win = this.ctx.store.getLastFocusedWindow();
    return win ? this.getWindowDetails(win) : null;
  }
  getAll(event) {
    return Array.from(this.ctx.store.windows).map(this.getWindowDetails.bind(this));
  }
  async create(event, details) {
    if (details.url) {
      const urls = Array.isArray(details.url) ? details.url : [details.url];
      const resolved = urls.map((u) => validateExtensionUrl(u, event.extension));
      details = { ...details, url: Array.isArray(details.url) ? resolved : resolved[0] };
    }
    const win = await this.ctx.store.createWindow(event, details);
    return this.getWindowDetails(win);
  }
  async update(event, windowId, updateProperties = {}) {
    const win = this.getWindowFromId(windowId);
    if (!win) return;
    const props = updateProperties;
    if (props.state) {
      switch (props.state) {
        case "maximized":
          win.maximize();
          break;
        case "minimized":
          win.minimize();
          break;
        case "normal": {
          if (win.isMinimized() || win.isMaximized()) {
            win.restore();
          }
          break;
        }
      }
    }
    return this.createWindowDetails(win);
  }
  async remove(event, windowId = _WindowsAPI.WINDOW_ID_CURRENT) {
    const win = this.getWindowFromId(windowId);
    if (!win) return;
    const removedWindowId = win.id;
    await this.ctx.store.removeWindow(win);
    this.onRemoved(removedWindowId);
  }
  onCreated(windowId) {
    const window = this.ctx.store.getWindowById(windowId);
    if (!window) return;
    const windowDetails = this.getWindowDetails(window);
    this.ctx.router.broadcastEvent("windows.onCreated", windowDetails);
  }
  onRemoved(windowId) {
    this.ctx.router.broadcastEvent("windows.onRemoved", windowId);
  }
  onFocusChanged(windowId) {
    if (this.ctx.store.lastFocusedWindowId === windowId) return;
    this.ctx.store.lastFocusedWindowId = windowId;
    this.ctx.router.broadcastEvent("windows.onFocusChanged", windowId);
  }
  onBoundsChanged(windowId) {
    const window = this.ctx.store.getWindowById(windowId);
    if (!window) return;
    const windowDetails = this.createWindowDetails(window);
    this.ctx.router.broadcastEvent("windows.onBoundsChanged", windowDetails);
  }
};
__publicField(_WindowsAPI, "WINDOW_ID_NONE", -1);
__publicField(_WindowsAPI, "WINDOW_ID_CURRENT", -2);
var WindowsAPI = _WindowsAPI;

// src/browser/api/tabs.ts
var import_debug4 = __toESM(require("debug"));
var d4 = (0, import_debug4.default)("electron-chrome-extensions:tabs");
var _TabsAPI = class _TabsAPI {
  constructor(ctx) {
    this.ctx = ctx;
    __publicField(this, "pendingMessages", /* @__PURE__ */ new Map());
    __publicField(this, "sendMessage", async (event, tabId, message) => {
      const tab = this.ctx.store.getTabById(tabId);
      if (!tab || tab.isDestroyed()) return void 0;
      const requestId = (0, import_node_crypto.randomUUID)();
      return await new Promise((resolve2) => {
        const timer = setTimeout(() => {
          this.pendingMessages.delete(requestId);
          resolve2(void 0);
        }, 1e3);
        this.pendingMessages.set(requestId, (response) => {
          clearTimeout(timer);
          resolve2(response);
        });
        tab.send("crx-user-scripts:tabs-message", {
          requestId,
          message,
          sender: {
            id: event.extension.id,
            url: event.sender?.getURL?.() ?? ""
          }
        });
      });
    });
    const handle = this.ctx.router.apiHandler();
    handle("tabs.get", this.get.bind(this));
    handle("tabs.getAllInWindow", this.getAllInWindow.bind(this));
    handle("tabs.getCurrent", this.getCurrent.bind(this));
    handle("tabs.sendMessage", this.sendMessage);
    handle("tabs.create", this.create.bind(this));
    handle("tabs.insertCSS", this.insertCSS.bind(this));
    handle("tabs.query", this.query.bind(this));
    handle("tabs.reload", this.reload.bind(this));
    handle("tabs.update", this.update.bind(this));
    handle("tabs.remove", this.remove.bind(this));
    handle("tabs.goForward", this.goForward.bind(this));
    handle("tabs.goBack", this.goBack.bind(this));
    this.ctx.store.on("tab-added", this.observeTab.bind(this));
    import_electron4.ipcMain.on("crx-tabs-message-response", (_event, details) => {
      if (!details?.requestId) return;
      const resolve2 = this.pendingMessages.get(details.requestId);
      if (!resolve2) return;
      this.pendingMessages.delete(details.requestId);
      resolve2(details.response);
    });
  }
  observeTab(tab) {
    const tabId = tab.id;
    const updateEvents = [
      "page-title-updated",
      // title
      "did-start-loading",
      // status
      "did-stop-loading",
      // status
      "media-started-playing",
      // audible
      "media-paused",
      // audible
      "did-start-navigation",
      // url
      "did-redirect-navigation",
      // url
      "did-navigate-in-page",
      // url
      // Listen for 'tab-updated' to handle all other cases which don't have
      // an official Electron API such as discarded tabs. App developers can
      // emit this event to trigger chrome.tabs.onUpdated if a property has
      // changed.
      "tab-updated"
    ];
    const updateHandler = () => {
      this.onUpdated(tabId);
    };
    updateEvents.forEach((eventName) => {
      tab.on(eventName, updateHandler);
    });
    const faviconHandler = (event, favicons) => {
      ;
      tab.favicon = favicons[0];
      this.onUpdated(tabId);
    };
    tab.on("page-favicon-updated", faviconHandler);
    tab.once("destroyed", () => {
      updateEvents.forEach((eventName) => {
        tab.off(eventName, updateHandler);
      });
      tab.off("page-favicon-updated", faviconHandler);
      this.ctx.store.removeTab(tab);
      this.onRemoved(tabId);
    });
    this.onCreated(tabId);
    this.onActivated(tabId);
    d4(`Observing tab[${tabId}][${tab.getType()}] ${tab.getURL()}`);
  }
  createTabDetails(tab) {
    const tabId = tab.id;
    const activeTab = this.ctx.store.getActiveTabFromWebContents(tab);
    let win = this.ctx.store.tabToWindow.get(tab);
    if (win?.isDestroyed()) win = void 0;
    const [width = 0, height = 0] = win ? win.getSize() : [];
    const details = {
      active: activeTab?.id === tabId,
      audible: tab.isCurrentlyAudible(),
      autoDiscardable: true,
      discarded: false,
      favIconUrl: tab.favicon || void 0,
      frozen: false,
      height,
      highlighted: false,
      id: tabId,
      incognito: false,
      index: -1,
      // TODO
      groupId: -1,
      // TODO(mv3): implement?
      mutedInfo: { muted: tab.audioMuted },
      pinned: false,
      selected: true,
      status: tab.isLoading() ? "loading" : "complete",
      title: tab.getTitle(),
      url: tab.getURL(),
      // TODO: tab.mainFrame.url (Electron 12)
      width,
      windowId: win ? win.id : -1
    };
    if (typeof this.ctx.store.impl.assignTabDetails === "function") {
      this.ctx.store.impl.assignTabDetails(details, tab);
    }
    this.ctx.store.tabDetailsCache.set(tab.id, details);
    return details;
  }
  getTabDetails(tab) {
    if (this.ctx.store.tabDetailsCache.has(tab.id)) {
      return this.ctx.store.tabDetailsCache.get(tab.id);
    }
    const details = this.createTabDetails(tab);
    return details;
  }
  get(event, tabId) {
    const tab = this.ctx.store.getTabById(tabId);
    if (!tab) return { id: _TabsAPI.TAB_ID_NONE };
    return this.getTabDetails(tab);
  }
  getAllInWindow(event, windowId = _TabsAPI.WINDOW_ID_CURRENT) {
    if (windowId === _TabsAPI.WINDOW_ID_CURRENT) windowId = this.ctx.store.lastFocusedWindowId;
    const tabs = Array.from(this.ctx.store.tabs).filter((tab) => {
      if (tab.isDestroyed()) return false;
      const browserWindow = this.ctx.store.tabToWindow.get(tab);
      if (!browserWindow || browserWindow.isDestroyed()) return;
      return browserWindow.id === windowId;
    });
    return tabs.map(this.getTabDetails.bind(this));
  }
  getCurrent(event) {
    const tab = this.ctx.store.getActiveTabOfCurrentWindow();
    return tab ? this.getTabDetails(tab) : void 0;
  }
  async create(event, details = {}) {
    const url = details.url ? validateExtensionUrl(details.url, event.extension) : void 0;
    const tab = await this.ctx.store.createTab({ ...details, url });
    const tabDetails = this.getTabDetails(tab);
    if (details.active) {
      queueMicrotask(() => this.onActivated(tab.id));
    }
    return tabDetails;
  }
  insertCSS(event, tabId, details) {
    const tab = this.ctx.store.getTabById(tabId);
    if (!tab) return;
    if (details.code) {
      tab.insertCSS(details.code);
    }
  }
  query(event, info = {}) {
    const isSet = (value) => typeof value !== "undefined";
    const filteredTabs = Array.from(this.ctx.store.tabs).map(this.getTabDetails.bind(this)).filter((tab) => {
      if (!tab) return false;
      if (isSet(info.active) && info.active !== tab.active) return false;
      if (isSet(info.pinned) && info.pinned !== tab.pinned) return false;
      if (isSet(info.audible) && info.audible !== tab.audible) return false;
      if (isSet(info.muted) && info.muted !== tab.mutedInfo?.muted) return false;
      if (isSet(info.highlighted) && info.highlighted !== tab.highlighted) return false;
      if (isSet(info.discarded) && info.discarded !== tab.discarded) return false;
      if (isSet(info.autoDiscardable) && info.autoDiscardable !== tab.autoDiscardable)
        return false;
      if (isSet(info.frozen) && info.frozen !== tab.frozen) return false;
      if (isSet(info.groupId) && info.groupId !== tab.groupId) return false;
      if (isSet(info.status) && info.status !== tab.status) return false;
      if (isSet(info.title) && typeof info.title === "string" && typeof tab.title === "string") {
        if (!matchesTitlePattern(info.title, tab.title)) return false;
      }
      if (isSet(info.url) && typeof tab.url === "string") {
        if (typeof info.url === "string" && !matchesPattern(info.url, tab.url)) {
          return false;
        } else if (Array.isArray(info.url) && !info.url.some((pattern) => matchesPattern(pattern, tab.url))) {
          return false;
        }
      }
      if (isSet(info.windowId)) {
        if (info.windowId === _TabsAPI.WINDOW_ID_CURRENT) {
          if (this.ctx.store.lastFocusedWindowId !== tab.windowId) return false;
        } else if (info.windowId !== tab.windowId) {
          return false;
        }
      }
      return true;
    }).map((tab, index) => {
      if (tab) {
        tab.index = index;
      }
      return tab;
    });
    return filteredTabs;
  }
  reload(event, arg1, arg2) {
    const tabId = typeof arg1 === "number" ? arg1 : void 0;
    const reloadProperties = typeof arg1 === "object" ? arg1 : typeof arg2 === "object" ? arg2 : {};
    const tab = tabId ? this.ctx.store.getTabById(tabId) : this.ctx.store.getActiveTabOfCurrentWindow();
    if (!tab) return;
    if (reloadProperties?.bypassCache) {
      tab.reloadIgnoringCache();
    } else {
      tab.reload();
    }
  }
  async update(event, arg1, arg2) {
    let tabId = typeof arg1 === "number" ? arg1 : void 0;
    const updateProperties = (typeof arg1 === "object" ? arg1 : arg2) || {};
    const tab = tabId ? this.ctx.store.getTabById(tabId) : this.ctx.store.getActiveTabOfCurrentWindow();
    if (!tab) return;
    tabId = tab.id;
    const props = updateProperties;
    const url = props.url ? validateExtensionUrl(props.url, event.extension) : void 0;
    if (url) await tab.loadURL(url);
    if (typeof props.muted === "boolean") tab.setAudioMuted(props.muted);
    if (props.active) this.onActivated(tabId);
    this.onUpdated(tabId);
    return this.createTabDetails(tab);
  }
  remove(event, id) {
    const ids = Array.isArray(id) ? id : [id];
    ids.forEach((tabId) => {
      const tab = this.ctx.store.getTabById(tabId);
      if (tab) this.ctx.store.removeTab(tab);
      this.onRemoved(tabId);
    });
  }
  goForward(event, arg1) {
    const tabId = typeof arg1 === "number" ? arg1 : void 0;
    const tab = tabId ? this.ctx.store.getTabById(tabId) : this.ctx.store.getActiveTabOfCurrentWindow();
    if (!tab) return;
    tab.navigationHistory.goForward();
  }
  goBack(event, arg1) {
    const tabId = typeof arg1 === "number" ? arg1 : void 0;
    const tab = tabId ? this.ctx.store.getTabById(tabId) : this.ctx.store.getActiveTabOfCurrentWindow();
    if (!tab) return;
    tab.navigationHistory.goBack();
  }
  onCreated(tabId) {
    const tab = this.ctx.store.getTabById(tabId);
    if (!tab) return;
    const tabDetails = this.getTabDetails(tab);
    this.ctx.router.broadcastEvent("tabs.onCreated", tabDetails);
  }
  onUpdated(tabId) {
    const tab = this.ctx.store.getTabById(tabId);
    if (!tab) return;
    let prevDetails;
    if (this.ctx.store.tabDetailsCache.has(tab.id)) {
      prevDetails = this.ctx.store.tabDetailsCache.get(tab.id);
    }
    if (!prevDetails) return;
    const details = this.createTabDetails(tab);
    const compareProps = [
      "audible",
      "autoDiscardable",
      "discarded",
      "favIconUrl",
      "frozen",
      "groupId",
      "pinned",
      "status",
      "title",
      "url"
    ];
    let didUpdate = false;
    const changeInfo = {};
    for (const prop of compareProps) {
      if (details[prop] !== prevDetails[prop]) {
        ;
        changeInfo[prop] = details[prop];
        didUpdate = true;
      }
    }
    if (details.mutedInfo?.muted !== prevDetails.mutedInfo?.muted) {
      changeInfo.mutedInfo = details.mutedInfo;
      didUpdate = true;
    }
    if (!didUpdate) return;
    this.ctx.router.broadcastEvent("tabs.onUpdated", tab.id, changeInfo, details);
  }
  onRemoved(tabId) {
    const details = this.ctx.store.tabDetailsCache.has(tabId) ? this.ctx.store.tabDetailsCache.get(tabId) : null;
    this.ctx.store.tabDetailsCache.delete(tabId);
    const windowId = details ? details.windowId : WindowsAPI.WINDOW_ID_NONE;
    const win = typeof windowId !== "undefined" && windowId > -1 ? getAllWindows().find((win2) => win2.id === windowId) : null;
    this.ctx.router.broadcastEvent("tabs.onRemoved", tabId, {
      windowId,
      isWindowClosing: win ? win.isDestroyed() : false
    });
  }
  onActivated(tabId) {
    const tab = this.ctx.store.getTabById(tabId);
    if (!tab) return;
    const activeTab = this.ctx.store.getActiveTabFromWebContents(tab);
    const activeChanged = activeTab?.id !== tabId;
    if (!activeChanged) return;
    const win = this.ctx.store.tabToWindow.get(tab);
    this.ctx.store.setActiveTab(tab);
    this.ctx.store.tabDetailsCache.forEach((tabInfo, cacheTabId) => {
      tabInfo.active = tabId === cacheTabId;
    });
    this.ctx.router.broadcastEvent("tabs.onActivated", {
      tabId,
      windowId: win?.id
    });
  }
};
__publicField(_TabsAPI, "TAB_ID_NONE", -1);
__publicField(_TabsAPI, "WINDOW_ID_NONE", -1);
__publicField(_TabsAPI, "WINDOW_ID_CURRENT", -2);
var TabsAPI = _TabsAPI;

// src/browser/api/web-navigation.ts
var electron = __toESM(require("electron"));
var import_debug5 = __toESM(require("debug"));
var d5 = (0, import_debug5.default)("electron-chrome-extensions:webNavigation");
var getFrame = (frameProcessId, frameRoutingId) => electron.webFrameMain.fromId(frameProcessId, frameRoutingId);
var getFrameId = (frame) => frame === frame.top ? 0 : frame.frameTreeNodeId;
var getParentFrameId = (frame) => {
  const parentFrame = frame?.parent;
  return parentFrame ? getFrameId(parentFrame) : -1;
};
var getFrameType = (frame) => !frame.parent ? "outermost_frame" : "sub_frame";
var getDocumentLifecycle = (frame) => "active";
var getFrameDetails = (frame) => ({
  // TODO(mv3): implement new properties
  url: frame.url,
  documentId: "not-implemented",
  documentLifecycle: getDocumentLifecycle(frame),
  errorOccurred: false,
  frameType: getFrameType(frame),
  // FIXME: frameId is missing from @types/chrome
  ...{
    frameId: getFrameId(frame)
  },
  parentDocumentId: void 0,
  parentFrameId: getParentFrameId(frame)
});
var WebNavigationAPI = class {
  constructor(ctx) {
    this.ctx = ctx;
    __publicField(this, "sendNavigationEvent", (eventName, details) => {
      d5(`${eventName} [url: ${details.url}]`);
      this.ctx.router.broadcastEvent(`webNavigation.${eventName}`, details);
    });
    __publicField(this, "onCreatedNavigationTarget", (tab, { url, frame }) => {
      if (!frame) return;
      const details = {
        sourceTabId: tab.id,
        sourceProcessId: frame ? frame.processId : -1,
        sourceFrameId: getFrameId(frame),
        url,
        tabId: tab.id,
        timeStamp: Date.now()
      };
      this.sendNavigationEvent("onCreatedNavigationTarget", details);
    });
    __publicField(this, "onBeforeNavigate", (tab, {
      url,
      isSameDocument,
      frame
    }) => {
      if (isSameDocument) return;
      if (!frame) return;
      const details = {
        frameId: getFrameId(frame),
        frameType: getFrameType(frame),
        documentLifecycle: getDocumentLifecycle(frame),
        parentFrameId: getParentFrameId(frame),
        processId: frame ? frame.processId : -1,
        tabId: tab.id,
        timeStamp: Date.now(),
        url
      };
      this.sendNavigationEvent("onBeforeNavigate", details);
    });
    __publicField(this, "onCommitted", (tab, _event, url, _httpResponseCode, _httpStatusText, _isMainFrame, frameProcessId, frameRoutingId) => {
      const frame = getFrame(frameProcessId, frameRoutingId);
      if (!frame) return;
      const details = {
        frameId: getFrameId(frame),
        // NOTE: workaround for property missing in type
        ...{
          parentFrameId: getParentFrameId(frame)
        },
        frameType: getFrameType(frame),
        transitionType: "",
        // TODO(mv3)
        transitionQualifiers: [],
        // TODO(mv3)
        documentLifecycle: getDocumentLifecycle(frame),
        processId: frameProcessId,
        tabId: tab.id,
        timeStamp: Date.now(),
        url
      };
      this.sendNavigationEvent("onCommitted", details);
    });
    __publicField(this, "onHistoryStateUpdated", (tab, event, url, isMainFrame, frameProcessId, frameRoutingId) => {
      const frame = getFrame(frameProcessId, frameRoutingId);
      if (!frame) return;
      const details = {
        transitionType: "",
        // TODO
        transitionQualifiers: [],
        // TODO
        frameId: getFrameId(frame),
        parentFrameId: getParentFrameId(frame),
        frameType: getFrameType(frame),
        documentLifecycle: getDocumentLifecycle(frame),
        processId: frameProcessId,
        tabId: tab.id,
        timeStamp: Date.now(),
        url
      };
      this.sendNavigationEvent("onHistoryStateUpdated", details);
    });
    __publicField(this, "onDOMContentLoaded", (tab, frame) => {
      const details = {
        frameId: getFrameId(frame),
        parentFrameId: getParentFrameId(frame),
        frameType: getFrameType(frame),
        documentLifecycle: getDocumentLifecycle(frame),
        processId: frame.processId,
        tabId: tab.id,
        timeStamp: Date.now(),
        url: frame.url
      };
      this.sendNavigationEvent("onDOMContentLoaded", details);
      if (!tab.isLoadingMainFrame()) {
        this.sendNavigationEvent("onCompleted", details);
      }
    });
    __publicField(this, "onFinishLoad", (tab, event, isMainFrame, frameProcessId, frameRoutingId) => {
      const frame = getFrame(frameProcessId, frameRoutingId);
      if (!frame) return;
      const url = tab.getURL();
      const details = {
        frameId: getFrameId(frame),
        parentFrameId: getParentFrameId(frame),
        frameType: getFrameType(frame),
        documentLifecycle: getDocumentLifecycle(frame),
        processId: frameProcessId,
        tabId: tab.id,
        timeStamp: Date.now(),
        url
      };
      this.sendNavigationEvent("onCompleted", details);
    });
    const handle = this.ctx.router.apiHandler();
    handle("webNavigation.getFrame", this.getFrame.bind(this));
    handle("webNavigation.getAllFrames", this.getAllFrames.bind(this));
    this.ctx.store.on("tab-added", this.observeTab.bind(this));
  }
  observeTab(tab) {
    tab.once("will-navigate", this.onCreatedNavigationTarget.bind(this, tab));
    tab.on("did-start-navigation", this.onBeforeNavigate.bind(this, tab));
    tab.on("did-frame-finish-load", this.onFinishLoad.bind(this, tab));
    tab.on("did-frame-navigate", this.onCommitted.bind(this, tab));
    tab.on("did-navigate-in-page", this.onHistoryStateUpdated.bind(this, tab));
    tab.on("frame-created", (_e, { frame }) => {
      if (!frame || frame.top === frame) return;
      frame.on("dom-ready", () => {
        this.onDOMContentLoaded(tab, frame);
      });
    });
    tab.on("dom-ready", () => {
      if ("mainFrame" in tab) {
        this.onDOMContentLoaded(tab, tab.mainFrame);
      }
    });
  }
  getFrame(event, details) {
    const tab = this.ctx.store.getTabById(details.tabId);
    if (!tab) return null;
    let targetFrame;
    if (typeof details.frameId === "number") {
      const mainFrame = tab.mainFrame;
      targetFrame = mainFrame.framesInSubtree.find((frame) => {
        const isMainFrame = frame === frame.top;
        return isMainFrame ? details.frameId === 0 : details.frameId === frame.frameTreeNodeId;
      });
    }
    return targetFrame ? getFrameDetails(targetFrame) : null;
  }
  getAllFrames(event, details) {
    const tab = this.ctx.store.getTabById(details.tabId);
    if (!tab || !("mainFrame" in tab)) return [];
    return tab.mainFrame.framesInSubtree.map(getFrameDetails);
  }
};

// src/browser/store.ts
var import_electron5 = require("electron");
var import_node_events2 = require("node:events");
var ExtensionStore = class extends import_node_events2.EventEmitter {
  constructor(impl) {
    super();
    this.impl = impl;
    /** Tabs observed by the extensions system. */
    __publicField(this, "tabs", /* @__PURE__ */ new Set());
    /** Windows observed by the extensions system. */
    __publicField(this, "windows", /* @__PURE__ */ new Set());
    __publicField(this, "lastFocusedWindowId");
    /**
     * Map of tabs to their parent window.
     *
     * It's not possible to access the parent of a BrowserView so we must manage
     * this ourselves.
     */
    __publicField(this, "tabToWindow", /* @__PURE__ */ new WeakMap());
    /** Map of windows to their active tab. */
    __publicField(this, "windowToActiveTab", /* @__PURE__ */ new WeakMap());
    __publicField(this, "tabDetailsCache", /* @__PURE__ */ new Map());
    __publicField(this, "windowDetailsCache", /* @__PURE__ */ new Map());
    __publicField(this, "urlOverrides", {});
  }
  getWindowById(windowId) {
    return Array.from(this.windows).find(
      (window) => !window.isDestroyed() && window.id === windowId
    );
  }
  getLastFocusedWindow() {
    return this.lastFocusedWindowId ? this.getWindowById(this.lastFocusedWindowId) : null;
  }
  getCurrentWindow() {
    return this.getLastFocusedWindow();
  }
  addWindow(window) {
    if (this.windows.has(window)) return;
    this.windows.add(window);
    if (typeof this.lastFocusedWindowId !== "number") {
      this.lastFocusedWindowId = window.id;
    }
    this.emit("window-added", window);
  }
  async createWindow(event, details) {
    if (typeof this.impl.createWindow !== "function") {
      throw new Error("createWindow is not implemented");
    }
    const win = await this.impl.createWindow(details);
    this.addWindow(win);
    return win;
  }
  async removeWindow(window) {
    if (!this.windows.has(window)) return;
    this.windows.delete(window);
    if (typeof this.impl.removeWindow === "function") {
      await this.impl.removeWindow(window);
    } else {
      window.destroy();
    }
  }
  getTabById(tabId) {
    return Array.from(this.tabs).find((tab) => !tab.isDestroyed() && tab.id === tabId);
  }
  addTab(tab, window) {
    if (this.tabs.has(tab)) return;
    this.tabs.add(tab);
    this.tabToWindow.set(tab, window);
    this.addWindow(window);
    const activeTab = this.getActiveTabFromWebContents(tab);
    if (!activeTab) {
      this.setActiveTab(tab);
    }
    this.emit("tab-added", tab);
  }
  removeTab(tab) {
    if (!this.tabs.has(tab)) return;
    const tabId = tab.id;
    const win = this.tabToWindow.get(tab);
    this.tabs.delete(tab);
    this.tabToWindow.delete(tab);
    const windowHasTabs = Array.from(this.tabs).find((tab2) => this.tabToWindow.get(tab2) === win);
    if (!windowHasTabs) {
      this.windows.delete(win);
    }
    if (typeof this.impl.removeTab === "function") {
      this.impl.removeTab(tab, win);
    }
    this.emit("tab-removed", tabId);
  }
  async createTab(details) {
    if (typeof this.impl.createTab !== "function") {
      throw new Error("createTab is not implemented");
    }
    if (!details.windowId) {
      details.windowId = this.lastFocusedWindowId;
    }
    const result = await this.impl.createTab(details);
    if (!Array.isArray(result)) {
      throw new Error("createTab must return an array of [tab, window]");
    }
    const [tab, window] = result;
    if (typeof tab !== "object" || !import_electron5.webContents.fromId(tab.id)) {
      throw new Error("createTab must return a WebContents");
    } else if (typeof window !== "object") {
      throw new Error("createTab must return a BrowserWindow");
    }
    this.addTab(tab, window);
    return tab;
  }
  getActiveTabFromWindow(win) {
    const activeTab = win && !win.isDestroyed() && this.windowToActiveTab.get(win);
    return activeTab && !activeTab.isDestroyed() && activeTab || void 0;
  }
  getActiveTabFromWebContents(wc) {
    const win = this.tabToWindow.get(wc) || import_electron5.BrowserWindow.fromWebContents(wc);
    const activeTab = win ? this.getActiveTabFromWindow(win) : void 0;
    return activeTab;
  }
  getActiveTabOfCurrentWindow() {
    const win = this.getCurrentWindow();
    return win ? this.getActiveTabFromWindow(win) : void 0;
  }
  setActiveTab(tab) {
    const win = this.tabToWindow.get(tab);
    if (!win) {
      throw new Error("Active tab has no parent window");
    }
    const prevActiveTab = this.getActiveTabFromWebContents(tab);
    this.windowToActiveTab.set(win, tab);
    if (tab.id !== prevActiveTab?.id) {
      this.emit("active-tab-changed", tab, win);
      if (typeof this.impl.selectTab === "function") {
        this.impl.selectTab(tab, win);
      }
    }
  }
  buildMenuItems(extensionId, menuType) {
    return [];
  }
  async requestPermissions(extension, permissions) {
    if (typeof this.impl.requestPermissions !== "function") {
      return true;
    }
    const result = await this.impl.requestPermissions(extension, permissions);
    return typeof result === "boolean" ? result : false;
  }
};

// src/browser/api/context-menus.ts
var import_electron6 = require("electron");
var DEFAULT_CONTEXTS = ["page"];
var getContextTypesFromParams = (params) => {
  const contexts = /* @__PURE__ */ new Set(["all"]);
  switch (params.mediaType) {
    case "audio":
    case "video":
    case "image":
      contexts.add(params.mediaType);
  }
  if (params.pageURL) contexts.add("page");
  if (params.linkURL) contexts.add("link");
  if (params.frameURL) contexts.add("frame");
  if (params.selectionText) contexts.add("selection");
  if (params.isEditable) contexts.add("editable");
  return contexts;
};
var formatTitle = (title, params) => {
  if (params.selectionText && title.includes("%s")) {
    title = title.split("%s").join(params.selectionText);
  }
  return title;
};
var matchesConditions = (props, conditions) => {
  if (props.visible === false) return false;
  const { contextTypes, targetUrl, documentUrl } = conditions;
  const contexts = props.contexts ? Array.isArray(props.contexts) ? props.contexts : [props.contexts] : DEFAULT_CONTEXTS;
  const inContext = contexts.some((context) => contextTypes.has(context));
  if (!inContext) return false;
  if (props.targetUrlPatterns && props.targetUrlPatterns.length > 0 && targetUrl) {
    if (!props.targetUrlPatterns.some((pattern) => matchesPattern(pattern, targetUrl))) {
      return false;
    }
  }
  if (props.documentUrlPatterns && props.documentUrlPatterns.length > 0 && documentUrl) {
    if (!props.documentUrlPatterns.some((pattern) => matchesPattern(pattern, documentUrl))) {
      return false;
    }
  }
  return true;
};
var ContextMenusAPI = class {
  constructor(ctx) {
    this.ctx = ctx;
    __publicField(this, "menus", /* @__PURE__ */ new Map());
    __publicField(this, "buildMenuItem", (opts) => {
      const { extension, props, webContents: webContents2, params } = opts;
      let icon = opts.showIcon ? getIconImage(extension) : void 0;
      if (icon) {
        icon = icon.resize({ width: 16, height: 16 });
      }
      const menuItemOptions = {
        id: props.id,
        type: props.type,
        label: params ? formatTitle(props.title || "", params) : props.title || "",
        icon,
        enabled: props.enabled,
        click: () => {
          this.onClicked(extension.id, props.id, webContents2, params);
        }
      };
      return menuItemOptions;
    });
    __publicField(this, "buildMenuItemsFromTemplate", (menuItemTemplates) => {
      const itemMap = /* @__PURE__ */ new Map();
      for (const item of menuItemTemplates) {
        const menuItem = this.buildMenuItem(item);
        itemMap.set(item.props.id, menuItem);
      }
      for (const item of menuItemTemplates) {
        const menuItem = itemMap.get(item.props.id);
        if (item.props.parentId) {
          const parentMenuItem = itemMap.get(`${item.props.parentId}`);
          if (parentMenuItem) {
            const submenu = parentMenuItem.submenu || [];
            submenu.push(menuItem);
            parentMenuItem.submenu = submenu;
          }
        }
      }
      const menuItems = [];
      const buildFromTemplate = (opts) => {
        if (Array.isArray(opts.submenu)) {
          const submenu = new import_electron6.Menu();
          opts.submenu.forEach((item) => submenu.append(buildFromTemplate(item)));
          opts.submenu = submenu;
        }
        return new import_electron6.MenuItem({
          ...opts,
          // Force submenu type when submenu items are present
          type: opts.type === "normal" && opts.submenu ? "submenu" : opts.type
        });
      };
      for (const item of menuItemTemplates) {
        if (item.props.parentId) continue;
        const menuItem = itemMap.get(item.props.id);
        menuItems.push(buildFromTemplate(menuItem));
      }
      return menuItems;
    });
    __publicField(this, "create", ({ extension }, createProperties) => {
      const { id, type, title } = createProperties;
      if (this.menus.has(id)) {
        return;
      }
      if (!title && type !== "separator") {
        return;
      }
      this.addContextItem(extension.id, createProperties);
    });
    __publicField(this, "remove", ({ extension }, menuItemId) => {
      const items = this.menus.get(extension.id);
      if (items && items.has(menuItemId)) {
        items.delete(menuItemId);
        if (items.size === 0) {
          this.menus.delete(extension.id);
        }
      }
    });
    __publicField(this, "removeAll", ({ extension }) => {
      this.menus.delete(extension.id);
    });
    const handle = this.ctx.router.apiHandler();
    handle("contextMenus.create", this.create);
    handle("contextMenus.remove", this.remove);
    handle("contextMenus.removeAll", this.removeAll);
    const sessionExtensions = ctx.session.extensions || ctx.session;
    sessionExtensions.on("extension-unloaded", (event, extension) => {
      if (this.menus.has(extension.id)) {
        this.menus.delete(extension.id);
      }
    });
    this.ctx.store.buildMenuItems = this.buildMenuItemsForExtension.bind(this);
  }
  addContextItem(extensionId, props) {
    let contextItems = this.menus.get(extensionId);
    if (!contextItems) {
      contextItems = /* @__PURE__ */ new Map();
      this.menus.set(extensionId, contextItems);
    }
    contextItems.set(props.id, props);
  }
  buildMenuItemsForParams(webContents2, params) {
    if (webContents2.session !== this.ctx.session) return [];
    let menuItemOptions = [];
    const conditions = {
      contextTypes: getContextTypesFromParams(params),
      targetUrl: params.srcURL || params.linkURL,
      documentUrl: params.frameURL || params.pageURL
    };
    const sessionExtensions = this.ctx.session.extensions || this.ctx.session;
    for (const [extensionId, propItems] of this.menus) {
      const extension = sessionExtensions.getExtension(extensionId);
      if (!extension) continue;
      const extensionMenuItemOptions = [];
      for (const [, props] of propItems) {
        if (matchesConditions(props, conditions)) {
          const menuItem = {
            extension,
            props,
            webContents: webContents2,
            params
          };
          extensionMenuItemOptions.push(menuItem);
        }
      }
      const topLevelItems = extensionMenuItemOptions.filter((opt) => !opt.props.parentId);
      if (topLevelItems.length > 1) {
        const groupId = `group${extension.id}`;
        const groupMenuItemOptions = {
          extension,
          webContents: webContents2,
          props: {
            id: groupId,
            title: extension.name
          },
          params,
          showIcon: true
        };
        const children = extensionMenuItemOptions.map(
          (opt) => opt.props.parentId ? opt : {
            ...opt,
            props: {
              ...opt.props,
              parentId: groupId
            }
          }
        );
        menuItemOptions = [...menuItemOptions, groupMenuItemOptions, ...children];
      } else if (extensionMenuItemOptions.length > 0) {
        const children = extensionMenuItemOptions.map((opt) => ({
          ...opt,
          showIcon: !opt.props.parentId
        }));
        menuItemOptions = [...menuItemOptions, ...children];
      }
    }
    return this.buildMenuItemsFromTemplate(menuItemOptions);
  }
  buildMenuItemsForExtension(extensionId, menuType) {
    const extensionItems = this.menus.get(extensionId);
    const sessionExtensions = this.ctx.session.extensions || this.ctx.session;
    const extension = sessionExtensions.getExtension(extensionId);
    const activeTab = this.ctx.store.getActiveTabOfCurrentWindow();
    const menuItemOptions = [];
    if (extensionItems && extension && activeTab) {
      const conditions = {
        contextTypes: /* @__PURE__ */ new Set(["all", menuType])
      };
      for (const [, props] of extensionItems) {
        if (matchesConditions(props, conditions)) {
          const menuItem = { extension, props, webContents: activeTab };
          menuItemOptions.push(menuItem);
        }
      }
    }
    return this.buildMenuItemsFromTemplate(menuItemOptions);
  }
  onClicked(extensionId, menuItemId, webContents2, params) {
    if (webContents2.isDestroyed()) return;
    const tab = this.ctx.store.tabDetailsCache.get(webContents2.id);
    if (!tab) {
      console.error(`[Extensions] Unable to find tab for id=${webContents2.id}`);
      return;
    }
    const data = {
      selectionText: params?.selectionText,
      checked: false,
      // TODO
      menuItemId,
      frameId: -1,
      // TODO: match frameURL with webFrameMain in Electron 12
      frameUrl: params?.frameURL,
      editable: params?.isEditable || false,
      // TODO(mv3): limit possible string enums
      mediaType: params?.mediaType,
      wasChecked: false,
      // TODO
      pageUrl: params?.pageURL,
      // types are inaccurate
      linkUrl: params?.linkURL,
      parentMenuItemId: -1,
      // TODO
      srcUrl: params?.srcURL
    };
    this.ctx.router.sendEvent(extensionId, "contextMenus.onClicked", data, tab);
  }
};

// src/browser/api/runtime.ts
var import_node_crypto2 = require("node:crypto");
var import_node_events3 = require("node:events");
var import_node_fs3 = require("node:fs");
var import_node_path = require("node:path");

// src/browser/api/lib/native-messaging-host.ts
var import_node_child_process = require("node:child_process");
var import_node_fs2 = require("node:fs");
var os = __toESM(require("node:os"));
var path2 = __toESM(require("node:path"));
var import_electron7 = require("electron");
var import_debug7 = __toESM(require("debug"));

// src/browser/api/lib/winreg.ts
var import_child_process = require("child_process");
var import_debug6 = __toESM(require("debug"));
var d6 = (0, import_debug6.default)("electron-chrome-extensions:winreg");
function readRegistryKey(hive, path5, key) {
  if (process.platform !== "win32") {
    return Promise.reject("Unsupported platform");
  }
  return new Promise((resolve2, reject) => {
    const args = ["query", `${hive}\\${path5}`, ...key ? ["/v", key] : []];
    d6("reg %s", args.join(" "));
    const child = (0, import_child_process.spawn)("reg", args);
    let output = "";
    let error = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      error += data.toString();
    });
    child.on("close", (code) => {
      if (code !== 0 || error) {
        return reject(new Error(`Failed to read registry: ${error}`));
      }
      const lines = output.trim().split("\n");
      const resultLine = lines.find(
        (line) => key ? line.includes(key) : line.includes("(Default)")
      );
      if (resultLine) {
        const parts = resultLine.trim().split(/\s{2,}/);
        resolve2(parts.pop() || null);
      } else {
        resolve2(null);
      }
    });
  });
}

// src/browser/api/lib/native-messaging-host.ts
var d7 = (0, import_debug7.default)("electron-chrome-extensions:nativeMessaging");
function isValidConfig(config) {
  return typeof config === "object" && config !== null && typeof config.name === "string" && typeof config.description === "string" && typeof config.path === "string" && config.type === "stdio" && Array.isArray(config.allowed_origins);
}
async function getConfigSearchPaths(application) {
  const appJson = `${application}.json`;
  let searchPaths;
  switch (process.platform) {
    case "darwin":
      searchPaths = [
        path2.join("/Library/Google/Chrome/NativeMessagingHosts", appJson),
        // Also look under Chrome's directory since some apps only install their
        // config there
        path2.join(
          os.homedir(),
          "Library",
          "Application Support",
          "Google/Chrome/NativeMessagingHosts",
          appJson
        ),
        path2.join(import_electron7.app.getPath("userData"), "NativeMessagingHosts", appJson)
      ];
      break;
    case "linux":
      searchPaths = [
        path2.join("/etc/opt/chrome/native-messaging-hosts/", appJson),
        path2.join(os.homedir(), ".config/google-chrome/NativeMessagingHosts/", appJson),
        path2.join(import_electron7.app.getPath("userData"), "NativeMessagingHosts", appJson)
      ];
      break;
    case "win32": {
      searchPaths = (await Promise.allSettled([
        readRegistryKey("HKLM", `Software\\Google\\Chrome\\NativeMessagingHosts\\${application}`),
        readRegistryKey("HKCU", `Software\\Google\\Chrome\\NativeMessagingHosts\\${application}`)
      ])).map((result) => result.status === "fulfilled" ? result.value : void 0).filter(Boolean);
      break;
    }
    default:
      throw new Error("Unsupported platform");
  }
  return searchPaths;
}
async function readNativeMessagingHostConfig(application) {
  const searchPaths = await getConfigSearchPaths(application);
  d7("searching", searchPaths);
  for (const filePath of searchPaths) {
    try {
      const data = await import_node_fs2.promises.readFile(filePath);
      const config = JSON.parse(data.toString());
      if (isValidConfig(config)) {
        d7("read config in %s", filePath, config);
        return config;
      } else {
        d7("%s contained invalid config", filePath, config);
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        d7("unable to read %s", filePath);
      } else {
        d7("unknown error", error);
      }
      continue;
    }
  }
}
var NativeMessagingHost = class {
  constructor(extensionId, sender, connectionId, application, keepAlive = true) {
    __publicField(this, "process");
    __publicField(this, "sender");
    __publicField(this, "connectionId");
    __publicField(this, "connected", false);
    __publicField(this, "pending");
    __publicField(this, "keepAlive");
    __publicField(this, "resolveResponse");
    __publicField(this, "ready");
    __publicField(this, "receiveExtensionMessage", (_event, message) => {
      this.send(message);
    });
    __publicField(this, "receive", (data) => {
      const length = data.readUInt32LE(0);
      const message = JSON.parse(data.subarray(4, 4 + length).toString());
      d7("receive: %s", message);
      if (this.keepAlive && this.sender) {
        this.sender.send(`crx-native-msg-${this.connectionId}`, message);
      } else {
        this.resolveResponse?.(message);
      }
    });
    this.keepAlive = keepAlive;
    this.sender = sender;
    if (keepAlive) {
      this.sender.ipc.on(`crx-native-msg-${connectionId}`, this.receiveExtensionMessage);
    }
    this.connectionId = connectionId;
    this.ready = this.launch(application, extensionId);
  }
  destroy() {
    this.connected = false;
    if (this.process) {
      this.process.kill();
      this.process = void 0;
    }
    if (this.keepAlive && this.sender) {
      this.sender.ipc.off(`crx-native-msg-${this.connectionId}`, this.receiveExtensionMessage);
      this.sender.send(`crx-native-msg-${this.connectionId}-disconnect`);
    }
    this.sender = void 0;
  }
  async launch(application, extensionId) {
    const config = await readNativeMessagingHostConfig(application);
    if (!config) {
      d7("launch: unable to find %s for %s", application, extensionId);
      this.destroy();
      return;
    }
    const extensionUrl = `chrome-extension://${extensionId}/`;
    if (!config.allowed_origins?.includes(extensionUrl)) {
      d7("launch: %s not in allowed origins", extensionId);
      this.destroy();
      return;
    }
    let isFile = false;
    try {
      const stat = await import_node_fs2.promises.stat(config.path);
      isFile = stat.isFile();
    } catch (error) {
      d7("launch: unable to find %s", config.path, error);
    }
    if (!isFile) {
      this.destroy();
      return;
    }
    d7("launch: spawning %s for %s", config.path, extensionId);
    this.process = (0, import_node_child_process.spawn)(config.path, [extensionUrl], {
      shell: false
    });
    this.process.stdout.on("data", this.receive);
    this.process.stderr.on("data", (data) => {
      d7("stderr: %s", data.toString());
    });
    this.process.on("error", (err) => {
      d7("error: %s", err);
      this.destroy();
    });
    this.process.on("exit", (code) => {
      d7("exited %d", code);
      this.destroy();
    });
    this.connected = true;
    if (this.pending && this.pending.length > 0) {
      d7("sending %d pending messages", this.pending.length);
      this.pending.forEach((msg) => this.send(msg));
      this.pending = [];
    }
  }
  send(json) {
    d7("send", json);
    if (!this.connected) {
      const pending = this.pending || (this.pending = []);
      pending.push(json);
      d7("send: pending");
      return;
    }
    const message = JSON.stringify(json);
    const buffer = Buffer.alloc(4 + message.length);
    buffer.writeUInt32LE(message.length, 0);
    buffer.write(message, 4);
    this.process.stdin.write(buffer);
  }
  sendAndReceive(message) {
    this.send(message);
    return new Promise((resolve2) => {
      this.resolveResponse = resolve2;
    });
  }
};

// src/browser/api/runtime.ts
var RuntimeAPI = class extends import_node_events3.EventEmitter {
  constructor(ctx) {
    super();
    this.ctx = ctx;
    __publicField(this, "hostMap", {});
    __publicField(this, "ports", /* @__PURE__ */ new Map());
    __publicField(this, "userScriptMessageSenders", /* @__PURE__ */ new Map());
    __publicField(this, "pendingInstallEvents", /* @__PURE__ */ new Map());
    __publicField(this, "installEventTimer");
    __publicField(this, "connectNative", async (event, connectionId, application) => {
      const host = new NativeMessagingHost(
        event.extension.id,
        event.sender,
        connectionId,
        application
      );
      this.hostMap[connectionId] = host;
    });
    __publicField(this, "disconnectNative", (event, connectionId) => {
      this.hostMap[connectionId]?.destroy();
      this.hostMap[connectionId] = void 0;
    });
    __publicField(this, "sendNativeMessage", async (event, application, message) => {
      const connectionId = (0, import_node_crypto2.randomUUID)();
      const host = new NativeMessagingHost(
        event.extension.id,
        event.sender,
        connectionId,
        application,
        false
      );
      await host.ready;
      return await host.sendAndReceive(message);
    });
    __publicField(this, "openOptionsPage", async ({ extension }) => {
      const manifest = getExtensionManifest(extension);
      if (manifest.options_ui) {
        const url = `chrome-extension://${extension.id}/${manifest.options_ui.page}`;
        await this.ctx.store.createTab({ url, active: true });
      } else if (manifest.options_page) {
        const url = `chrome-extension://${extension.id}/${manifest.options_page}`;
        await this.ctx.store.createTab({ url, active: true });
      }
    });
    __publicField(this, "sendMessage", async (event, message) => {
      console.info("[electron-chrome-extensions] runtime.sendMessage received", {
        extensionId: event.extension.id,
        method: message?.method,
        senderType: event.type,
        senderUrl: event.sender?.getURL?.() ?? ""
      });
      if (event.type !== "frame") return void 0;
      const requestId = (0, import_node_crypto2.randomUUID)();
      const senderUrl = event.sender.getURL?.() ?? "";
      const sender = {
        id: event.extension.id,
        url: senderUrl,
        frameId: 0,
        tab: {
          id: event.sender.id,
          index: 0,
          url: senderUrl
        }
      };
      return await new Promise((resolve2) => {
        const timer = setTimeout(() => {
          this.userScriptMessageSenders.delete(requestId);
          console.warn("[electron-chrome-extensions] runtime.sendMessage response timeout", { requestId, method: message?.method });
          resolve2(void 0);
        }, 5e3);
        const onResponse = (response) => {
          clearTimeout(timer);
          resolve2(response);
        };
        this.userScriptMessageSenders.set(requestId, onResponse);
        this.ctx.router.sendEvent(
          event.extension.id,
          "runtime.onMessage",
          message,
          sender,
          requestId
        );
      });
    });
    __publicField(this, "connectPort", async (event, requestedId, name = "") => {
      if (event.type !== "frame") throw new Error("runtime.connectPort requires a frame context");
      const portId = requestedId || (0, import_node_crypto2.randomUUID)();
      this.ports.set(portId, { extensionId: event.extension.id, sender: event.sender });
      console.info("[electron-chrome-extensions] runtime port connected", { portId, name, extensionId: event.extension.id });
      this.ctx.router.sendEvent(event.extension.id, "runtime.onConnect", { portId, name });
      await new Promise((resolve2) => setTimeout(resolve2, 25));
      return { portId, name };
    });
    __publicField(this, "portPostMessage", async (event, portId, message) => {
      const port = this.ports.get(portId);
      if (!port || port.extensionId !== event.extension.id) {
        console.warn("[electron-chrome-extensions] runtime port message dropped", { portId, eventType: event.type });
        return;
      }
      console.info("[electron-chrome-extensions] runtime port message", { portId, eventType: event.type });
      if (event.type === "service-worker") {
        port.sender.send("crx-user-scripts:runtime-port-message", { portId, message });
        return;
      }
      this.ctx.router.sendEvent(port.extensionId, `runtime.portMessage:${portId}`, message);
    });
    __publicField(this, "disconnectPort", async (event, portId) => {
      const port = this.ports.get(portId);
      if (!port || port.extensionId !== event.extension.id) return;
      this.ports.delete(portId);
      if (event.type === "service-worker") {
        port.sender.send("crx-user-scripts:runtime-port-disconnect", { portId });
      } else {
        this.ctx.router.sendEvent(port.extensionId, `runtime.portDisconnect:${portId}`);
      }
    });
    const handle = this.ctx.router.apiHandler();
    handle("runtime.connectNative", this.connectNative, { permission: "nativeMessaging" });
    handle("runtime.disconnectNative", this.disconnectNative, { permission: "nativeMessaging" });
    handle("runtime.openOptionsPage", this.openOptionsPage);
    handle("runtime.sendMessage", this.sendMessage);
    handle("runtime.connectPort", this.connectPort);
    handle("runtime.portPostMessage", this.portPostMessage);
    handle("runtime.disconnectPort", this.disconnectPort);
    handle("runtime.sendNativeMessage", this.sendNativeMessage, { permission: "nativeMessaging" });
    const sessionExtensions = this.ctx.session.extensions || this.ctx.session;
    sessionExtensions.on("extension-loaded", (_event, extension) => {
      this.trackInstalledExtension(extension);
    });
    this.ctx.session.serviceWorkers.on("running-status-changed", ({ runningStatus, versionId }) => {
      if (runningStatus !== "starting") return;
      const worker = this.ctx.session.serviceWorkers.getWorkerFromVersionID(versionId);
      if (!worker?.scope?.startsWith("chrome-extension://")) return;
      worker.ipc.on("crx-user-script-message-response", (_event, response) => {
        this.handleUserScriptMessageResponse(response);
      });
    });
  }
  handleUserScriptMessageResponse(response) {
    const resolve2 = this.userScriptMessageSenders.get(response?.requestId);
    if (!resolve2) return;
    this.userScriptMessageSenders.delete(response.requestId);
    console.info("[electron-chrome-extensions] runtime user script response received", {
      requestId: response.requestId,
      hasResponse: response.response !== void 0
    });
    resolve2(response.response);
  }
  getInstallStatePath() {
    const storagePath = this.ctx.session.getStoragePath();
    return storagePath ? (0, import_node_path.join)(storagePath, "electron-chrome-extensions", "extension-versions.json") : void 0;
  }
  readInstallState() {
    const filePath = this.getInstallStatePath();
    if (!filePath || !(0, import_node_fs3.existsSync)(filePath)) return {};
    try {
      const state = JSON.parse((0, import_node_fs3.readFileSync)(filePath, "utf8"));
      return state && typeof state === "object" ? state : {};
    } catch {
      return {};
    }
  }
  writeInstallState(state) {
    const filePath = this.getInstallStatePath();
    if (!filePath) return;
    try {
      (0, import_node_fs3.mkdirSync)((0, import_node_path.dirname)(filePath), { recursive: true });
      (0, import_node_fs3.writeFileSync)(filePath, JSON.stringify(state), "utf8");
    } catch (error) {
      console.warn("[electron-chrome-extensions] unable to persist extension install state", {
        filePath,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  trackInstalledExtension(extension) {
    const version = extension.manifest.version;
    if (!version) return;
    const state = this.readInstallState();
    const previousVersion = state[extension.id];
    state[extension.id] = version;
    this.writeInstallState(state);
    if (!previousVersion || previousVersion === version) return;
    this.pendingInstallEvents.set(
      extension.id,
      previousVersion ? { reason: "update", previousVersion } : { reason: "install" }
    );
    this.scheduleInstallEventDelivery();
  }
  scheduleInstallEventDelivery() {
    if (this.installEventTimer) return;
    this.installEventTimer = setTimeout(() => {
      this.installEventTimer = void 0;
      for (const [extensionId, details] of this.pendingInstallEvents) {
        this.ctx.router.sendEvent(extensionId, "runtime.onInstalled", details);
      }
      this.pendingInstallEvents.clear();
    }, 100);
  }
};

// src/browser/api/cookies.ts
var onChangedCauseTranslation = {
  "expired-overwrite": "expired_overwrite"
};
var createCookieDetails = (cookie) => ({
  ...cookie,
  domain: cookie.domain || "",
  hostOnly: Boolean(cookie.hostOnly),
  session: Boolean(cookie.session),
  path: cookie.path || "",
  httpOnly: Boolean(cookie.httpOnly),
  secure: Boolean(cookie.secure),
  storeId: "0" /* Default */
});
var CookiesAPI = class {
  constructor(ctx) {
    this.ctx = ctx;
    __publicField(this, "onChanged", (event, cookie, cause, removed) => {
      const changeInfo = {
        cause: onChangedCauseTranslation[cause] || cause,
        cookie: createCookieDetails(cookie),
        removed
      };
      this.ctx.router.broadcastEvent("cookies.onChanged", changeInfo);
    });
    const handle = this.ctx.router.apiHandler();
    handle("cookies.get", this.get.bind(this));
    handle("cookies.getAll", this.getAll.bind(this));
    handle("cookies.set", this.set.bind(this));
    handle("cookies.remove", this.remove.bind(this));
    handle("cookies.getAllCookieStores", this.getAllCookieStores.bind(this));
    this.cookies.addListener("changed", this.onChanged);
  }
  get cookies() {
    return this.ctx.session.cookies;
  }
  async get(event, details) {
    const cookies = await this.cookies.get({
      url: details.url,
      name: details.name
    });
    return cookies.length > 0 ? createCookieDetails(cookies[0]) : null;
  }
  async getAll(event, details) {
    const cookies = await this.cookies.get({
      url: details.url,
      name: details.name,
      domain: details.domain,
      path: details.path,
      secure: details.secure,
      session: details.session
    });
    return cookies.map(createCookieDetails);
  }
  async set(event, details) {
    await this.cookies.set(details);
    const cookies = await this.cookies.get(details);
    return cookies.length > 0 ? createCookieDetails(cookies[0]) : null;
  }
  async remove(event, details) {
    try {
      await this.cookies.remove(details.url, details.name);
    } catch {
      return null;
    }
    return details;
  }
  async getAllCookieStores(event) {
    const tabIds = Array.from(this.ctx.store.tabs).map((tab) => tab.isDestroyed() ? void 0 : tab.id).filter(Boolean);
    return [{ id: "0" /* Default */, tabIds }];
  }
};

// src/browser/api/notifications.ts
var import_electron8 = require("electron");
var getBody = (opts) => {
  const { type = "basic" /* Basic */ } = opts;
  switch (type) {
    case "list" /* List */: {
      if (!Array.isArray(opts.items)) {
        throw new Error("List items must be provided for list type");
      }
      return opts.items.map((item) => `${item.title} - ${item.message}`).join("\n");
    }
    default:
      return opts.message || "";
  }
};
var getUrgency = (priority) => {
  if (typeof priority !== "number") {
    return "normal";
  } else if (priority >= 2) {
    return "critical";
  } else if (priority < 0) {
    return "low";
  } else {
    return "normal";
  }
};
var createScopedIdentifier = (extension, id) => `${extension.id}-${id}`;
var stripScopeFromIdentifier = (id) => {
  const index = id.indexOf("-");
  return id.substr(index + 1);
};
var NotificationsAPI = class {
  constructor(ctx) {
    this.ctx = ctx;
    __publicField(this, "registry", /* @__PURE__ */ new Map());
    __publicField(this, "clear", ({ extension }, id) => {
      const notificationId = createScopedIdentifier(extension, id);
      if (this.registry.has(notificationId)) {
        this.registry.get(notificationId)?.close();
      }
    });
    __publicField(this, "create", async ({ extension }, arg1, arg2) => {
      let id;
      let opts;
      if (typeof arg1 === "object") {
        id = "guid";
        opts = arg1;
      } else if (typeof arg1 === "string") {
        id = arg1;
        opts = arg2;
      } else {
        throw new Error("Invalid arguments");
      }
      if (typeof opts !== "object" || !opts.type || !opts.iconUrl || !opts.title || !opts.message) {
        throw new Error("Missing required notification options");
      }
      const notificationId = createScopedIdentifier(extension, id);
      if (this.registry.has(notificationId)) {
        this.registry.get(notificationId)?.close();
      }
      let icon;
      if (opts.iconUrl) {
        let url;
        try {
          url = new URL(opts.iconUrl);
        } catch {
        }
        if (url?.protocol === "data:") {
          icon = opts.iconUrl;
        } else {
          icon = await validateExtensionResource(extension, opts.iconUrl);
        }
        if (!icon) {
          throw new Error("Invalid iconUrl");
        }
      }
      const notification = new import_electron8.Notification({
        title: opts.title,
        subtitle: import_electron8.app.name,
        body: getBody(opts),
        silent: opts.silent,
        icon,
        urgency: getUrgency(opts.priority),
        timeoutType: opts.requireInteraction ? "never" : "default"
      });
      this.registry.set(notificationId, notification);
      notification.on("click", () => {
        this.ctx.router.sendEvent(extension.id, "notifications.onClicked", id);
      });
      notification.once("close", () => {
        const byUser = true;
        this.ctx.router.sendEvent(extension.id, "notifications.onClosed", id, byUser);
        this.registry.delete(notificationId);
      });
      notification.show();
      return id;
    });
    __publicField(this, "getAll", ({ extension }) => {
      return Array.from(this.registry.keys()).filter((key) => key.startsWith(extension.id)).map(stripScopeFromIdentifier);
    });
    __publicField(this, "getPermissionLevel", (event) => {
      return import_electron8.Notification.isSupported() ? "granted" : "denied";
    });
    __publicField(this, "update", ({ extension }, id, opts) => {
      const notificationId = createScopedIdentifier(extension, id);
      const notification = this.registry.get(notificationId);
      if (!notification) {
        return false;
      }
      if (opts.priority) notification.urgency = getUrgency(opts.priority);
      if (opts.silent) notification.silent = opts.silent;
    });
    const handle = this.ctx.router.apiHandler();
    handle("notifications.clear", this.clear);
    handle("notifications.create", this.create);
    handle("notifications.getAll", this.getAll);
    handle("notifications.getPermissionLevel", this.getPermissionLevel);
    handle("notifications.update", this.update);
    const sessionExtensions = ctx.session.extensions || ctx.session;
    sessionExtensions.on("extension-unloaded", (event, extension) => {
      for (const [key, notification] of this.registry) {
        if (key.startsWith(extension.id)) {
          notification.close();
        }
      }
    });
  }
};

// src/browser/api/commands.ts
var CommandsAPI = class {
  constructor(ctx) {
    this.ctx = ctx;
    __publicField(this, "commandMap", /* @__PURE__ */ new Map());
    __publicField(this, "getAll", ({ extension }) => {
      return this.commandMap.get(extension.id) || [];
    });
    const handle = this.ctx.router.apiHandler();
    handle("commands.getAll", this.getAll);
    const sessionExtensions = ctx.session.extensions || ctx.session;
    sessionExtensions.on("extension-loaded", (_event, extension) => {
      this.processExtension(extension);
    });
    sessionExtensions.on("extension-unloaded", (_event, extension) => {
      this.removeCommands(extension);
    });
  }
  processExtension(extension) {
    const manifest = extension.manifest;
    if (!manifest.commands) return;
    if (!this.commandMap.has(extension.id)) {
      this.commandMap.set(extension.id, []);
    }
    const commands = this.commandMap.get(extension.id);
    for (const [name, details] of Object.entries(manifest.commands)) {
      commands.push({
        name,
        description: details.description,
        shortcut: ""
      });
    }
  }
  removeCommands(extension) {
    this.commandMap.delete(extension.id);
  }
};

// src/browser/router.ts
var import_electron10 = require("electron");
var import_debug8 = __toESM(require("debug"));

// src/browser/partition.ts
var import_electron9 = require("electron");
var resolvePartitionImpl = (partition) => import_electron9.session.fromPartition(partition);
function setSessionPartitionResolver(resolver) {
  resolvePartitionImpl = resolver;
}
function resolvePartition(partition) {
  return resolvePartitionImpl(partition);
}

// src/browser/router.ts
var shortenValues = (k, v) => typeof v === "string" && v.length > 128 ? v.substr(0, 128) + "..." : v;
import_debug8.default.formatters.r = (value) => {
  return value ? JSON.stringify(value, shortenValues, "  ") : value;
};
var getSessionFromEvent = (event) => {
  if (event.type === "service-worker") {
    return event.session;
  } else {
    return event.sender.session;
  }
};
var d8 = (0, import_debug8.default)("electron-chrome-extensions:router");
var shouldLogExtensionWorkerConsole = process.env.ELECTRON_CHROME_EXTENSIONS_DEBUG === "1";
var DEFAULT_SESSION = "_self";
var gRoutingDelegate;
var RoutingDelegate = class _RoutingDelegate {
  constructor() {
    __publicField(this, "sessionMap", /* @__PURE__ */ new WeakMap());
    __publicField(this, "workers", /* @__PURE__ */ new WeakSet());
    __publicField(this, "onRouterMessage", async (event, extensionId, handlerName, ...args) => {
      d8(`received '${handlerName}'`, args);
      const observer = this.sessionMap.get(getSessionFromEvent(event));
      return observer?.onExtensionMessage(event, extensionId, handlerName, ...args);
    });
    __publicField(this, "onRemoteMessage", async (event, sessionPartition, handlerName, ...args) => {
      d8(`received remote '${handlerName}' for '${sessionPartition}'`, args);
      const ses = sessionPartition === DEFAULT_SESSION ? getSessionFromEvent(event) : resolvePartition(sessionPartition);
      const observer = this.sessionMap.get(ses);
      return observer?.onExtensionMessage(event, void 0, handlerName, ...args);
    });
    __publicField(this, "onAddListener", (event, extensionId, eventName) => {
      if (eventName === "runtime.onMessage" || eventName === "runtime.onConnect") {
        console.info("[electron-chrome-extensions] extension listener registered", {
          extensionId,
          eventName,
          eventType: event.type
        });
      }
      const observer = this.sessionMap.get(getSessionFromEvent(event));
      const listener = event.type === "frame" ? {
        type: event.type,
        extensionId,
        host: event.sender
      } : {
        type: event.type,
        extensionId
      };
      return observer?.addListener(listener, extensionId, eventName);
    });
    __publicField(this, "onRemoveListener", (event, extensionId, eventName) => {
      const observer = this.sessionMap.get(getSessionFromEvent(event));
      const listener = event.type === "frame" ? {
        type: event.type,
        extensionId,
        host: event.sender
      } : {
        type: event.type,
        extensionId
      };
      return observer?.removeListener(listener, extensionId, eventName);
    });
    import_electron10.ipcMain.handle("crx-msg", this.onRouterMessage);
    import_electron10.ipcMain.handle("crx-msg-remote", this.onRemoteMessage);
    import_electron10.ipcMain.on("crx-add-listener", this.onAddListener);
    import_electron10.ipcMain.on("crx-remove-listener", this.onRemoveListener);
  }
  static get() {
    return gRoutingDelegate || (gRoutingDelegate = new _RoutingDelegate());
  }
  addObserver(observer) {
    this.sessionMap.set(observer.session, observer);
    const maybeListenForWorkerEvents = ({
      runningStatus,
      versionId
    }) => {
      if (runningStatus !== "starting") return;
      const serviceWorker = observer.session.serviceWorkers.getWorkerFromVersionID(
        versionId
      );
      if (serviceWorker?.scope?.startsWith("chrome-extension://") && !this.workers.has(serviceWorker)) {
        d8(`listening to service worker [versionId:${versionId}, scope:${serviceWorker.scope}]`);
        this.workers.add(serviceWorker);
        serviceWorker.ipc.handle("crx-msg", this.onRouterMessage);
        serviceWorker.ipc.handle("crx-msg-remote", this.onRemoteMessage);
        serviceWorker.ipc.on("crx-add-listener", this.onAddListener);
        serviceWorker.ipc.on("crx-remove-listener", this.onRemoveListener);
      }
    };
    observer.session.serviceWorkers.on("running-status-changed", maybeListenForWorkerEvents);
  }
};
var getHostId = (host) => host.id;
var getHostUrl = (host) => host.getURL?.();
var eventListenerEquals = (a) => (b) => {
  if (a === b) return true;
  if (a.extensionId !== b.extensionId) return false;
  if (a.type !== b.type) return false;
  if (a.type === "frame" && b.type === "frame") {
    return a.host === b.host;
  }
  return true;
};
var ExtensionRouter = class {
  constructor(session2, delegate = RoutingDelegate.get()) {
    this.session = session2;
    this.delegate = delegate;
    __publicField(this, "handlers", /* @__PURE__ */ new Map());
    __publicField(this, "listeners", /* @__PURE__ */ new Map());
    /**
     * Collection of all extension hosts in the session.
     *
     * Currently the router has no ability to wake up non-persistent background
     * scripts to deliver events. For now we just hold a reference to them to
     * prevent them from being terminated.
     */
    __publicField(this, "extensionHosts", /* @__PURE__ */ new Set());
    __publicField(this, "extensionWorkers", /* @__PURE__ */ new Set());
    this.delegate.addObserver(this);
    const sessionExtensions = session2.extensions || session2;
    sessionExtensions.on("extension-unloaded", (event, extension) => {
      this.filterListeners((listener) => listener.extensionId !== extension.id);
    });
    import_electron10.app.on("web-contents-created", (event, webContents2) => {
      if (webContents2.session === this.session && webContents2.getType() === "backgroundPage") {
        d8(`storing reference to background host [url:'${webContents2.getURL()}']`);
        this.extensionHosts.add(webContents2);
      }
    });
    session2.serviceWorkers.on("console-message", (_event, details) => {
      if (!shouldLogExtensionWorkerConsole) return;
      console.info("[electron-chrome-extensions] extension service worker console", {
        sessionStoragePath: session2.getStoragePath(),
        message: details?.message,
        source: details?.sourceId ?? details?.source,
        line: details?.lineNumber ?? details?.line,
        url: details?.url
      });
    });
    session2.serviceWorkers.on(
      "running-status-changed",
      ({ runningStatus, versionId }) => {
        const serviceWorker = session2.serviceWorkers.getWorkerFromVersionID(versionId);
        if (!serviceWorker) return;
        const { scope } = serviceWorker;
        if (!scope.startsWith("chrome-extension:")) return;
        console.info("[electron-chrome-extensions] extension service worker lifecycle", {
          sessionStoragePath: session2.getStoragePath(),
          scope,
          versionId,
          runningStatus
        });
        if (runningStatus !== "starting") return;
        if (this.extensionHosts.has(serviceWorker)) {
          d8("%s running status changed to %s", scope, runningStatus);
        } else {
          d8(`storing reference to background service worker [url:'${scope}']`);
          this.extensionWorkers.add(serviceWorker);
        }
      }
    );
  }
  filterListeners(predicate) {
    for (const [eventName, listeners] of this.listeners) {
      const filteredListeners = listeners.filter(predicate);
      const delta = listeners.length - filteredListeners.length;
      if (filteredListeners.length > 0) {
        this.listeners.set(eventName, filteredListeners);
      } else {
        this.listeners.delete(eventName);
      }
      if (delta > 0) {
        d8(`removed ${delta} listener(s) for '${eventName}'`);
      }
    }
  }
  observeListenerHost(host) {
    const hostId = getHostId(host);
    d8(`observing listener [id:${hostId}, url:'${getHostUrl(host)}']`);
    host.once("destroyed", () => {
      d8(`extension host destroyed [id:${hostId}]`);
      this.filterListeners((listener) => listener.type !== "frame" || listener.host !== host);
    });
  }
  addListener(listener, extensionId, eventName) {
    const { listeners, session: session2 } = this;
    const sessionExtensions = session2.extensions || session2;
    const extension = sessionExtensions.getExtension(extensionId);
    if (!extension) {
      throw new Error(`extension not registered in session [extensionId:${extensionId}]`);
    }
    if (!listeners.has(eventName)) {
      listeners.set(eventName, []);
    }
    const eventListeners = listeners.get(eventName);
    const existingEventListener = eventListeners.find(eventListenerEquals(listener));
    if (existingEventListener) {
      d8(`ignoring existing '${eventName}' event listener for ${extensionId}`);
    } else {
      d8(`adding '${eventName}' event listener for ${extensionId}`);
      eventListeners.push(listener);
      if (listener.type === "frame" && listener.host) {
        this.observeListenerHost(listener.host);
      }
    }
  }
  removeListener(listener, extensionId, eventName) {
    const { listeners } = this;
    const eventListeners = listeners.get(eventName);
    if (!eventListeners) {
      console.error(`event listener not registered for '${eventName}'`);
      return;
    }
    const index = eventListeners.findIndex(eventListenerEquals(listener));
    if (index >= 0) {
      d8(`removing '${eventName}' event listener for ${extensionId}`);
      eventListeners.splice(index, 1);
    }
    if (eventListeners.length === 0) {
      listeners.delete(eventName);
    }
  }
  getHandler(handlerName) {
    const handler = this.handlers.get(handlerName);
    if (!handler) {
      throw new Error(`${handlerName} is not a registered handler`);
    }
    return handler;
  }
  async onExtensionMessage(event, extensionId, handlerName, ...args) {
    const { session: session2 } = this;
    const eventSession = getSessionFromEvent(event);
    const eventSessionExtensions = eventSession.extensions || eventSession;
    const handler = this.getHandler(handlerName);
    if (handlerName.startsWith("userScripts.")) {
      console.info("[electron-chrome-extensions] userScripts IPC received", {
        handlerName,
        eventType: event.type,
        extensionId,
        sessionStoragePath: eventSession.getStoragePath(),
        senderUrl: event.type === "frame" ? getHostUrl(event.sender) : event.serviceWorker?.scope
      });
    }
    if (eventSession !== session2 && !handler.allowRemote) {
      throw new Error(`${handlerName} does not support calling from a remote session`);
    }
    const extension = extensionId ? eventSessionExtensions.getExtension(extensionId) : void 0;
    if (!extension && handler.extensionContext) {
      throw new Error(`${handlerName} was sent from an unknown extension context`);
    }
    if (handler.permission) {
      const manifest = extension?.manifest;
      if (!extension || !manifest.permissions?.includes(handler.permission)) {
        throw new Error(
          `${handlerName} requires an extension with ${handler.permission} permissions`
        );
      }
    }
    const extEvent = event.type === "frame" ? { type: event.type, sender: event.sender, extension } : { type: event.type, sender: event.serviceWorker, extension };
    const result = await handler.callback(extEvent, ...args);
    d8(`${handlerName} result: %r`, result);
    return result;
  }
  handle(name, callback, opts) {
    this.handlers.set(name, {
      callback,
      extensionContext: typeof opts?.extensionContext === "boolean" ? opts.extensionContext : true,
      allowRemote: typeof opts?.allowRemote === "boolean" ? opts.allowRemote : false,
      permission: typeof opts?.permission === "string" ? opts.permission : void 0
    });
  }
  /** Returns a callback to register API handlers for the given context. */
  apiHandler() {
    return (name, callback, opts) => {
      this.handle(name, callback, opts);
    };
  }
  /**
   * Sends extension event to the host for the given extension ID if it
   * registered a listener for it.
   */
  sendEvent(targetExtensionId, eventName, ...args) {
    const { listeners } = this;
    let eventListeners = listeners.get(eventName);
    const ipcName = `crx-${eventName}`;
    if (!eventListeners || eventListeners.length === 0) {
      if (eventName === "runtime.onMessage") {
        console.warn("[electron-chrome-extensions] runtime message has no receiving listener", {
          targetExtensionId
        });
      }
      return;
    }
    let sentCount = 0;
    for (const listener of eventListeners) {
      const { type, extensionId } = listener;
      if (targetExtensionId && targetExtensionId !== extensionId) {
        continue;
      }
      if (type === "service-worker") {
        const scope = `chrome-extension://${extensionId}/`;
        this.session.serviceWorkers.startWorkerForScope(scope).then((serviceWorker) => {
          serviceWorker.send(ipcName, ...args);
        }).catch((error) => {
          d8("failed to send %s to %s", eventName, extensionId);
          console.error(error);
        });
      } else {
        if (listener.host.isDestroyed()) {
          console.error(`Unable to send '${eventName}' to extension host for ${extensionId}`);
          return;
        }
        listener.host.send(ipcName, ...args);
      }
      sentCount++;
    }
    d8(`sent '${eventName}' event to ${sentCount} listeners`);
  }
  /** Broadcasts extension event to all extension hosts listening for it. */
  broadcastEvent(eventName, ...args) {
    this.sendEvent(void 0, eventName, ...args);
  }
};

// src/browser/license.ts
var import_electron11 = require("electron");
var nodeCrypto = __toESM(require("node:crypto"));
var fs3 = __toESM(require("node:fs"));
var path3 = __toESM(require("node:path"));
var INTERNAL_LICENSE = "internal-license-do-not-use";
var VALID_LICENSES_CONST = ["GPL-3.0", "Patron-License-2020-11-19"];
var VALID_LICENSES = new Set(VALID_LICENSES_CONST);
var NONCOMPLIANT_PROJECTS = /* @__PURE__ */ new Set([
  "9588cd7085bc3ae89f2c9cf8b7dee35a77a6747b4717be3d7b6b8f395c9ca1d8",
  "8cf1d008c4c5d4e8a6f32de274359cf4ac02fcb82aeffae10ff0b99553c9d745"
]);
var getLicenseNotice = () => `Please select a distribution license compatible with your application.
Valid licenses include: ${Array.from(VALID_LICENSES).join(", ")}
See LICENSE.md for more details.`;
function readPackageJson() {
  const appPath = import_electron11.app.getAppPath();
  const packageJsonPath = path3.join(appPath, "package.json");
  const rawData = fs3.readFileSync(packageJsonPath, "utf-8");
  return JSON.parse(rawData);
}
function generateHash(input) {
  const hash = nodeCrypto.createHash("sha256");
  hash.update("crx" + input);
  return hash.digest("hex");
}
function checkLicense(license) {
  if (!license || typeof license !== "string") {
    throw new Error(`ElectronChromeExtensions: Missing 'license' property.
${getLicenseNotice()}`);
  }
  if (!VALID_LICENSES.has(license) && license !== INTERNAL_LICENSE) {
    throw new Error(
      `ElectronChromeExtensions: Invalid 'license' property: ${license}
${getLicenseNotice()}`
    );
  }
  let projectNameHash;
  try {
    const packageJson = readPackageJson();
    const projectName = packageJson.name.toLowerCase();
    projectNameHash = generateHash(projectName);
  } catch {
  }
  if (projectNameHash && NONCOMPLIANT_PROJECTS.has(projectNameHash)) {
    throw new Error(
      `ElectronChromeExtensions: This application is using a non-compliant license. Contact sam@samuelmaddock.com if you wish to reinstate your license.`
    );
  }
}

// src/browser/manifest.ts
async function readUrlOverrides(ctx, extension) {
  const manifest = extension.manifest;
  const urlOverrides = ctx.store.urlOverrides;
  let updated = false;
  if (typeof manifest.chrome_url_overrides === "object") {
    for (const [name, uri] of Object.entries(manifest.chrome_url_overrides)) {
      const validatedPath = await validateExtensionResource(extension, uri);
      if (!validatedPath) {
        console.error(
          `Extension ${extension.id} attempted to override ${name} with invalid resource: ${uri}`
        );
        continue;
      }
      const url = getExtensionUrl(extension, uri);
      const currentUrl = urlOverrides[name];
      if (currentUrl !== url) {
        urlOverrides[name] = url;
        updated = true;
      }
    }
  }
  if (updated) {
    ctx.emit("url-overrides-updated", urlOverrides);
  }
}
function readLoadedExtensionManifest(ctx, extension) {
  readUrlOverrides(ctx, extension);
}

// src/browser/api/permissions.ts
var PermissionsAPI = class {
  constructor(ctx) {
    this.ctx = ctx;
    __publicField(this, "permissionMap", /* @__PURE__ */ new Map());
    __publicField(this, "contains", ({ extension }, permissions) => {
      const currentPermissions = this.permissionMap.get(extension.id);
      const hasPermissions = permissions.permissions ? permissions.permissions.every(
        (permission) => currentPermissions.permissions.includes(permission)
      ) : true;
      const hasOrigins = permissions.origins ? permissions.origins.every((origin) => currentPermissions.origins.includes(origin)) : true;
      return hasPermissions && hasOrigins;
    });
    __publicField(this, "getAll", ({ extension }) => {
      return this.permissionMap.get(extension.id);
    });
    __publicField(this, "remove", ({ extension }, permissions) => {
      return true;
    });
    __publicField(this, "request", async ({ extension }, request) => {
      const declaredPermissions = /* @__PURE__ */ new Set([
        ...extension.manifest.permissions || [],
        ...extension.manifest.optional_permissions || []
      ]);
      if (request.permissions && !request.permissions.every((p) => declaredPermissions.has(p))) {
        throw new Error("Permissions request includes undeclared permission");
      }
      const granted = await this.ctx.store.requestPermissions(extension, request);
      if (!granted) return false;
      const permissions = this.permissionMap.get(extension.id);
      if (request.origins) {
        for (const origin of request.origins) {
          if (!permissions.origins.includes(origin)) {
            permissions.origins.push(origin);
          }
        }
      }
      if (request.permissions) {
        for (const permission of request.permissions) {
          if (!permissions.permissions.includes(permission)) {
            permissions.permissions.push(permission);
          }
        }
      }
      return true;
    });
    const handle = this.ctx.router.apiHandler();
    handle("permissions.contains", this.contains);
    handle("permissions.getAll", this.getAll);
    handle("permissions.remove", this.remove);
    handle("permissions.request", this.request);
    const sessionExtensions = ctx.session.extensions || ctx.session;
    sessionExtensions.getAllExtensions().forEach((ext) => this.processExtension(ext));
    sessionExtensions.on("extension-loaded", (_event, extension) => {
      this.processExtension(extension);
    });
    sessionExtensions.on("extension-unloaded", (_event, extension) => {
      this.permissionMap.delete(extension.id);
    });
  }
  processExtension(extension) {
    const manifest = extension.manifest;
    this.permissionMap.set(extension.id, {
      permissions: manifest.permissions || [],
      origins: manifest.host_permissions || []
    });
  }
};

// src/browser/api/user-scripts.ts
var import_node_fs4 = require("node:fs");
var import_electron12 = require("electron");
var import_node_path2 = require("node:path");
var documentStartChannel = "crx-user-scripts:document-start";
var executionChannel = "crx-user-scripts:execution";
var instances = /* @__PURE__ */ new WeakMap();
var documentStartHandlerInstalled = false;
function matchesGlob(pattern, url) {
  const expression = pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${expression}$`).test(url);
}
function matchesScript(script, url) {
  const matches = script.matches ?? ["<all_urls>"];
  if (!matches.some((pattern) => matchesPattern(pattern, url))) return false;
  if (script.excludeMatches?.some((pattern) => matchesPattern(pattern, url))) return false;
  if (script.includeGlobs?.length && !script.includeGlobs.some((pattern) => matchesGlob(pattern, url))) {
    return false;
  }
  if (script.excludeGlobs?.some((pattern) => matchesGlob(pattern, url))) return false;
  return true;
}
function createWorldId(extensionId, worldId) {
  let hash = 0;
  for (const character of `${extensionId}:${worldId}`) {
    hash = hash * 31 + character.charCodeAt(0) | 0;
  }
  const firstWorldId = 1e6;
  const worldIdLimit = 1 << 29;
  return firstWorldId + (hash >>> 0) % (worldIdLimit - firstWorldId);
}
function getScriptCode(extension, script) {
  return (script.js ?? []).flatMap((item) => {
    if (typeof item.code === "string") return [item.code];
    if (typeof item.file !== "string") return [];
    const filePath = (0, import_node_path2.resolve)(extension.path, item.file);
    if (!filePath.startsWith(`${extension.path}${import_node_path2.sep}`)) return [];
    try {
      return [(0, import_node_fs4.readFileSync)(filePath, "utf8")];
    } catch (error) {
      console.warn("[electron-chrome-extensions] unable to read user script file", {
        extensionId: extension.id,
        scriptId: script.id,
        file: item.file,
        message: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }).join("\n");
}
var UserScriptsAPI = class {
  constructor(ctx) {
    this.ctx = ctx;
    __publicField(this, "scripts", /* @__PURE__ */ new Map());
    __publicField(this, "initializationWaiters", /* @__PURE__ */ new Map());
    __publicField(this, "register", async (event, scripts) => {
      const extensionId = event.extension.id;
      const target = this.getExtensionScripts(event.extension);
      if (scripts.some((script) => !script.id || script.id.startsWith("_"))) {
        throw new Error('User script IDs must be non-empty and cannot start with "_"');
      }
      if (scripts.some((script) => !script.js?.length || !script.matches?.length)) {
        throw new Error("User scripts require non-empty js and matches arrays");
      }
      const ids = new Set(scripts.map((script) => script.id));
      if (ids.size !== scripts.length || scripts.some((script) => target.scripts.has(script.id))) {
        throw new Error("A user script with this ID is already registered");
      }
      scripts.forEach((script) => target.scripts.set(script.id, { ...script }));
      this.persistExtension(extensionId);
      this.scheduleInitializationSettlement(extensionId);
      console.info("[electron-chrome-extensions] user scripts registered", {
        extensionId,
        scripts: scripts.map((script) => ({
          id: script.id,
          runAt: script.runAt ?? "document_idle",
          world: script.world ?? "USER_SCRIPT",
          worldId: script.worldId ?? "default",
          sources: script.js?.map((item) => item.file || (item.code ? "inline" : "unknown"))
        }))
      });
    });
    __publicField(this, "unregister", async (event, details) => {
      const target = this.getExtensionScripts(event.extension);
      if (!details.ids) {
        target.scripts.clear();
        this.persistExtension(event.extension.id);
        return;
      }
      for (const id of details.ids) target.scripts.delete(id);
      this.persistExtension(event.extension.id);
    });
    __publicField(this, "update", async (event, scripts) => {
      const target = this.getExtensionScripts(event.extension);
      if (scripts.some((update) => !update.id || !target.scripts.has(update.id))) {
        throw new Error("Cannot update an unknown user script");
      }
      const updated = scripts.map((update) => ({ ...target.scripts.get(update.id), ...update }));
      updated.forEach((script) => target.scripts.set(script.id, script));
      this.persistExtension(event.extension.id);
      this.scheduleInitializationSettlement(event.extension.id);
      console.info("[electron-chrome-extensions] user scripts updated", {
        extensionId: event.extension.id,
        scriptIds: scripts.map((script) => script.id)
      });
    });
    __publicField(this, "getScripts", async (event, filter) => {
      const scripts = [...this.getExtensionScripts(event.extension).scripts.values()];
      const result = filter?.ids ? scripts.filter((script) => filter.ids.includes(script.id)) : scripts;
      console.info("[electron-chrome-extensions] user scripts queried", {
        extensionId: event.extension.id,
        filterIds: filter?.ids ?? null,
        scriptCount: result.length
      });
      return result;
    });
    __publicField(this, "configureWorld", async (event, properties) => {
      const worldId = properties.worldId ?? "default";
      if (worldId.startsWith("_")) throw new Error('User script world IDs starting with "_" are reserved');
      const target = this.getExtensionScripts(event.extension);
      target.worlds.set(worldId, { ...properties, worldId });
      this.persistExtension(event.extension.id);
      console.info("[electron-chrome-extensions] user script world configured", {
        extensionId: event.extension.id,
        worldId,
        hasCsp: typeof properties.csp === "string",
        messaging: properties.messaging === true
      });
    });
    const handle = ctx.router.apiHandler();
    handle("userScripts.register", this.register);
    handle("userScripts.unregister", this.unregister);
    handle("userScripts.update", this.update);
    handle("userScripts.getScripts", this.getScripts);
    handle("userScripts.configureWorld", this.configureWorld);
    instances.set(ctx.session, this);
    this.installDocumentStartHandler();
    this.restoreLoadedExtensions();
    this.observeExtensions();
  }
  getStorageFilePath() {
    const storagePath = this.ctx.session.getStoragePath();
    return storagePath ? (0, import_node_path2.join)(storagePath, "electron-chrome-extensions", "user-scripts.json") : void 0;
  }
  readPersistedScripts() {
    const filePath = this.getStorageFilePath();
    if (!filePath || !(0, import_node_fs4.existsSync)(filePath)) return { version: 1, extensions: {} };
    try {
      const parsed = JSON.parse((0, import_node_fs4.readFileSync)(filePath, "utf8"));
      if (parsed.version !== 1 || !parsed.extensions || typeof parsed.extensions !== "object") {
        return { version: 1, extensions: {} };
      }
      return { version: 1, extensions: parsed.extensions };
    } catch (error) {
      console.warn("[electron-chrome-extensions] unable to read persisted user scripts", {
        filePath,
        message: error instanceof Error ? error.message : String(error)
      });
      return { version: 1, extensions: {} };
    }
  }
  persistExtension(extensionId) {
    const filePath = this.getStorageFilePath();
    if (!filePath) return;
    const persisted = this.readPersistedScripts();
    const target = this.scripts.get(extensionId);
    if (!target) {
      delete persisted.extensions[extensionId];
    } else {
      persisted.extensions[extensionId] = {
        scripts: [...target.scripts.values()],
        worlds: Object.fromEntries(target.worlds)
      };
    }
    try {
      (0, import_node_fs4.mkdirSync)((0, import_node_path2.dirname)(filePath), { recursive: true });
      (0, import_node_fs4.writeFileSync)(filePath, JSON.stringify(persisted), "utf8");
    } catch (error) {
      console.warn("[electron-chrome-extensions] unable to persist user scripts", {
        extensionId,
        filePath,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  restoreExtension(extension) {
    const saved = this.readPersistedScripts().extensions[extension.id];
    if (!saved) return;
    const target = this.getExtensionScripts(extension);
    target.scripts.clear();
    target.worlds.clear();
    target.worlds.set("default", {});
    for (const script of saved.scripts ?? []) {
      if (script.id) target.scripts.set(script.id, script);
    }
    for (const [worldId, properties] of Object.entries(saved.worlds ?? {})) {
      target.worlds.set(worldId, properties);
    }
    console.info("[electron-chrome-extensions] restored persisted user scripts", {
      extensionId: extension.id,
      scriptCount: target.scripts.size,
      storagePath: this.getStorageFilePath()
    });
    this.settleInitialization(extension.id, "restored");
  }
  restoreLoadedExtensions() {
    const sessionExtensions = this.ctx.session.extensions || this.ctx.session;
    sessionExtensions.getAllExtensions().forEach((extension) => this.restoreExtension(extension));
  }
  observeExtensions() {
    const sessionExtensions = this.ctx.session.extensions || this.ctx.session;
    sessionExtensions.on("extension-loaded", (_event, extension) => this.restoreExtension(extension));
    sessionExtensions.on("extension-unloaded", (_event, extension) => this.scripts.delete(extension.id));
  }
  getInitializationWaiter(extensionId) {
    let waiter = this.initializationWaiters.get(extensionId);
    if (!waiter) {
      waiter = { waiters: /* @__PURE__ */ new Set(), workerStarted: false };
      this.initializationWaiters.set(extensionId, waiter);
    }
    return waiter;
  }
  settleInitialization(extensionId, state) {
    const waiter = this.getInitializationWaiter(extensionId);
    if (waiter.settlementTimer) {
      clearTimeout(waiter.settlementTimer);
      waiter.settlementTimer = void 0;
    }
    const existing = waiter.settled;
    if (existing && state !== "registered") return existing;
    const result = {
      extensionId,
      scriptCount: this.scripts.get(extensionId)?.scripts.size ?? 0,
      state
    };
    waiter.settled = result;
    waiter.waiters.forEach((resolve2) => resolve2(result));
    waiter.waiters.clear();
    console.info("[electron-chrome-extensions] user scripts initialization settled", result);
    return result;
  }
  scheduleInitializationSettlement(extensionId) {
    const waiter = this.getInitializationWaiter(extensionId);
    if (waiter.settlementTimer) clearTimeout(waiter.settlementTimer);
    waiter.settlementTimer = setTimeout(() => {
      waiter.settlementTimer = void 0;
      this.settleInitialization(extensionId, "registered");
    }, 50);
  }
  async waitForExtensionInitialization(extensionId, timeoutMs = 1e4) {
    const existingScripts = this.scripts.get(extensionId)?.scripts.size ?? 0;
    const waiter = this.getInitializationWaiter(extensionId);
    if (waiter.settled?.state === "registered") return waiter.settled;
    if (existingScripts > 0) {
      const scope = `chrome-extension://${extensionId}/`;
      if (!waiter.workerStarted) {
        waiter.workerStarted = true;
        void this.ctx.session.serviceWorkers.startWorkerForScope(scope).then(
          () => console.info("[electron-chrome-extensions] MV3 worker started for restored user scripts", {
            extensionId,
            scope
          }),
          (error) => console.warn("[electron-chrome-extensions] unable to start MV3 worker for restored user scripts", {
            extensionId,
            scope,
            message: error instanceof Error ? error.message : String(error)
          })
        );
      }
      return this.settleInitialization(extensionId, "restored");
    }
    if (!waiter.workerStarted || waiter.settled?.state === "restored") {
      waiter.workerStarted = true;
      waiter.settled = void 0;
      const scope = `chrome-extension://${extensionId}/`;
      console.info("[electron-chrome-extensions] waiting for MV3 user scripts initialization", {
        extensionId,
        scope,
        timeoutMs,
        storagePath: this.getStorageFilePath()
      });
      void this.ctx.session.serviceWorkers.startWorkerForScope(scope).then(
        () => console.info("[electron-chrome-extensions] MV3 worker started for user scripts initialization", {
          extensionId,
          scope
        }),
        (error) => console.warn("[electron-chrome-extensions] unable to start MV3 worker for user scripts initialization", {
          extensionId,
          scope,
          message: error instanceof Error ? error.message : String(error)
        })
      );
    }
    return await new Promise((resolve2) => {
      const timer = setTimeout(() => {
        waiter.waiters.delete(onSettled);
        const result = {
          extensionId,
          scriptCount: this.scripts.get(extensionId)?.scripts.size ?? 0,
          state: "timed-out"
        };
        console.warn("[electron-chrome-extensions] user scripts initialization timed out", {
          ...result,
          storagePath: this.getStorageFilePath()
        });
        resolve2(result);
      }, timeoutMs);
      const onSettled = (result) => {
        clearTimeout(timer);
        resolve2(result);
      };
      waiter.waiters.add(onSettled);
    });
  }
  installDocumentStartHandler() {
    if (documentStartHandlerInstalled) return;
    documentStartHandlerInstalled = true;
    const getDocumentScripts = (event, details) => {
      const api = instances.get(event.sender.session);
      const scripts = api?.getDocumentScripts(details.url ?? "", details.topFrame === true) ?? [];
      console.info("[electron-chrome-extensions] document user scripts query", {
        webContentsId: event.sender.id,
        sessionStoragePath: event.sender.session.getStoragePath(),
        url: details.url ?? "",
        topFrame: details.topFrame === true,
        scriptCount: scripts.length
      });
      return scripts;
    };
    import_electron12.ipcMain.handle(documentStartChannel, getDocumentScripts);
    import_electron12.ipcMain.on(executionChannel, (event, details) => {
      const api = instances.get(event.sender.session);
      if (!api) return;
      console.info("[electron-chrome-extensions] user script execution", {
        webContentsId: event.sender.id,
        sessionStoragePath: event.sender.session.getStoragePath(),
        ...details
      });
    });
  }
  getExtensionScripts(extension) {
    let scripts = this.scripts.get(extension.id);
    if (!scripts) {
      scripts = {
        extension,
        scripts: /* @__PURE__ */ new Map(),
        worlds: /* @__PURE__ */ new Map([["default", {}]])
      };
      this.scripts.set(extension.id, scripts);
    }
    return scripts;
  }
  getDocumentScripts(url, topFrame) {
    if (!url) return [];
    const result = [];
    for (const [extensionId, extensionScripts] of this.scripts) {
      for (const script of extensionScripts.scripts.values()) {
        if (!script.allFrames && !topFrame) continue;
        if (!matchesScript(script, url)) continue;
        const code = getScriptCode(extensionScripts.extension, script);
        if (!code) continue;
        const configuredWorldId = script.worldId ?? "default";
        const world = script.world ?? "USER_SCRIPT";
        const worldProperties = extensionScripts.worlds.get(configuredWorldId) ?? {};
        result.push({
          code: `${code}
void 0
//# sourceURL=chrome-extension://${extensionId}/${encodeURIComponent(script.id ?? "user-script")}.user-script.js`,
          extensionId,
          runAt: script.runAt ?? "document_idle",
          scriptId: script.id,
          world,
          worldCsp: worldProperties.csp,
          worldId: createWorldId(extensionId, configuredWorldId),
          worldName: `Chrome USER_SCRIPT: ${extensionId}/${configuredWorldId}`,
          worldOrigin: `chrome-extension://${extensionId}`
        });
      }
    }
    result.sort((left, right) => {
      if (left.extensionId !== right.extensionId) {
        return left.extensionId.localeCompare(right.extensionId);
      }
      return left.scriptId.localeCompare(right.scriptId, "en", { numeric: true });
    });
    console.info("[electron-chrome-extensions] user scripts resolved for document", {
      url,
      topFrame,
      registeredExtensions: this.scripts.size,
      scripts: result.map((script) => ({
        extensionId: script.extensionId,
        scriptId: script.scriptId,
        runAt: script.runAt,
        world: script.world
      }))
    });
    return result;
  }
};

// src/browser/index.ts
function checkVersion() {
  const electronVersion = process.versions.electron;
  if (electronVersion && parseInt(electronVersion.split(".")[0], 10) < 35) {
    console.warn("electron-chrome-extensions requires electron@>=35.0.0");
  }
}
function resolvePreloadPath(modulePath) {
  try {
    return (0, import_node_module.createRequire)(__dirname).resolve("electron-chrome-extensions/preload");
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    }
  }
  const preloadFilename = "chrome-extension-api.preload.js";
  if (modulePath) {
    process.emitWarning(
      'electron-chrome-extensions: "modulePath" is deprecated and will be removed in future versions.',
      { type: "DeprecationWarning" }
    );
    return import_node_path3.default.join(modulePath, "dist", preloadFilename);
  }
  return import_node_path3.default.join(__dirname, preloadFilename);
}
var sessionMap = /* @__PURE__ */ new WeakMap();
var ElectronChromeExtensions = class _ElectronChromeExtensions extends import_node_events4.EventEmitter {
  constructor(opts) {
    super();
    __publicField(this, "ctx");
    __publicField(this, "preloadReady");
    __publicField(this, "api");
    const { license, session: session2 = import_electron13.session.defaultSession, ...impl } = opts || {};
    checkVersion();
    checkLicense(license);
    if (sessionMap.has(session2)) {
      throw new Error(`Extensions instance already exists for the given session`);
    }
    sessionMap.set(session2, this);
    const router = new ExtensionRouter(session2);
    const store = new ExtensionStore(impl);
    this.ctx = {
      emit: this.emit.bind(this),
      router,
      session: session2,
      store
    };
    this.api = {
      browserAction: new BrowserActionAPI(this.ctx),
      contextMenus: new ContextMenusAPI(this.ctx),
      commands: new CommandsAPI(this.ctx),
      cookies: new CookiesAPI(this.ctx),
      notifications: new NotificationsAPI(this.ctx),
      permissions: new PermissionsAPI(this.ctx),
      userScripts: new UserScriptsAPI(this.ctx),
      runtime: new RuntimeAPI(this.ctx),
      tabs: new TabsAPI(this.ctx),
      webNavigation: new WebNavigationAPI(this.ctx),
      windows: new WindowsAPI(this.ctx)
    };
    this.listenForExtensions();
    this.preloadReady = this.prependPreload(opts.modulePath);
  }
  /** Retrieve an instance of this class associated with the given session. */
  static fromSession(session2) {
    return sessionMap.get(session2);
  }
  /**
   * Handles the 'crx://' protocol in the session.
   *
   * This is required to display <browser-action-list> extension icons.
   */
  static handleCRXProtocol(session2) {
    if (session2.protocol.isProtocolHandled("crx")) {
      session2.protocol.unhandle("crx");
    }
    session2.protocol.handle("crx", function handleCRXRequest(request) {
      let url;
      try {
        url = new URL(request.url);
      } catch {
        return new Response("Invalid URL", { status: 404 });
      }
      const partition = url?.searchParams.get("partition") || "_self";
      const remoteSession = partition === "_self" ? session2 : resolvePartition(partition);
      const extensions = _ElectronChromeExtensions.fromSession(remoteSession);
      if (!extensions) {
        return new Response(`ElectronChromeExtensions not found for "${partition}"`, {
          status: 404
        });
      }
      return extensions.api.browserAction.handleCRXRequest(request);
    });
  }
  /** Resolves after extension preload scripts are registered for the session. */
  whenReady() {
    return this.preloadReady;
  }
  /** Wait for an MV3 extension's initial chrome.userScripts registration. */
  whenUserScriptsReady(extensionId, timeoutMs) {
    return this.api.userScripts.waitForExtensionInitialization(extensionId, timeoutMs);
  }
  listenForExtensions() {
    const sessionExtensions = this.ctx.session.extensions || this.ctx.session;
    sessionExtensions.addListener("extension-loaded", (_event, extension) => {
      readLoadedExtensionManifest(this.ctx, extension);
    });
  }
  async prependPreload(modulePath) {
    const { session: session2 } = this.ctx;
    const preloadPath = resolvePreloadPath(modulePath);
    if ("registerPreloadScript" in session2) {
      await session2.registerPreloadScript({
        id: "crx-mv2-preload",
        type: "frame",
        filePath: preloadPath
      });
      await session2.registerPreloadScript({
        id: "crx-mv3-preload",
        type: "service-worker",
        filePath: preloadPath
      });
    } else {
      session2.setPreloads([...session2.getPreloads(), preloadPath]);
    }
    if (!(0, import_node_fs5.existsSync)(preloadPath)) {
      console.error(
        new Error(
          `electron-chrome-extensions: Preload file not found at "${preloadPath}". See "Packaging the preload script" in the readme.`
        )
      );
    }
  }
  checkWebContentsArgument(wc) {
    if (this.ctx.session !== wc.session) {
      throw new TypeError(
        "Invalid WebContents argument. Its session must match the session provided to ElectronChromeExtensions constructor options."
      );
    }
  }
  /** Add webContents to be tracked as a tab. */
  addTab(tab, window) {
    this.checkWebContentsArgument(tab);
    this.ctx.store.addTab(tab, window);
  }
  /** Remove webContents from being tracked as a tab. */
  removeTab(tab) {
    this.checkWebContentsArgument(tab);
    this.ctx.store.removeTab(tab);
  }
  /** Notify extension system that the active tab has changed. */
  selectTab(tab) {
    this.checkWebContentsArgument(tab);
    if (this.ctx.store.tabs.has(tab)) {
      this.api.tabs.onActivated(tab.id);
    }
  }
  /**
   * Add webContents to be tracked as an extension host which will receive
   * extension events when a chrome-extension:// resource is loaded.
   *
   * This is usually reserved for extension background pages and popups, but
   * can also be used in other special cases.
   *
   * @deprecated Extension hosts are now tracked lazily when they send
   * extension IPCs to the main process.
   */
  addExtensionHost(host) {
    console.warn("ElectronChromeExtensions.addExtensionHost() is deprecated");
  }
  /**
   * Get collection of menu items managed by the `chrome.contextMenus` API.
   * @see https://developer.chrome.com/extensions/contextMenus
   */
  getContextMenuItems(webContents2, params) {
    this.checkWebContentsArgument(webContents2);
    return this.api.contextMenus.buildMenuItemsForParams(webContents2, params);
  }
  /**
   * Gets map of special pages to extension override URLs.
   *
   * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/chrome_url_overrides
   */
  getURLOverrides() {
    return this.ctx.store.urlOverrides;
  }
  /**
   * Handles the 'crx://' protocol in the session.
   *
   * @deprecated Call `ElectronChromeExtensions.handleCRXProtocol(session)`
   * instead. The CRX protocol is no longer one-to-one with
   * ElectronChromeExtensions instances. Instead, it should now be handled only
   * on the sessions where <browser-action-list> extension icons will be shown.
   */
  handleCRXProtocol(session2) {
    throw new Error(
      "extensions.handleCRXProtocol(session) is deprecated, call ElectronChromeExtensions.handleCRXProtocol(session) instead."
    );
  }
  /**
   * Add extensions to be visible as an extension action button.
   *
   * @deprecated Not needed in Electron >=12.
   */
  addExtension(extension) {
    console.warn("ElectronChromeExtensions.addExtension() is deprecated");
    this.api.browserAction.processExtension(extension);
  }
  /**
   * Remove extensions from the list of visible extension action buttons.
   *
   * @deprecated Not needed in Electron >=12.
   */
  removeExtension(extension) {
    console.warn("ElectronChromeExtensions.removeExtension() is deprecated");
    this.api.browserAction.removeActions(extension.id);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ElectronChromeExtensions,
  setSessionPartitionResolver
});
//# sourceMappingURL=index.js.map
