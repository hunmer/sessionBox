"use strict";

// src/renderer/index.ts
var import_electron2 = require("electron");

// src/renderer/event.ts
var import_electron = require("electron");
var formatIpcName = (name) => `crx-${name}`;
var shouldLogExtensionEvents = process.env.ELECTRON_CHROME_EXTENSIONS_DEBUG === "1";
var listenerMap = /* @__PURE__ */ new Map();
var addExtensionListener = (extensionId, name, callback) => {
  if (name === "runtime.onMessage" || name === "runtime.onConnect") {
    console.info("[electron-chrome-extensions] registering extension listener", { extensionId, name });
  }
  const listenerCount = listenerMap.get(name) || 0;
  if (listenerCount === 0) {
    import_electron.ipcRenderer.send("crx-add-listener", extensionId, name);
  }
  listenerMap.set(name, listenerCount + 1);
  import_electron.ipcRenderer.addListener(formatIpcName(name), function(event, ...args) {
    if (shouldLogExtensionEvents) {
      console.log(name, "(result)", ...args);
    }
    callback(...args);
  });
};
var removeExtensionListener = (extensionId, name, callback) => {
  if (listenerMap.has(name)) {
    const listenerCount = listenerMap.get(name) || 0;
    if (listenerCount <= 1) {
      listenerMap.delete(name);
      import_electron.ipcRenderer.send("crx-remove-listener", extensionId, name);
    } else {
      listenerMap.set(name, listenerCount - 1);
    }
  }
  import_electron.ipcRenderer.removeListener(formatIpcName(name), callback);
};

