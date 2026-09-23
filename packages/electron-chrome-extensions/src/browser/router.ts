import { app, ipcMain, Session } from 'electron'
import debug from 'debug'

import { resolvePartition } from './partition'

// Shorten base64 encoded icons
const shortenValues = (k: string, v: any) =>
  typeof v === 'string' && v.length > 128 ? v.substr(0, 128) + '...' : v

debug.formatters.r = (value: any) => {
  return value ? JSON.stringify(value, shortenValues, '  ') : value
}

export type IpcEvent = Electron.IpcMainEvent | Electron.IpcMainServiceWorkerEvent
export type IpcInvokeEvent = Electron.IpcMainInvokeEvent | Electron.IpcMainServiceWorkerInvokeEvent
export type IpcAnyEvent = IpcEvent | IpcInvokeEvent

const getSessionFromEvent = (event: IpcAnyEvent): Electron.Session => {
  if (event.type === 'service-worker') {
    return event.session
  } else {
    return event.sender.session
  }
}

const getHostFromEvent = (event: IpcAnyEvent) => {
  if (event.type === 'service-worker') {
    return event.serviceWorker
  } else {
    return event.sender
  }
}

const d = debug('electron-chrome-extensions:router')
const shouldLogExtensionWorkerConsole = process.env.ELECTRON_CHROME_EXTENSIONS_DEBUG === 'verbose'

const DEFAULT_SESSION = '_self'

const toIpcValue = (value: any, seen = new WeakSet<object>()): any => {
  if (value === null || value === undefined) return value
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (typeof value !== 'object') return value
  if (Buffer.isBuffer(value)) return Array.from(value.values())
  if (seen.has(value)) return undefined
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => toIpcValue(item, seen))
  const result: Record<string, any> = {}
  for (const [key, item] of Object.entries(value)) {
    const serialized = toIpcValue(item, seen)
    if (serialized !== undefined) result[key] = serialized
  }
  return result
}

interface RoutingDelegateObserver {
  session: Electron.Session
  onExtensionMessage(
    event: Electron.IpcMainInvokeEvent,
    extensionId: string | undefined,
    handlerName: string,
    ...args: any[]
  ): Promise<void>
  addListener(listener: EventListener, extensionId: string, eventName: string): void
  removeListener(listener: EventListener, extensionId: string, eventName: string): void
}

let gRoutingDelegate: RoutingDelegate

/**
 * Handles event routing IPCs and delivers them to the observer with the
 * associated session.
 */
const bindServiceWorkerIpc = (
  workers: WeakSet<any>,
  serviceWorker: any,
  onRouterMessage: (...args: any[]) => any,
  onRemoteMessage: (...args: any[]) => any,
  onAddListener: (...args: any[]) => any,
  onRemoveListener: (...args: any[]) => any,
) => {
  if (!serviceWorker?.scope?.startsWith('chrome-extension://') || workers.has(serviceWorker)) return
  workers.add(serviceWorker)
  serviceWorker.ipc.handle('crx-msg', onRouterMessage)
  serviceWorker.ipc.handle('crx-msg-remote', onRemoteMessage)
  serviceWorker.ipc.on('crx-add-listener', onAddListener)
  serviceWorker.ipc.on('crx-remove-listener', onRemoveListener)
}

class RoutingDelegate {
  static get() {
    return gRoutingDelegate || (gRoutingDelegate = new RoutingDelegate())
  }

  private sessionMap: WeakMap<Session, RoutingDelegateObserver> = new WeakMap()
  private workers: WeakSet<any> = new WeakSet()

  private constructor() {
    ipcMain.handle('crx-msg', this.onRouterMessage)
    ipcMain.handle('crx-msg-remote', this.onRemoteMessage)
    ipcMain.on('crx-add-listener', this.onAddListener)
    ipcMain.on('crx-remove-listener', this.onRemoveListener)
  }

