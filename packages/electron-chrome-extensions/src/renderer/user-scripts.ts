import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type { DocumentUserScript } from '../browser/api/user-scripts'

const documentStartChannel = 'crx-user-scripts:document-start'
const executionChannel = 'crx-user-scripts:execution'
const executionTimeoutMs = 5_000
const userScriptMessageChannel = 'crx-user-scripts:runtime-message'
const userScriptMessageResponseChannel = 'crx-user-scripts:runtime-message-response'
const userScriptPortConnectChannel = 'crx-user-scripts:runtime-port-connect'
const userScriptPortConnectResponseChannel = 'crx-user-scripts:runtime-port-connect-response'
const userScriptPortMessageChannel = 'crx-user-scripts:runtime-port-message'
const userScriptPortDisconnectChannel = 'crx-user-scripts:runtime-port-disconnect'
const tabsMessageChannel = 'crx-user-scripts:tabs-message'
const tabsMessageResponseChannel = 'crx-user-scripts:tabs-message-response'

let userScriptMessageBridgeInstalled = false
const exposedWorlds = new Set<number>()

function exposeUserScriptBridge(worldId: number, extensionId: string): void {
  if (exposedWorlds.has(worldId) || !process.contextIsolated) return
  exposedWorlds.add(worldId)
  contextBridge.exposeInIsolatedWorld(worldId, 'electronUserScripts', {
    sendMessage: (message: unknown) => ipcRenderer.invoke('crx-msg', extensionId, 'runtime.sendMessage', message),
    connect: async (name: string, onMessage: (message: unknown) => void, onDisconnect: () => void) => {
      const requestedId = Math.random().toString(36).slice(2)
      const result = await ipcRenderer.invoke('crx-msg', extensionId, 'runtime.connectPort', requestedId, name)
      const portId = result.portId as string
      const messageChannel = 'crx-user-scripts:runtime-port-message'
      const disconnectChannel = 'crx-user-scripts:runtime-port-disconnect'
      const messageListener = (_event: Electron.IpcRendererEvent, details: any) => {
        if (details?.portId === portId) onMessage(details.message)
      }
      const disconnectListener = (_event: Electron.IpcRendererEvent, details: any) => {
        if (details?.portId !== portId) return
        ipcRenderer.off(messageChannel, messageListener)
        ipcRenderer.off(disconnectChannel, disconnectListener)
        onDisconnect()
      }
      ipcRenderer.on(messageChannel, messageListener)
      ipcRenderer.on(disconnectChannel, disconnectListener)
      return portId
    },
    postMessage: (portId: string, message: unknown) =>
      ipcRenderer.invoke('crx-msg', extensionId, 'runtime.portPostMessage', portId, message),
    disconnect: (portId: string) =>
      ipcRenderer.invoke('crx-msg', extensionId, 'runtime.disconnectPort', portId)
  })
}