// src/renderer/index.ts
var shouldLogExtensionApi = process.env.ELECTRON_CHROME_EXTENSIONS_DEBUG === "1";
var injectExtensionAPIs = () => {
  if (process.type === "service-worker") {
    const runtime = globalThis.chrome?.runtime;
    console.info("[electron-chrome-extensions] service worker API injection started", {
      contextIsolated: process.contextIsolated,
      hasChrome: Boolean(globalThis.chrome),
      hasRuntime: Boolean(runtime),
      hasOnInstalled: Boolean(runtime?.onInstalled),
      onInstalledAddListener: typeof runtime?.onInstalled?.addListener
    });
  }
  const invokeExtension = async function(extensionId, fnName, options = {}, ...args) {
    const callback = typeof args[args.length - 1] === "function" ? args.pop() : void 0;
    if (shouldLogExtensionApi) {
      console.log(fnName, args);
    }
    if (options.noop) {
      console.warn(`${fnName} is not yet implemented.`);
      if (callback) callback(options.defaultResponse);
      return Promise.resolve(options.defaultResponse);
    }
    if (options.serialize) {
      args = options.serialize(...args);
    }
    let result;
    try {
      result = await import_electron2.ipcRenderer.invoke("crx-msg", extensionId, fnName, ...args);
    } catch (e) {
      console.error(e);
      result = void 0;
    }
    if (shouldLogExtensionApi) {
      console.log(fnName, "(result)", result);
    }
    if (callback) {
      callback(result);
    } else {
      return result;
    }
  };
  const connectNative = (extensionId, application, receive, disconnect, callback) => {
    const connectionId = import_electron2.contextBridge.executeInMainWorld({
      func: () => crypto.randomUUID()
    });
    invokeExtension(extensionId, "runtime.connectNative", {}, connectionId, application);
    const onMessage = (_event, message) => {
      receive(message);
    };
    import_electron2.ipcRenderer.on(`crx-native-msg-${connectionId}`, onMessage);
    import_electron2.ipcRenderer.once(`crx-native-msg-${connectionId}-disconnect`, () => {
      import_electron2.ipcRenderer.off(`crx-native-msg-${connectionId}`, onMessage);
      disconnect();
    });
    const send = (message) => {
      import_electron2.ipcRenderer.send(`crx-native-msg-${connectionId}`, message);
    };
    callback(connectionId, send);
  };
  const disconnectNative = (extensionId, connectionId) => {
    invokeExtension(extensionId, "runtime.disconnectNative", {}, connectionId);
  };
  const electronContext = {
    invokeExtension,
    addExtensionListener,
    removeExtensionListener,
    sendUserScriptMessageResponse: (requestId, response) => {
      import_electron2.ipcRenderer.send("crx-user-script-message-response", { requestId, response });
    },
    connectNative,
    disconnectNative
  };
  function mainWorldScript() {
    const electron = globalThis.electron || electronContext;
    const chrome = globalThis.chrome || {};
    const extensionId = chrome.runtime?.id;
    const manifest = extensionId && chrome.runtime.getManifest?.() || {};
    const invokeExtension2 = (fnName, opts = {}) => (...args) => electron.invokeExtension(extensionId, fnName, opts, ...args);
    function imageData2base64(imageData) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      ctx.putImageData(imageData, 0, 0);
      return canvas.toDataURL();
    }
    class ExtensionEvent {
      constructor(name) {
        this.name = name;
      }
      addListener(callback) {
        let listener = callback;
        if (this.name === "runtime.onMessage") {
          console.info("[electron-chrome-extensions] registering runtime message listener", { extensionId });
        }
        if (this.name === "runtime.onConnect") {
          listener = (descriptor) => callback(new RuntimePort(descriptor?.portId, descriptor?.name));
        } else if (this.name === "runtime.onMessage") {
          listener = (message, sender, requestId) => {
            let responded = false;
            const sendResponse = (response) => {
              if (responded) return;
              responded = true;
              electron.sendUserScriptMessageResponse(requestId, response);
            };
            return callback(message, sender, sendResponse);
          };
        }
        electron.addExtensionListener(extensionId, this.name, listener);
      }
      removeListener(callback) {
        electron.removeExtensionListener(extensionId, this.name, callback);
      }
      getRules(ruleIdentifiers, callback) {
        throw new Error("Method not implemented.");
      }
      hasListener(callback) {
        throw new Error("Method not implemented.");
      }
      removeRules(ruleIdentifiers, callback) {
        throw new Error("Method not implemented.");
      }
      addRules(rules, callback) {
        throw new Error("Method not implemented.");
      }
      hasListeners() {
        throw new Error("Method not implemented.");
      }
    }
    class ChromeSetting {
      set() {
      }
      get() {
      }
      clear() {
      }
      onChange = {
        addListener: () => {
        }
      };
    }
    class Event2 {
      listeners = [];
      get _listeners() {
        return this.listeners;
      }
      _emit(...args) {
        this.listeners.forEach((listener) => {
          listener(...args);
        });
      }
      addListener(callback) {
        this.listeners.push(callback);
      }
      removeListener(callback) {
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
          this.listeners.splice(index, 1);
        }
      }
    }
    class NativePort {
      connectionId = "";
      connected = false;
      pending = [];
      name = "";
      _init = (connectionId, send) => {
        this.connected = true;
        this.connectionId = connectionId;
        this._send = send;
        this.pending.forEach((msg) => this.postMessage(msg));
        this.pending = [];
        Object.defineProperty(this, "_init", { value: void 0 });
      };
      _send(message) {
        this.pending.push(message);
      }
      _receive(message) {
        ;
        this.onMessage._emit(message);
      }
      _disconnect() {
        this.disconnect();
      }
      postMessage(message) {
        this._send(message);
      }
      disconnect() {
        if (this.connected) {
          electron.disconnectNative(extensionId, this.connectionId);
          this.onDisconnect._emit();
          this.connected = false;
        }
      }
      onMessage = new Event2();
      onDisconnect = new Event2();
    }
    class RuntimePort {
      constructor(portId, name = "") {
        this.portId = portId;
        this.name = name;
        electron.addExtensionListener(extensionId, `runtime.portMessage:${portId}`, (message) => {
          ;
          this.onMessage._emit(message, this);
        });
        electron.addExtensionListener(extensionId, `runtime.portDisconnect:${portId}`, () => {
          if (this.disconnected) return;
          this.disconnected = true;
          this.onDisconnect._emit(this);
        });
      }
      name;
      onMessage = new Event2();
      onDisconnect = new Event2();
      onError = new Event2();
      disconnected = false;
      postMessage(message) {
        if (this.disconnected) return;
        void electron.invokeExtension(extensionId, "runtime.portPostMessage", {}, this.portId, message);
      }
      disconnect() {
        if (this.disconnected) return;
        this.disconnected = true;
        void electron.invokeExtension(extensionId, "runtime.disconnectPort", {}, this.portId);
        this.onDisconnect._emit(this);
      }
    }
    const browserActionFactory = (base) => {
      const api = {
        ...base,
        setTitle: invokeExtension2("browserAction.setTitle"),
        getTitle: invokeExtension2("browserAction.getTitle"),
        setIcon: invokeExtension2("browserAction.setIcon", {
          serialize: (details) => {
            if (details.imageData) {
              if (manifest.manifest_version === 3) {
                console.warn(
                  "action.setIcon with imageData is not yet supported by electron-chrome-extensions"
                );
                details.imageData = void 0;
              } else if (details.imageData instanceof ImageData) {
                details.imageData = imageData2base64(details.imageData);
              } else {
                details.imageData = Object.entries(details.imageData).reduce(
                  (obj, pair) => {
                    obj[pair[0]] = imageData2base64(pair[1]);
                    return obj;
                  },
                  {}
                );
              }
            }
            return [details];
          }
        }),
        setPopup: invokeExtension2("browserAction.setPopup"),
        getPopup: invokeExtension2("browserAction.getPopup"),
        setBadgeText: invokeExtension2("browserAction.setBadgeText"),
        getBadgeText: invokeExtension2("browserAction.getBadgeText"),
        setBadgeBackgroundColor: invokeExtension2("browserAction.setBadgeBackgroundColor"),
        getBadgeBackgroundColor: invokeExtension2("browserAction.getBadgeBackgroundColor"),
        getUserSettings: invokeExtension2("browserAction.getUserSettings"),
        enable: invokeExtension2("browserAction.enable", { noop: true }),
        disable: invokeExtension2("browserAction.disable", { noop: true }),
        openPopup: invokeExtension2("browserAction.openPopup"),
        onClicked: new ExtensionEvent("browserAction.onClicked")
      };
      return api;
    };
    const runtimeMessageEvent = new ExtensionEvent("runtime.onMessage");
    const runtimeConnectEvent = new ExtensionEvent("runtime.onConnect");
    const apiDefinitions = {
      action: {
        shouldInject: () => manifest.manifest_version === 3 && !!manifest.action,
        factory: browserActionFactory
      },
      browserAction: {
        shouldInject: () => manifest.manifest_version === 2 && !!manifest.browser_action,
        factory: browserActionFactory
      },
      commands: {
        factory: (base) => {
          return {
            ...base,
            getAll: invokeExtension2("commands.getAll"),
            onCommand: new ExtensionEvent("commands.onCommand")
          };
        }
      },
      contextMenus: {
        factory: (base) => {
          let menuCounter = 0;
          const menuCallbacks = {};
          const menuCreate = invokeExtension2("contextMenus.create");
          let hasInternalListener = false;
          const addInternalListener = () => {
            api.onClicked.addListener((info, tab) => {
              const callback = menuCallbacks[info.menuItemId];
              if (callback && tab) callback(info, tab);
            });
            hasInternalListener = true;
          };
          const api = {
            ...base,
            create: function(createProperties, callback) {
              if (typeof createProperties.id === "undefined") {
                createProperties.id = `${++menuCounter}`;
              }
              if (createProperties.onclick) {
                if (!hasInternalListener) addInternalListener();
                menuCallbacks[createProperties.id] = createProperties.onclick;
                delete createProperties.onclick;
              }
              menuCreate(createProperties, callback);
              return createProperties.id;
            },
            update: invokeExtension2("contextMenus.update", { noop: true }),
            remove: invokeExtension2("contextMenus.remove"),
            removeAll: invokeExtension2("contextMenus.removeAll"),
            onClicked: new ExtensionEvent("contextMenus.onClicked")
          };
          return api;
        }
      },
      cookies: {
        factory: (base) => {
          return {
            ...base,
            get: invokeExtension2("cookies.get"),
            getAll: invokeExtension2("cookies.getAll"),
            set: invokeExtension2("cookies.set"),
            remove: invokeExtension2("cookies.remove"),
            getAllCookieStores: invokeExtension2("cookies.getAllCookieStores"),
            onChanged: new ExtensionEvent("cookies.onChanged")
          };
        }
      },
      // TODO: implement
      downloads: {
        factory: (base) => {
          return {
            ...base,
            acceptDanger: invokeExtension2("downloads.acceptDanger", { noop: true }),
            cancel: invokeExtension2("downloads.cancel", { noop: true }),
            download: invokeExtension2("downloads.download", { noop: true }),
            erase: invokeExtension2("downloads.erase", { noop: true }),
            getFileIcon: invokeExtension2("downloads.getFileIcon", { noop: true }),
            open: invokeExtension2("downloads.open", { noop: true }),
            pause: invokeExtension2("downloads.pause", { noop: true }),
            removeFile: invokeExtension2("downloads.removeFile", { noop: true }),
            resume: invokeExtension2("downloads.resume", { noop: true }),
            search: invokeExtension2("downloads.search", { noop: true }),
            setUiOptions: invokeExtension2("downloads.setUiOptions", { noop: true }),
            show: invokeExtension2("downloads.show", { noop: true }),
            showDefaultFolder: invokeExtension2("downloads.showDefaultFolder", { noop: true }),
            onChanged: new ExtensionEvent("downloads.onChanged"),
            onCreated: new ExtensionEvent("downloads.onCreated"),
            onDeterminingFilename: new ExtensionEvent("downloads.onDeterminingFilename"),
            onErased: new ExtensionEvent("downloads.onErased")
          };
        }
      },
      extension: {
        factory: (base) => {
          return {
            ...base,
            ...manifest.manifest_version === 3 ? {
              sendMessage: invokeExtension2("runtime.sendMessage"),
              onMessage: runtimeMessageEvent,
              onConnect: runtimeConnectEvent
            } : {},
            isAllowedFileSchemeAccess: invokeExtension2("extension.isAllowedFileSchemeAccess", {
              noop: true,
              defaultResponse: false
            }),
            isAllowedIncognitoAccess: invokeExtension2("extension.isAllowedIncognitoAccess", {
              noop: true,
              defaultResponse: false
            }),
            // TODO: Add native implementation
            getViews: () => []
          };
        }
      },
      i18n: {
        shouldInject: () => manifest.manifest_version === 3,
        factory: (base) => {
          if (base.getMessage) {
            return base;
          }
          return {
            ...base,
            getUILanguage: () => "en-US",
            getAcceptLanguages: (callback) => {
              const results = ["en-US"];
              if (callback) {
                queueMicrotask(() => callback(results));
              }
              return Promise.resolve(results);
            },
            getMessage: (messageName) => messageName
          };
        }
      },
      notifications: {
        factory: (base) => {
          return {
            ...base,
            clear: invokeExtension2("notifications.clear"),
            create: invokeExtension2("notifications.create"),
            getAll: invokeExtension2("notifications.getAll"),
            getPermissionLevel: invokeExtension2("notifications.getPermissionLevel"),
            update: invokeExtension2("notifications.update"),
            onClicked: new ExtensionEvent("notifications.onClicked"),
            onButtonClicked: new ExtensionEvent("notifications.onButtonClicked"),
            onClosed: new ExtensionEvent("notifications.onClosed")
          };
        }
      },
      permissions: {
        factory: (base) => {
          return {
            ...base,
            contains: invokeExtension2("permissions.contains"),
            getAll: invokeExtension2("permissions.getAll"),
            remove: invokeExtension2("permissions.remove"),
            request: invokeExtension2("permissions.request"),
            onAdded: new ExtensionEvent("permissions.onAdded"),
            onRemoved: new ExtensionEvent("permissions.onRemoved")
          };
        }
      },
      userScripts: {
        factory: (base) => ({
          ...base,
          register: invokeExtension2("userScripts.register"),
          unregister: invokeExtension2("userScripts.unregister"),
          update: invokeExtension2("userScripts.update"),
          getScripts: invokeExtension2("userScripts.getScripts"),
          configureWorld: invokeExtension2("userScripts.configureWorld")
        })
      },
      privacy: {
        factory: (base) => {
          return {
            ...base,
            network: {
              networkPredictionEnabled: new ChromeSetting(),
              webRTCIPHandlingPolicy: new ChromeSetting()
            },
            services: {
              autofillAddressEnabled: new ChromeSetting(),
              autofillCreditCardEnabled: new ChromeSetting(),
              passwordSavingEnabled: new ChromeSetting()
            },
            websites: {
              hyperlinkAuditingEnabled: new ChromeSetting()
            }
          };
        }
      },
      runtime: {
        factory: (base) => {
          return {
            ...base,
            // Electron dispatches the native event every time an extension is
            // loaded into a Session. The bridge emits this event only for a
            // real install or manifest version change instead.
            onInstalled: new ExtensionEvent("runtime.onInstalled"),
            ...manifest.manifest_version === 3 ? {
              onMessage: runtimeMessageEvent,
              onConnect: runtimeConnectEvent,
              sendMessage: invokeExtension2("runtime.sendMessage")
            } : {},
            connectNative: (application) => {
              const port = new NativePort();
              const receive = port._receive.bind(port);
              const disconnect = port._disconnect.bind(port);
              const callback = (connectionId, send) => {
                port._init(connectionId, send);
              };
              electron.connectNative(extensionId, application, receive, disconnect, callback);
              return port;
            },
            openOptionsPage: invokeExtension2("runtime.openOptionsPage"),
            sendNativeMessage: invokeExtension2("runtime.sendNativeMessage")
          };
        }
      },
      storage: {
        factory: (base) => {
          const local = base && base.local;
          return {
            ...base,
            // TODO: provide a backend for browsers to opt-in to
            managed: local,
            sync: local
          };
        }
      },
      tabs: {
        factory: (base) => {
          const api = {
            ...base,
            create: invokeExtension2("tabs.create"),
            executeScript: async function(arg1, arg2, arg3) {
              if (typeof arg1 === "object") {
                const [activeTab] = await api.query({
                  active: true,
                  windowId: chrome.windows.WINDOW_ID_CURRENT
                });
                return api.executeScript(activeTab.id, arg1, arg2);
              } else {
                return base.executeScript(
                  arg1,
                  arg2,
                  arg3
                );
              }
            },
            get: invokeExtension2("tabs.get"),
            sendMessage: invokeExtension2("tabs.sendMessage"),
            getCurrent: invokeExtension2("tabs.getCurrent"),
            getAllInWindow: invokeExtension2("tabs.getAllInWindow"),
            insertCSS: invokeExtension2("tabs.insertCSS"),
            query: invokeExtension2("tabs.query"),
            reload: invokeExtension2("tabs.reload"),
            update: invokeExtension2("tabs.update"),
            remove: invokeExtension2("tabs.remove"),
            goBack: invokeExtension2("tabs.goBack"),
            goForward: invokeExtension2("tabs.goForward"),
            onCreated: new ExtensionEvent("tabs.onCreated"),
            onRemoved: new ExtensionEvent("tabs.onRemoved"),
            onUpdated: new ExtensionEvent("tabs.onUpdated"),
            onActivated: new ExtensionEvent("tabs.onActivated"),
            onReplaced: new ExtensionEvent("tabs.onReplaced")
          };
          return api;
        }
      },
      topSites: {
        factory: () => {
          return {
            get: invokeExtension2("topSites.get", { noop: true, defaultResponse: [] })
          };
        }
      },
      webNavigation: {
        factory: (base) => {
          return {
            ...base,
            getFrame: invokeExtension2("webNavigation.getFrame"),
            getAllFrames: invokeExtension2("webNavigation.getAllFrames"),
            onBeforeNavigate: new ExtensionEvent("webNavigation.onBeforeNavigate"),
            onCommitted: new ExtensionEvent("webNavigation.onCommitted"),
            onCompleted: new ExtensionEvent("webNavigation.onCompleted"),
            onCreatedNavigationTarget: new ExtensionEvent(
              "webNavigation.onCreatedNavigationTarget"
            ),
            onDOMContentLoaded: new ExtensionEvent("webNavigation.onDOMContentLoaded"),
            onErrorOccurred: new ExtensionEvent("webNavigation.onErrorOccurred"),
            onHistoryStateUpdated: new ExtensionEvent("webNavigation.onHistoryStateUpdated"),
            onReferenceFragmentUpdated: new ExtensionEvent(
              "webNavigation.onReferenceFragmentUpdated"
            ),
            onTabReplaced: new ExtensionEvent("webNavigation.onTabReplaced")
          };
        }
      },
      webRequest: {
        factory: (base) => {
          return {
            ...base,
            onHeadersReceived: new ExtensionEvent("webRequest.onHeadersReceived")
          };
        }
      },
      windows: {
        factory: (base) => {
          return {
            ...base,
            WINDOW_ID_NONE: -1,
            WINDOW_ID_CURRENT: -2,
            get: invokeExtension2("windows.get"),
            getCurrent: invokeExtension2("windows.getCurrent"),
            getLastFocused: invokeExtension2("windows.getLastFocused"),
            getAll: invokeExtension2("windows.getAll"),
            create: invokeExtension2("windows.create"),
            update: invokeExtension2("windows.update"),
            remove: invokeExtension2("windows.remove"),
            onCreated: new ExtensionEvent("windows.onCreated"),
            onRemoved: new ExtensionEvent("windows.onRemoved"),
            onFocusChanged: new ExtensionEvent("windows.onFocusChanged"),
            onBoundsChanged: new ExtensionEvent("windows.onBoundsChanged")
          };
        }
      }
    };
    Object.keys(apiDefinitions).forEach((key) => {
      const apiName = key;
      const baseApi = chrome[apiName];
      const api = apiDefinitions[apiName];
      if (api.shouldInject && !api.shouldInject()) return;
      const extensionApi = api.factory(baseApi);
      if (baseApi && (typeof baseApi === "object" || typeof baseApi === "function")) {
        try {
          Object.assign(baseApi, extensionApi);
        } catch {
        }
        if (apiName === "tabs" && baseApi.sendMessage !== extensionApi.sendMessage) {
          try {
            Object.defineProperty(chrome, apiName, {
              value: extensionApi,
              enumerable: true,
              configurable: true,
              writable: true
            });
          } catch {
          }
        }
      } else {
        Object.defineProperty(chrome, apiName, {
          value: extensionApi,
          enumerable: true,
          configurable: true
        });
      }
    });
    try {
      const runtime = chrome.runtime;
      const extension = chrome.extension;
      if (runtime && extension) {
        Object.defineProperty(extension, "onMessage", {
          value: runtime.onMessage,
          configurable: true,
          writable: true
        });
        Object.defineProperty(extension, "onConnect", {
          value: runtime.onConnect,
          configurable: true,
          writable: true
        });
        Object.defineProperty(extension, "sendMessage", {
          value: runtime.sendMessage,
          configurable: true,
          writable: true
        });
      }
    } catch {
    }
    delete globalThis.electron;
    Object.freeze(chrome);
  }
  if (!process.contextIsolated) {
    console.warn(`injectExtensionAPIs: context isolation disabled in ${location.href}`);
    mainWorldScript();
    return;
  }
  try {
    import_electron2.contextBridge.exposeInMainWorld("electron", electronContext);
    if ("executeInMainWorld" in import_electron2.contextBridge) {
      ;
      import_electron2.contextBridge.executeInMainWorld({
        func: mainWorldScript
      });
    } else {
      import_electron2.webFrame.executeJavaScript(`(${mainWorldScript}());`);
    }
  } catch (error) {
    console.error(`injectExtensionAPIs error (${location.href})`);
    console.error(error);
  }
};