  addObserver(observer: RoutingDelegateObserver) {
    this.sessionMap.set(observer.session, observer)

    const listenForWorker = (serviceWorker: any) => {
      if (!serviceWorker?.scope?.startsWith('chrome-extension://')) return
      if (this.workers.has(serviceWorker)) return
      d(`listening to service worker [scope:${serviceWorker.scope}]`)
      bindServiceWorkerIpc(
        this.workers,
        serviceWorker,
        this.onRouterMessage,
        this.onRemoteMessage,
        this.onAddListener,
        this.onRemoveListener,
      )
    }

    Object.keys(observer.session.serviceWorkers.getAllRunning()).forEach((versionId) => {
      const serviceWorker = (observer.session as any).serviceWorkers.getWorkerFromVersionID(
        Number(versionId),
      )
      listenForWorker(serviceWorker)
    })

    const maybeListenForWorkerEvents = ({
      runningStatus,
      versionId,
    }: Electron.Event<Electron.ServiceWorkersRunningStatusChangedEventParams>) => {
      if (runningStatus !== 'starting') return

      const serviceWorker = (observer.session as any).serviceWorkers.getWorkerFromVersionID(
        versionId,
      )
      listenForWorker(serviceWorker)
    }
    observer.session.serviceWorkers.on('running-status-changed', maybeListenForWorkerEvents)
  }

  private onRouterMessage = async (
    event: Electron.IpcMainInvokeEvent,
    extensionId: string,
    handlerName: string,
    ...args: any[]
  ) => {
    d(`received '${handlerName}'`, args)

    const observer = this.sessionMap.get(getSessionFromEvent(event))

    return observer?.onExtensionMessage(event, extensionId, handlerName, ...args)
  }

  private onRemoteMessage = async (
    event: Electron.IpcMainInvokeEvent,
    sessionPartition: string,
    handlerName: string,
    ...args: any[]
  ) => {
    d(`received remote '${handlerName}' for '${sessionPartition}'`, args)

    const ses =
      sessionPartition === DEFAULT_SESSION
        ? getSessionFromEvent(event)
        : resolvePartition(sessionPartition)

    const observer = this.sessionMap.get(ses)

    return observer?.onExtensionMessage(event, undefined, handlerName, ...args)
  }

  private onAddListener = (event: IpcAnyEvent, extensionId: string, eventName: string) => {
    if (eventName === 'runtime.onMessage' || eventName === 'runtime.onConnect') {
      console.info('[electron-chrome-extensions] extension listener registered', {
        extensionId,
        eventName,
        eventType: event.type,
      })
    }
    const observer = this.sessionMap.get(getSessionFromEvent(event))
    const listener: EventListener =
      event.type === 'frame'
        ? {
            type: event.type,
            extensionId,
            host: event.sender,
          }
        : {
            type: event.type,
            extensionId,
          }
    return observer?.addListener(listener, extensionId, eventName)
  }

  private onRemoveListener = (
    event: Electron.IpcMainInvokeEvent,
    extensionId: string,
    eventName: string,
  ) => {
    const observer = this.sessionMap.get(getSessionFromEvent(event))
    const listener: EventListener =
      event.type === 'frame'
        ? {
            type: event.type,
            extensionId,
            host: event.sender,
          }
        : {
            type: event.type,
            extensionId,
          }
    return observer?.removeListener(listener, extensionId, eventName)
  }
}

export type ExtensionSender = Electron.WebContents | Electron.ServiceWorkerMain
// export interface ExtensionSender {
//   id?: number
//   ipc: Electron.IpcMain | Electron.IpcMainServiceWorker
//   send: Electron.WebFrameMain['send']
// }

type ExtendedExtension = Omit<Electron.Extension, 'manifest'> & {
  manifest: chrome.runtime.Manifest
}

export type ExtensionEvent =
  | { type: 'frame'; sender: Electron.WebContents; extension: ExtendedExtension }
  | { type: 'service-worker'; sender: Electron.ServiceWorkerMain; extension: ExtendedExtension }