function installUserScriptMessageBridge(): void {
  if (userScriptMessageBridgeInstalled) return
  userScriptMessageBridgeInstalled = true
  window.addEventListener('message', (event) => {
    const data = event.data
    if (!data || data.source !== 'electron-chrome-extensions-user-script' || typeof data.channel !== 'string') return
    document.dispatchEvent(new CustomEvent(data.channel, { detail: data.detail }))
  })
  const postToUserScript = (channel: string, detail: unknown) => {
    const carrier = document.createElement('meta')
    carrier.dataset.crxUserScriptBridge = JSON.stringify(detail)
    document.documentElement.appendChild(carrier)
    carrier.dispatchEvent(new Event(channel, { bubbles: true }))
    carrier.remove()
  }
  document.addEventListener(userScriptMessageChannel, (event) => {
    const detail = (event.target as HTMLElement)?.dataset?.crxUserScriptBridge ?? (event as CustomEvent).detail
    if (typeof detail !== 'string') return
    let request: { id?: string; extensionId?: string; message?: unknown }
    try {
      request = JSON.parse(detail)
    } catch {
      return
    }
    if (!request.id || !request.extensionId) return
    void ipcRenderer.invoke('crx-msg', request.extensionId, 'runtime.sendMessage', request.message).then(
      (response) => {
        postToUserScript(userScriptMessageResponseChannel, { id: request.id, response })
      },
      () => {
        postToUserScript(userScriptMessageResponseChannel, { id: request.id })
      }
    )
  })
  document.addEventListener(userScriptPortConnectChannel, (event) => {
    const detail = (event.target as HTMLElement)?.dataset?.crxUserScriptBridge ?? (event as CustomEvent).detail
    if (typeof detail !== 'string') return
    let request: { id?: string; extensionId?: string; name?: string }
    try { request = JSON.parse(detail) } catch { return }
    if (!request.id || !request.extensionId) return
    void ipcRenderer.invoke('crx-msg', request.extensionId, 'runtime.connectPort', request.id, request.name || '').then(
      (response) => postToUserScript(userScriptPortConnectResponseChannel, { id: request.id, ...response }),
      () => postToUserScript(userScriptPortConnectResponseChannel, { id: request.id, error: true })
    )
  })
  document.addEventListener(userScriptPortMessageChannel, (event) => {
    const detail = (event.target as HTMLElement)?.dataset?.crxUserScriptBridge ?? (event as CustomEvent).detail
    if (typeof detail !== 'string') return
    try {
      const request = JSON.parse(detail)
      if (typeof request.extensionId === 'string' && request.portId) {
        void ipcRenderer.invoke('crx-msg', request.extensionId, 'runtime.portPostMessage', request.portId, request.message)
      }
    } catch {}
  })
  document.addEventListener(userScriptPortDisconnectChannel, (event) => {
    const detail = (event.target as HTMLElement)?.dataset?.crxUserScriptBridge ?? (event as CustomEvent).detail
    if (typeof detail !== 'string') return
    try {
      const request = JSON.parse(detail)
      if (typeof request.extensionId === 'string' && request.portId) {
        void ipcRenderer.invoke('crx-msg', request.extensionId, 'runtime.disconnectPort', request.portId)
      }
    } catch {}
  })
  ipcRenderer.on('crx-user-scripts:runtime-port-message', (_event, detail) => {
    postToUserScript(userScriptPortMessageChannel, detail)
  })
  ipcRenderer.on('crx-user-scripts:runtime-port-disconnect', (_event, detail) => {
    postToUserScript(userScriptPortDisconnectChannel, detail)
  })
  ipcRenderer.on(tabsMessageChannel, (_event, detail) => {
    postToUserScript(tabsMessageChannel, detail)
  })
  document.addEventListener(tabsMessageResponseChannel, (event) => {
    const detail = (event.target as HTMLElement)?.dataset?.crxUserScriptBridge ?? (event as CustomEvent).detail
    if (typeof detail !== 'string') return
    try {
      ipcRenderer.send('crx-tabs-message-response', JSON.parse(detail))
    } catch {}
  })
}

function canInjectHere(): boolean {
  try {
    return ['http:', 'https:', 'file:'].includes(new URL(location.href).protocol)
  } catch {
    return false
  }
}

function report(script: DocumentUserScript, status: 'started' | 'completed' | 'failed', error?: unknown): void {
  ipcRenderer.send(executionChannel, {
    extensionId: script.extensionId,
    scriptId: script.scriptId,
    runAt: script.runAt,
    status,
    url: location.href,
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {})
  })
}