// src/renderer/user-scripts.ts
var import_electron3 = require("electron");
var documentStartChannel = "crx-user-scripts:document-start";
var executionChannel = "crx-user-scripts:execution";
var executionTimeoutMs = 5e3;
var userScriptMessageChannel = "crx-user-scripts:runtime-message";
var userScriptMessageResponseChannel = "crx-user-scripts:runtime-message-response";
var userScriptPortConnectChannel = "crx-user-scripts:runtime-port-connect";
var userScriptPortConnectResponseChannel = "crx-user-scripts:runtime-port-connect-response";
var userScriptPortMessageChannel = "crx-user-scripts:runtime-port-message";
var userScriptPortDisconnectChannel = "crx-user-scripts:runtime-port-disconnect";
var tabsMessageChannel = "crx-user-scripts:tabs-message";
var tabsMessageResponseChannel = "crx-user-scripts:tabs-message-response";
var userScriptMessageBridgeInstalled = false;
var exposedWorlds = /* @__PURE__ */ new Set();
function exposeUserScriptBridge(worldId, extensionId) {
  if (exposedWorlds.has(worldId) || !process.contextIsolated) return;
  exposedWorlds.add(worldId);
  import_electron3.contextBridge.exposeInIsolatedWorld(worldId, "electronUserScripts", {
    sendMessage: (message) => import_electron3.ipcRenderer.invoke("crx-msg", extensionId, "runtime.sendMessage", message),
    connect: async (name, onMessage, onDisconnect) => {
      const requestedId = Math.random().toString(36).slice(2);
      const result = await import_electron3.ipcRenderer.invoke("crx-msg", extensionId, "runtime.connectPort", requestedId, name);
      const portId = result.portId;
      const messageChannel = "crx-user-scripts:runtime-port-message";
      const disconnectChannel = "crx-user-scripts:runtime-port-disconnect";
      const messageListener = (_event, details) => {
        if (details?.portId === portId) onMessage(details.message);
      };
      const disconnectListener = (_event, details) => {
        if (details?.portId !== portId) return;
        import_electron3.ipcRenderer.off(messageChannel, messageListener);
        import_electron3.ipcRenderer.off(disconnectChannel, disconnectListener);
        onDisconnect();
      };
      import_electron3.ipcRenderer.on(messageChannel, messageListener);
      import_electron3.ipcRenderer.on(disconnectChannel, disconnectListener);
      return portId;
    },
    postMessage: (portId, message) => import_electron3.ipcRenderer.invoke("crx-msg", extensionId, "runtime.portPostMessage", portId, message),
    disconnect: (portId) => import_electron3.ipcRenderer.invoke("crx-msg", extensionId, "runtime.disconnectPort", portId)
  });
}
function installUserScriptMessageBridge() {
  if (userScriptMessageBridgeInstalled) return;
  userScriptMessageBridgeInstalled = true;
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== "electron-chrome-extensions-user-script" || typeof data.channel !== "string") return;
    document.dispatchEvent(new CustomEvent(data.channel, { detail: data.detail }));
  });
  const postToUserScript = (channel, detail) => {
    const carrier = document.createElement("meta");
    carrier.dataset.crxUserScriptBridge = JSON.stringify(detail);
    document.documentElement.appendChild(carrier);
    carrier.dispatchEvent(new Event(channel, { bubbles: true }));
    carrier.remove();
  };
  document.addEventListener(userScriptMessageChannel, (event) => {
    const detail = event.target?.dataset?.crxUserScriptBridge ?? event.detail;
    if (typeof detail !== "string") return;
    let request;
    try {
      request = JSON.parse(detail);
    } catch {
      return;
    }
    if (!request.id || !request.extensionId) return;
    void import_electron3.ipcRenderer.invoke("crx-msg", request.extensionId, "runtime.sendMessage", request.message).then(
      (response) => {
        postToUserScript(userScriptMessageResponseChannel, { id: request.id, response });
      },
      () => {
        postToUserScript(userScriptMessageResponseChannel, { id: request.id });
      }
    );
  });
  document.addEventListener(userScriptPortConnectChannel, (event) => {
    const detail = event.target?.dataset?.crxUserScriptBridge ?? event.detail;
    if (typeof detail !== "string") return;
    let request;
    try {
      request = JSON.parse(detail);
    } catch {
      return;
    }
    if (!request.id || !request.extensionId) return;
    void import_electron3.ipcRenderer.invoke("crx-msg", request.extensionId, "runtime.connectPort", request.id, request.name || "").then(
      (response) => postToUserScript(userScriptPortConnectResponseChannel, { id: request.id, ...response }),
      () => postToUserScript(userScriptPortConnectResponseChannel, { id: request.id, error: true })
    );
  });
  document.addEventListener(userScriptPortMessageChannel, (event) => {
    const detail = event.target?.dataset?.crxUserScriptBridge ?? event.detail;
    if (typeof detail !== "string") return;
    try {
      const request = JSON.parse(detail);
      if (request.portId) void import_electron3.ipcRenderer.invoke("crx-msg", request.extensionId, "runtime.portPostMessage", request.portId, request.message);
    } catch {
    }
  });
  document.addEventListener(userScriptPortDisconnectChannel, (event) => {
    const detail = event.target?.dataset?.crxUserScriptBridge ?? event.detail;
    if (typeof detail !== "string") return;
    try {
      const request = JSON.parse(detail);
      if (request.portId) void import_electron3.ipcRenderer.invoke("crx-msg", request.extensionId, "runtime.disconnectPort", request.portId);
    } catch {
    }
  });
  import_electron3.ipcRenderer.on("crx-user-scripts:runtime-port-message", (_event, detail) => {
    postToUserScript(userScriptPortMessageChannel, detail);
  });
  import_electron3.ipcRenderer.on("crx-user-scripts:runtime-port-disconnect", (_event, detail) => {
    postToUserScript(userScriptPortDisconnectChannel, detail);
  });
  import_electron3.ipcRenderer.on(tabsMessageChannel, (_event, detail) => {
    postToUserScript(tabsMessageChannel, detail);
  });
  document.addEventListener(tabsMessageResponseChannel, (event) => {
    const detail = event.target?.dataset?.crxUserScriptBridge ?? event.detail;
    if (typeof detail !== "string") return;
    try {
      import_electron3.ipcRenderer.send("crx-tabs-message-response", JSON.parse(detail));
    } catch {
    }
  });
}
function canInjectHere() {
  try {
    return ["http:", "https:", "file:"].includes(new URL(location.href).protocol);
  } catch {
    return false;
  }
}
function report(script, status, error) {
  import_electron3.ipcRenderer.send(executionChannel, {
    extensionId: script.extensionId,
    scriptId: script.scriptId,
    runAt: script.runAt,
    status,
    url: location.href,
    ...error ? { error: error instanceof Error ? error.message : String(error) } : {}
  });
}
function createUserScriptRuntimePrelude(extensionId) {
  const serializedId = JSON.stringify(extensionId);
  return `
(() => {
  const root = globalThis
  const chrome = root.chrome || (root.chrome = {})
  const runtime = chrome.runtime || (chrome.runtime = {})
  const nativeBridge = root.electronUserScripts
  const postBridge = (channel, detail) => {
    const carrier = document.createElement('meta')
    carrier.dataset.crxUserScriptBridge = JSON.stringify(detail)
    document.documentElement.appendChild(carrier)
    carrier.dispatchEvent(new Event(channel, { bubbles: true }))
    carrier.remove()
  }
  const addBridgeListener = (channel, listener) => {
    const wrapped = (event) => {
      const detail = event.target?.dataset?.crxUserScriptBridge
      if (detail) listener({ detail })
    }
    document.addEventListener(channel, wrapped)
    return () => document.removeEventListener(channel, wrapped)
  }
  const createEvent = () => {
    const listeners = []
    return {
      addListener(listener) {
        if (typeof listener === 'function' && !listeners.includes(listener)) listeners.push(listener)
      },
      removeListener(listener) {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      },
      hasListener(listener) {
        return listeners.includes(listener)
      },
      hasListeners() {
        return listeners.length > 0
      },
      emit(...args) {
        listeners.slice().forEach((listener) => listener(...args))
      }
    }
  }
  const noopAsync = (...args) => {
    const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined
    if (callback) queueMicrotask(() => callback())
    return Promise.resolve()
  }
  if (runtime.id === undefined) {
    Object.defineProperty(runtime, 'id', { value: ${serializedId}, enumerable: true })
  }
  if (typeof runtime.getURL !== 'function') {
    runtime.getURL = (path = '') => 'chrome-extension://' + ${serializedId} + '/' + String(path).replace(/^\\//, '')
  }
  if (typeof runtime.getManifest !== 'function') runtime.getManifest = () => ({})
  if (typeof runtime.getPlatformInfo !== 'function') {
    runtime.getPlatformInfo = (callback) => {
      const result = { os: 'mac', arch: 'arm', nacl_arch: 'arm' }
      if (typeof callback === 'function') queueMicrotask(() => callback(result))
      return Promise.resolve(result)
    }
  }
  {
    runtime.sendMessage = (...args) => {
      const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined
      if (callback) args.pop()
      if (nativeBridge) {
        const response = nativeBridge.sendMessage(args[args.length - 1])
        if (callback) response.then(callback)
        return response
      }
      const requestId = Math.random().toString(36).slice(2)
      const response = new Promise((resolve) => {
        const listener = (event) => {
          const detail = event.detail
          if (typeof detail !== 'string') return
          try {
            const result = JSON.parse(detail)
            if (result.id !== requestId) return
            removeListener()
            resolve(result.response)
            if (callback) callback(result.response)
          } catch {}
        }
        const removeListener = addBridgeListener('${userScriptMessageResponseChannel}', listener)
        postBridge('${userScriptMessageChannel}', { id: requestId, extensionId: ${serializedId}, message: args[args.length - 1] })
      })
      return response
    }
  }
  if (typeof runtime.connect !== 'function') {
    runtime.connect = (connectInfo = {}) => {
      let disconnected = false
      let connected = false
      const pending = []
      const requestedId = Math.random().toString(36).slice(2)
      const port = {
        name: typeof connectInfo === 'string' ? connectInfo : String(connectInfo?.name || ''),
        onMessage: createEvent(),
        onDisconnect: createEvent(),
        onError: createEvent(),
        postMessage(message) {
          if (disconnected) return
          if (!connected) pending.push(message)
          else postBridge('${userScriptPortMessageChannel}', { portId: port._portId, extensionId: ${serializedId}, message })
        },
        disconnect() {
          if (disconnected) return
          disconnected = true
          postBridge('${userScriptPortDisconnectChannel}', { portId: port._portId || requestedId, extensionId: ${serializedId} })
          port.onDisconnect.emit(port)
        },
        _portId: requestedId
      }
      if (nativeBridge) {
        nativeBridge.connect(port.name, (message) => port.onMessage.emit(message, port), () => {
          if (!disconnected) { disconnected = true; port.onDisconnect.emit(port) }
        }).then((portId) => {
          port._portId = portId
          connected = true
          pending.splice(0).forEach((message) => port.postMessage(message))
        })
        port.postMessage = (message) => {
          if (disconnected) return
          if (!connected) pending.push(message)
          else nativeBridge.postMessage(port._portId, message)
        }
        port.disconnect = () => {
          if (disconnected) return
          disconnected = true
          nativeBridge.disconnect(port._portId)
          port.onDisconnect.emit(port)
        }
        return port
      }
      const listener = (event) => {
        try {
          const result = JSON.parse(event.detail)
          if (result.id !== requestedId) return
          removeListener()
          if (result.error) return
          port._portId = result.portId
          connected = true
          pending.splice(0).forEach((message) => port.postMessage(message))
        } catch {}
      }
      const removeListener = addBridgeListener('${userScriptPortConnectResponseChannel}', listener)
      addBridgeListener('${userScriptPortMessageChannel}', (event) => {
        try {
          const result = JSON.parse(event.detail)
          if (result.portId === port._portId && result.message !== undefined) port.onMessage.emit(result.message, port)
        } catch {}
      })
      addBridgeListener('${userScriptPortDisconnectChannel}', (event) => {
        try {
          const result = JSON.parse(event.detail)
          if (result.portId === port._portId && !disconnected) { disconnected = true; port.onDisconnect.emit(port) }
        } catch {}
      })
      postBridge('${userScriptPortConnectChannel}', { id: requestedId, extensionId: ${serializedId}, name: port.name })
      return port
    }
  }
  if (!('lastError' in runtime)) {
    Object.defineProperty(runtime, 'lastError', { value: undefined, enumerable: true })
  }
  for (const name of ['onMessage', 'onConnect', 'onInstalled', 'onUserScriptMessage', 'onUserScriptConnect']) {
    if (!runtime[name]) runtime[name] = createEvent()
  }
  addBridgeListener('${tabsMessageChannel}', (event) => {
    try {
      const request = JSON.parse(event.detail)
      if (!request.requestId) return
      let responded = false
      const sendResponse = (response) => {
        if (responded) return
        responded = true
        postBridge('${tabsMessageResponseChannel}', { requestId: request.requestId, response })
      }
      runtime.onMessage.emit(request.message, request.sender, sendResponse)
      if (!responded) sendResponse(undefined)
    } catch {}
  })
  const extension = chrome.extension || (chrome.extension = {})
  if (!('inIncognitoContext' in extension)) {
    Object.defineProperty(extension, 'inIncognitoContext', { value: false, enumerable: true })
  }
  if (typeof extension.getURL !== 'function') extension.getURL = runtime.getURL
  try {
    extension.sendMessage = runtime.sendMessage
    extension.connect = runtime.connect
  } catch {
    const replacement = Object.create(extension)
    replacement.sendMessage = runtime.sendMessage
    replacement.connect = runtime.connect
    try { Object.defineProperty(chrome, 'extension', { value: replacement, configurable: true }) } catch {}
  }
  for (const name of ['onMessage', 'onConnect', 'onConnectExternal']) {
    if (!extension[name] && runtime[name]) extension[name] = runtime[name]
  }
  const offscreen = chrome.offscreen || (chrome.offscreen = {})
  if (typeof offscreen.createDocument !== 'function') offscreen.createDocument = noopAsync
  if (typeof offscreen.closeDocument !== 'function') offscreen.closeDocument = noopAsync
  root.chrome = chrome
})();
`;
}
async function executeBatch(scripts) {
  const batches = /* @__PURE__ */ new Map();
  for (const script of scripts) {
    const key = `${script.world}:${script.extensionId}:${script.worldId}`;
    const batch = batches.get(key) ?? [];
    batch.push(script);
    batches.set(key, batch);
  }
  for (const scriptsInWorld of batches.values()) {
    const first = scriptsInWorld[0];
    const reportExecution = async (script, execution) => {
      let timeout;
      try {
        await Promise.race([
          execution,
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error(`User script execution did not settle within ${executionTimeoutMs}ms`)),
              executionTimeoutMs
            );
          })
        ]);
        report(script, "completed");
      } catch (error) {
        report(script, "failed", error);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    };
    if (first.world === "MAIN") {
      for (const script of scriptsInWorld) {
        report(script, "started");
        await reportExecution(script, import_electron3.webFrame.executeJavaScript(script.code));
      }
      continue;
    }
    try {
      if (first.worldCsp) {
        import_electron3.webFrame.setIsolatedWorldInfo(first.worldId, {
          securityOrigin: first.worldOrigin,
          csp: first.worldCsp,
          name: first.worldName
        });
      }
      await import_electron3.webFrame.executeJavaScriptInIsolatedWorld(first.worldId, [{ code: "void 0" }]);
      exposeUserScriptBridge(first.worldId, first.extensionId);
      for (const script of scriptsInWorld) {
        report(script, "started");
        await reportExecution(
          script,
          import_electron3.webFrame.executeJavaScriptInIsolatedWorld(first.worldId, [{
            code: `${createUserScriptRuntimePrelude(first.extensionId)}
${script.code}`
          }])
        );
      }
    } catch (error) {
      scriptsInWorld.forEach((script) => report(script, "failed", error));
    }
  }
}
function schedule(runAt, scripts) {
  if (runAt === "document_start") {
    if (document.readyState === "complete") {
      void executeBatch(scripts);
    } else {
      addEventListener("load", () => void executeBatch(scripts), { once: true });
    }
  } else if (runAt === "document_end") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => void executeBatch(scripts), { once: true });
    } else {
      void executeBatch(scripts);
    }
  } else if (document.readyState === "complete") {
    void executeBatch(scripts);
  } else {
    addEventListener("load", () => void executeBatch(scripts), { once: true });
  }
}
function injectUserScriptsAtDocumentStart() {
  if (process.type !== "renderer" || !canInjectHere()) return;
  installUserScriptMessageBridge();
  const resolveAndSchedule = () => {
    void import_electron3.ipcRenderer.invoke(documentStartChannel, {
      url: location.href,
      topFrame: window.top === window
    }).then((scripts) => {
      const byRunAt = /* @__PURE__ */ new Map();
      for (const script of scripts) {
        const group = byRunAt.get(script.runAt) ?? [];
        group.push(script);
        byRunAt.set(script.runAt, group);
      }
      for (const [runAt, scriptsAtRunAt] of byRunAt) schedule(runAt, scriptsAtRunAt);
    }).catch((error) => {
      console.error("[electron-chrome-extensions] unable to resolve document user scripts", error);
    });
  };
  if (document.readyState === "complete") resolveAndSchedule();
  else addEventListener("load", resolveAndSchedule, { once: true });
}

// src/preload.ts
if (process.type === "service-worker") {
  injectExtensionAPIs();
} else {
  injectUserScriptsAtDocumentStart();
}
var extensionUrl = typeof location === "undefined" ? void 0 : location.href;
if (process.type === "service-worker" || extensionUrl?.startsWith("chrome-extension://")) {
  if (process.type !== "service-worker") injectExtensionAPIs();
}