export type HandlerCallback = (event: ExtensionEvent, ...args: any[]) => any

export interface HandlerOptions {
  /** Whether the handler can be invoked on behalf of a different session. */
  allowRemote?: boolean
  /** Whether an extension context is required to invoke the handler. */
  extensionContext: boolean
  /** Required extension permission to run the handler. */
  permission?: chrome.runtime.ManifestPermissions
}

interface Handler extends HandlerOptions {
  callback: HandlerCallback
}

/** e.g. 'tabs.query' */
type EventName = string

type HandlerMap = Map<EventName, Handler>

type FrameEventListener = { type: 'frame'; host: Electron.WebContents; extensionId: string }
type SWEventListener = { type: 'service-worker'; extensionId: string }
type EventListener = FrameEventListener | SWEventListener

const getHostId = (host: FrameEventListener['host']) => host.id
const getHostUrl = (host: FrameEventListener['host']) => host.getURL?.()

const eventListenerEquals = (a: EventListener) => (b: EventListener) => {
  if (a === b) return true
  if (a.extensionId !== b.extensionId) return false
  if (a.type !== b.type) return false
  if (a.type === 'frame' && b.type === 'frame') {
    return a.host === b.host
  }
  return true
}

export class ExtensionRouter {
  private handlers: HandlerMap = new Map()
  private listeners: Map<EventName, EventListener[]> = new Map()
  private listenerWaiters = new Map<string, Set<() => void>>()

  hasListener(extensionId: string, eventName: string, type?: EventListener['type']): boolean {
    return this.listeners.get(eventName)?.some((listener) =>
      listener.extensionId === extensionId && (!type || listener.type === type)) ?? false
  }

  waitForListener(extensionId: string, eventName: string, timeoutMs: number, type?: EventListener['type']): Promise<boolean> {
    if (this.hasListener(extensionId, eventName, type)) return Promise.resolve(true)
    const key = `${extensionId}:${eventName}:${type ?? '*'}`
    return new Promise((resolve) => {
      const waiters = this.listenerWaiters.get(key) ?? new Set<() => void>()
      this.listenerWaiters.set(key, waiters)
      const finish = (ready: boolean) => {
        clearTimeout(timer)
        waiters.delete(onRegistered)
        if (waiters.size === 0) this.listenerWaiters.delete(key)
        resolve(ready)
      }
      const onRegistered = () => finish(true)
      const timer = setTimeout(() => finish(false), timeoutMs)
      waiters.add(onRegistered)
    })
  }

  /**
   * Collection of all extension hosts in the session.
   *
   * Currently the router has no ability to wake up non-persistent background
   * scripts to deliver events. For now we just hold a reference to them to
   * prevent them from being terminated.
   */
  private extensionHosts: Set<Electron.WebContents> = new Set()

  private extensionWorkers: Set<any> = new Set()

  constructor(
    public session: Electron.Session,
    private delegate: RoutingDelegate = RoutingDelegate.get(),
  ) {
    this.delegate.addObserver(this)

    const sessionExtensions = session.extensions || session
    sessionExtensions.on('extension-unloaded', (event, extension) => {
      this.filterListeners((listener) => listener.extensionId !== extension.id)
    })

    app.on('web-contents-created', (event, webContents) => {
      if (webContents.session === this.session && webContents.getType() === 'backgroundPage') {
        d(`storing reference to background host [url:'${webContents.getURL()}']`)
        this.extensionHosts.add(webContents)
      }
    })

    session.serviceWorkers.on('console-message' as any, (_event: any, details: any) => {
      if (!shouldLogExtensionWorkerConsole) return

      // console.info('[electron-chrome-extensions] extension service worker console', {
      //   sessionStoragePath: session.getStoragePath(),
      //   message: details?.message,
      //   source: details?.sourceId ?? details?.source,
      //   line: details?.lineNumber ?? details?.line,
      //   url: details?.url
      // })
    })

    session.serviceWorkers.on(
      'running-status-changed' as any,
      ({ runningStatus, versionId }: any) => {
        const serviceWorker = (session as any).serviceWorkers.getWorkerFromVersionID(versionId)
        if (!serviceWorker) return

        const { scope } = serviceWorker
        if (!scope.startsWith('chrome-extension:')) return

        console.info('[electron-chrome-extensions] extension service worker lifecycle', {
          sessionStoragePath: session.getStoragePath(),
          scope,
          versionId,
          runningStatus
        })

        if (runningStatus !== 'starting') return

        if (this.extensionHosts.has(serviceWorker)) {
          d('%s running status changed to %s', scope, runningStatus)
        } else {
          d(`storing reference to background service worker [url:'${scope}']`)
          this.extensionWorkers.add(serviceWorker)
        }
      },
    )
  }