function createUserScriptRuntimePrelude(extensionId: string): string {
  const serializedId = JSON.stringify(extensionId)
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
        return listeners.slice().map((listener) => {
          try {
            return listener(...args)
          } catch {
            return undefined
          }
        })
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
      if (!request.requestId || request.sender?.id !== ${serializedId}) return
      let responded = false
      const sendResponse = (response) => {
        if (responded) return
        responded = true
        postBridge('${tabsMessageResponseChannel}', { requestId: request.requestId, response })
      }
      const results = runtime.onMessage.emit(request.message, request.sender, sendResponse)
      // Returning true keeps sendResponse available. Empty worlds must not
      // synthesize an undefined response and win the cross-world race.
      for (const result of results) {
        if (result && typeof result.then === 'function') {
          Promise.resolve(result).then(sendResponse, () => sendResponse(undefined))
        }
      }
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
`
}

async function executeBatch(scripts: DocumentUserScript[]): Promise<void> {
  const batches = new Map<string, DocumentUserScript[]>()
  for (const script of scripts) {
    const key = `${script.world}:${script.extensionId}:${script.worldId}`
    const batch = batches.get(key) ?? []
    batch.push(script)
    batches.set(key, batch)
  }

  for (const scriptsInWorld of batches.values()) {
    const first = scriptsInWorld[0]
    const reportExecution = async (script: DocumentUserScript, execution: Promise<unknown>) => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          execution,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error(`User script execution did not settle within ${executionTimeoutMs}ms`)),
              executionTimeoutMs
            )
          })
        ])
        report(script, 'completed')
      } catch (error) {
        report(script, 'failed', error)
      } finally {
        if (timeout) clearTimeout(timeout)
      }
    }

    if (first.world === 'MAIN') {
      for (const script of scriptsInWorld) {
        report(script, 'started')
        await reportExecution(script, webFrame.executeJavaScript(script.code))
      }
      continue
    }

    try {
      // Chromium supplies a working default isolated world. Overriding its
      // security origin for every script causes otherwise valid MV3 scripts
      // to fail in Electron. Only configure a world when the extension has
      // explicitly supplied a CSP through chrome.userScripts.configureWorld.
      if (first.worldCsp) {
        webFrame.setIsolatedWorldInfo(first.worldId, {
          securityOrigin: first.worldOrigin,
          csp: first.worldCsp,
          name: first.worldName
        })
      }
      // Create the target context before exposing APIs into it. Electron does
      // not retain exposeInIsolatedWorld calls made before a custom world has
      // been instantiated.
      await webFrame.executeJavaScriptInIsolatedWorld(first.worldId, [{ code: 'void 0' }])
      exposeUserScriptBridge(first.worldId, first.extensionId)
      for (const script of scriptsInWorld) {
        report(script, 'started')
        await reportExecution(
          script,
          webFrame.executeJavaScriptInIsolatedWorld(first.worldId, [{
            code: `${createUserScriptRuntimePrelude(first.extensionId)}\n${script.code}`
          }])
        )
      }
    } catch (error) {
      scriptsInWorld.forEach((script) => report(script, 'failed', error))
    }
  }
}

function schedule(runAt: DocumentUserScript['runAt'], scripts: DocumentUserScript[]): void {
  if (runAt === 'document_start') {
    // Electron does not expose Chromium's native userScripts injection hook.
    // Running arbitrary extension code from the frame preload can stall the
    // navigation, so use the first stable page lifecycle point instead.
    if (document.readyState === 'complete') {
      void executeBatch(scripts)
    } else {
      addEventListener('load', () => void executeBatch(scripts), { once: true })
    }
  } else if (runAt === 'document_end') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => void executeBatch(scripts), { once: true })
    } else {
      void executeBatch(scripts)
    }
  } else if (document.readyState === 'complete') {
    void executeBatch(scripts)
  } else {
    addEventListener('load', () => void executeBatch(scripts), { once: true })
  }
}

/** Runs before page JavaScript through the session frame preload. */
export function injectUserScriptsAtDocumentStart(): void {
  if (process.type !== 'renderer' || !canInjectHere()) return
  installUserScriptMessageBridge()

  const resolveAndSchedule = () => {
    void ipcRenderer
      .invoke(documentStartChannel, {
        url: location.href,
        topFrame: window.top === window
      })
      .then((scripts: DocumentUserScript[]) => {
        const byRunAt = new Map<DocumentUserScript['runAt'], DocumentUserScript[]>()
        for (const script of scripts) {
          const group = byRunAt.get(script.runAt) ?? []
          group.push(script)
          byRunAt.set(script.runAt, group)
        }
        for (const [runAt, scriptsAtRunAt] of byRunAt) schedule(runAt, scriptsAtRunAt)
      })
      .catch((error) => {
        console.error('[electron-chrome-extensions] unable to resolve document user scripts', error)
      })
  }

  if (document.readyState === 'complete') resolveAndSchedule()
  else addEventListener('load', resolveAndSchedule, { once: true })
}