  private filterListeners(predicate: (listener: EventListener) => boolean) {
    for (const [eventName, listeners] of this.listeners) {
      const filteredListeners = listeners.filter(predicate)
      const delta = listeners.length - filteredListeners.length

      if (filteredListeners.length > 0) {
        this.listeners.set(eventName, filteredListeners)
      } else {
        this.listeners.delete(eventName)
      }

      if (delta > 0) {
        d(`removed ${delta} listener(s) for '${eventName}'`)
      }
    }
  }

  private observeListenerHost(host: FrameEventListener['host']) {
    const hostId = getHostId(host)
    d(`observing listener [id:${hostId}, url:'${getHostUrl(host)}']`)
    host.once('destroyed', () => {
      d(`extension host destroyed [id:${hostId}]`)
      this.filterListeners((listener) => listener.type !== 'frame' || listener.host !== host)
    })
  }

  addListener(listener: EventListener, extensionId: string, eventName: string) {
    const { listeners, session } = this

    const sessionExtensions = session.extensions || session
    const extension = sessionExtensions.getExtension(extensionId)
    if (!extension) {
      throw new Error(`extension not registered in session [extensionId:${extensionId}]`)
    }

    if (!listeners.has(eventName)) {
      listeners.set(eventName, [])
    }

    const eventListeners = listeners.get(eventName)!
    const existingEventListener = eventListeners.find(eventListenerEquals(listener))

    if (existingEventListener) {
      d(`ignoring existing '${eventName}' event listener for ${extensionId}`)
    } else {
      d(`adding '${eventName}' event listener for ${extensionId}`)
      eventListeners.push(listener)
      for (const type of [listener.type, '*']) {
        for (const onRegistered of this.listenerWaiters.get(`${extensionId}:${eventName}:${type}`) ?? []) onRegistered()
      }
      if (listener.type === 'frame' && listener.host) {
        this.observeListenerHost(listener.host)
      }
    }
  }

  removeListener(listener: EventListener, extensionId: string, eventName: string) {
    const { listeners } = this

    const eventListeners = listeners.get(eventName)
    if (!eventListeners) {
      console.error(`event listener not registered for '${eventName}'`)
      return
    }

    const index = eventListeners.findIndex(eventListenerEquals(listener))

    if (index >= 0) {
      d(`removing '${eventName}' event listener for ${extensionId}`)
      eventListeners.splice(index, 1)
    }

    if (eventListeners.length === 0) {
      listeners.delete(eventName)
    }
  }

  private getHandler(handlerName: string) {
    const handler = this.handlers.get(handlerName)
    if (!handler) {
      throw new Error(`${handlerName} is not a registered handler`)
    }

    return handler
  }

  async onExtensionMessage(
    event: IpcInvokeEvent,
    extensionId: string | undefined,
    handlerName: string,
    ...args: any[]
  ) {
    const { session } = this
    const eventSession = getSessionFromEvent(event)
    const eventSessionExtensions = eventSession.extensions || eventSession
    const handler = this.getHandler(handlerName)

    if (handlerName.startsWith('userScripts.')) {
      console.info('[electron-chrome-extensions] userScripts IPC received', {
        handlerName,
        eventType: event.type,
        extensionId,
        sessionStoragePath: eventSession.getStoragePath(),
        senderUrl: event.type === 'frame' ? getHostUrl(event.sender) : event.serviceWorker?.scope
      })
    }

    if (eventSession !== session && !handler.allowRemote) {
      throw new Error(`${handlerName} does not support calling from a remote session`)
    }

    const extension = extensionId ? eventSessionExtensions.getExtension(extensionId) : undefined
    if (!extension && handler.extensionContext) {
      console.warn('[electron-chrome-extensions] unknown extension context', {
        handlerName,
        extensionId,
        eventType: event.type,
        sessionStoragePath: eventSession.getStoragePath(),
        senderWebContentsId: event.type === 'frame' ? event.sender.id : undefined,
        workerScope: event.type === 'service-worker' ? event.serviceWorker?.scope : undefined,
      })
      throw new Error(`${handlerName} was sent from an unknown extension context`)
    }

    if (handler.permission) {
      const manifest: chrome.runtime.Manifest = extension?.manifest
      if (!extension || !manifest.permissions?.includes(handler.permission)) {
        throw new Error(
          `${handlerName} requires an extension with ${handler.permission} permissions`,
        )
      }
    }

    const extEvent: ExtensionEvent =
      event.type === 'frame'
        ? { type: event.type, sender: event.sender, extension: extension! }
        : { type: event.type, sender: event.serviceWorker, extension: extension! }

    const result = await handler.callback(extEvent, ...args)

    d(`${handlerName} result: %r`, result)

    return result
  }

  private handle(name: string, callback: HandlerCallback, opts?: Partial<HandlerOptions>): void {
    this.handlers.set(name, {
      callback,
      extensionContext: typeof opts?.extensionContext === 'boolean' ? opts.extensionContext : true,
      allowRemote: typeof opts?.allowRemote === 'boolean' ? opts.allowRemote : false,
      permission: typeof opts?.permission === 'string' ? opts.permission : undefined,
    })
  }

  /** Returns a callback to register API handlers for the given context. */
  apiHandler() {
    return (name: string, callback: HandlerCallback, opts?: Partial<HandlerOptions>) => {
      this.handle(name, callback, opts)
    }
  }

  /**
   * Sends extension event to the host for the given extension ID if it
   * registered a listener for it.
   */
  sendEvent(targetExtensionId: string | undefined, eventName: string, ...args: any[]) {
    const { listeners } = this
    let eventListeners = listeners.get(eventName)
    const ipcName = `crx-${eventName}`

    if (!eventListeners || eventListeners.length === 0) {
      if (eventName === 'runtime.onMessage') {
        console.warn('[electron-chrome-extensions] runtime message has no receiving listener', {
          targetExtensionId,
        })
      }
      // Ignore events with no listeners
      return
    }

    let sentCount = 0
    for (const listener of eventListeners) {
      const { type, extensionId } = listener

      if (targetExtensionId && targetExtensionId !== extensionId) {
        continue
      }

      if (type === 'service-worker') {
        const scope = `chrome-extension://${extensionId}/`
        this.session.serviceWorkers
          .startWorkerForScope(scope)
          .then((serviceWorker) => {
            serviceWorker.send(ipcName, ...args.map((arg) => toIpcValue(arg)))
          })
          .catch((error) => {
            d('failed to send %s to %s', eventName, extensionId)
            console.error(error)
          })
      } else {
        if (listener.host.isDestroyed()) {
          console.error(`Unable to send '${eventName}' to extension host for ${extensionId}`)
          return
        }
        listener.host.send(ipcName, ...args)
      }

      sentCount++
    }

    d(`sent '${eventName}' event to ${sentCount} listeners`)
  }

  /** Broadcasts extension event to all extension hosts listening for it. */
  broadcastEvent(eventName: string, ...args: any[]) {
    this.sendEvent(undefined, eventName, ...args)
  }
}
