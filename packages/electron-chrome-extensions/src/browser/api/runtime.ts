import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ExtensionContext } from '../context'
import { ExtensionEvent } from '../router'
import { getExtensionManifest } from './common'
import { NativeMessagingHost } from './lib/native-messaging-host'

export class RuntimeAPI extends EventEmitter {
  private hostMap: Record<string, NativeMessagingHost | undefined> = {}
  private ports = new Map<string, { extensionId: string; sender: Electron.WebContents }>()
  private observedPortSenders = new WeakSet<Electron.WebContents>()
  private userScriptMessageSenders = new Map<string, (response: unknown) => void>()
  private observedResponseWorkers = new WeakSet<any>()
  private pendingInstallEvents = new Map<string, chrome.runtime.InstalledDetails>()
  private installEventTimer?: ReturnType<typeof setTimeout>

  constructor(private ctx: ExtensionContext) {
    super()

    const handle = this.ctx.router.apiHandler()
    handle('runtime.connectNative', this.connectNative, { permission: 'nativeMessaging' })
    handle('runtime.disconnectNative', this.disconnectNative, { permission: 'nativeMessaging' })
    handle('runtime.openOptionsPage', this.openOptionsPage)
    handle('runtime.sendMessage', this.sendMessage)
    handle('runtime.connectPort', this.connectPort)
    handle('runtime.portPostMessage', this.portPostMessage)
    handle('runtime.disconnectPort', this.disconnectPort)
    handle('runtime.sendNativeMessage', this.sendNativeMessage, { permission: 'nativeMessaging' })

    const sessionExtensions = this.ctx.session.extensions || this.ctx.session
    sessionExtensions.on('extension-loaded', (_event, extension) => {
      this.trackInstalledExtension(extension)
    })
    sessionExtensions.on('extension-unloaded', (_event, extension) => {
      for (const [portId, port] of this.ports) {
        if (port.extensionId === extension.id) this.ports.delete(portId)
      }
    })
    const observeWorkerResponse = (worker: any) => {
      if (!worker?.scope?.startsWith('chrome-extension://') || this.observedResponseWorkers.has(worker)) return
      this.observedResponseWorkers.add(worker)
      worker.ipc.on('crx-user-script-message-response', (_event: any, response: any) => {
        this.handleUserScriptMessageResponse(response)
      })
    }
    Object.keys(this.ctx.session.serviceWorkers.getAllRunning()).forEach((versionId) => {
      observeWorkerResponse(this.ctx.session.serviceWorkers.getWorkerFromVersionID(Number(versionId)))
    })
    this.ctx.session.serviceWorkers.on('running-status-changed', ({ runningStatus, versionId }) => {
      if (runningStatus !== 'starting') return
      observeWorkerResponse(this.ctx.session.serviceWorkers.getWorkerFromVersionID(versionId))
    })
  }

  private handleUserScriptMessageResponse(response: any): void {
    const resolve = this.userScriptMessageSenders.get(response?.requestId)
    if (!resolve) return
    this.userScriptMessageSenders.delete(response.requestId)
    console.info('[electron-chrome-extensions] runtime user script response received', {
      requestId: response.requestId,
      hasResponse: response.response !== undefined,
    })
    resolve(response.response)
  }

  private getInstallStatePath(): string | undefined {
    const storagePath = this.ctx.session.getStoragePath()
    return storagePath ? join(storagePath, 'electron-chrome-extensions', 'extension-versions.json') : undefined
  }

  private readInstallState(): Record<string, string> {
    const filePath = this.getInstallStatePath()
    if (!filePath || !existsSync(filePath)) return {}
    try {
      const state = JSON.parse(readFileSync(filePath, 'utf8'))
      return state && typeof state === 'object' ? state : {}
    } catch {
      return {}
    }
  }

  private writeInstallState(state: Record<string, string>): void {
    const filePath = this.getInstallStatePath()
    if (!filePath) return
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, JSON.stringify(state), 'utf8')
    } catch (error) {
      console.warn('[electron-chrome-extensions] unable to persist extension install state', {
        filePath,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private trackInstalledExtension(extension: Electron.Extension): void {
    const version = extension.manifest.version
    if (!version) return

    const state = this.readInstallState()
    const previousVersion = state[extension.id]
    state[extension.id] = version
    this.writeInstallState(state)

    if (!previousVersion || previousVersion === version) return
    this.pendingInstallEvents.set(
      extension.id,
      previousVersion
        ? { reason: 'update' as chrome.runtime.OnInstalledReason, previousVersion }
        : { reason: 'install' as chrome.runtime.OnInstalledReason }
    )
    this.scheduleInstallEventDelivery()
  }

  private scheduleInstallEventDelivery(): void {
    if (this.installEventTimer) return
    this.installEventTimer = setTimeout(() => {
      this.installEventTimer = undefined
      for (const [extensionId, details] of this.pendingInstallEvents) {
        this.ctx.router.sendEvent(extensionId, 'runtime.onInstalled', details)
      }
      this.pendingInstallEvents.clear()
    }, 100)
  }

  private connectNative = async (
    event: ExtensionEvent,
    connectionId: string,
    application: string,
  ) => {
    const host = new NativeMessagingHost(
      event.extension.id,
      event.sender!,
      connectionId,
      application,
    )
    this.hostMap[connectionId] = host
  }

  private disconnectNative = (event: ExtensionEvent, connectionId: string) => {
    this.hostMap[connectionId]?.destroy()
    this.hostMap[connectionId] = undefined
  }

  private sendNativeMessage = async (event: ExtensionEvent, application: string, message: any) => {
    const connectionId = randomUUID()
    const host = new NativeMessagingHost(
      event.extension.id,
      event.sender!,
      connectionId,
      application,
      false,
    )
    await host.ready
    return await host.sendAndReceive(message)
  }

  private openOptionsPage = async ({ extension }: ExtensionEvent) => {
    // TODO: options page shouldn't appear in Tabs API
    // https://developer.chrome.com/extensions/options#tabs-api

    const manifest = getExtensionManifest(extension)

    if (manifest.options_ui) {
      // Embedded option not support (!options_ui.open_in_new_tab)
      const url = `chrome-extension://${extension.id}/${manifest.options_ui.page}`
      await this.ctx.store.createTab({ url, active: true })
    } else if (manifest.options_page) {
      const url = `chrome-extension://${extension.id}/${manifest.options_page}`
      await this.ctx.store.createTab({ url, active: true })
    }
  }

  private sendMessage = async (event: ExtensionEvent, message: unknown) => {
    console.info('[electron-chrome-extensions] runtime.sendMessage received', {
      extensionId: event.extension.id,
      method: (message as any)?.method,
      senderType: event.type,
      senderUrl: (event.sender as any)?.getURL?.() ?? ''
    })
    // Forward messages from extension frames and service workers through the
    // standard extension event so MV3 workers can message themselves too.
    if (event.extension.manifest.manifest_version === 3 &&
        !this.ctx.router.hasListener(event.extension.id, 'runtime.onMessage', 'service-worker')) {
      const workers = this.ctx.session.serviceWorkers
      const scope = `chrome-extension://${event.extension.id}/`
      const isRunning = () => Object.values(workers.getAllRunning()).some((worker) => worker.scope === scope)
      const listenerReady = this.ctx.router.waitForListener(event.extension.id, 'runtime.onMessage', 5_000, 'service-worker')
      const workerReady = new Promise<boolean>((resolve) => {
        if (isRunning()) return resolve(true)
        const finish = (ready: boolean) => {
          clearTimeout(timer)
          workers.off('running-status-changed', onStatus)
          resolve(ready)
        }
        const onStatus = ({ runningStatus, versionId }: Electron.ServiceWorkersRunningStatusChangedEventParams) => {
          if (runningStatus === 'running' && workers.getWorkerFromVersionID(versionId)?.scope === scope) finish(true)
        }
        workers.on('running-status-changed', onStatus)
        const timer = setTimeout(() => finish(false), 5_000)
        if (isRunning()) finish(true)
      })
      void workers.startWorkerForScope(scope).catch(() => {})
      const [hasListener, running] = await Promise.all([listenerReady, workerReady])
      if (!hasListener || !running) {
        console.warn('[electron-chrome-extensions] runtime listener unavailable', {
          extensionId: event.extension.id,
          sessionStoragePath: this.ctx.session.getStoragePath(),
          hasListener,
          workerRunning: running,
        })
        return undefined
      }
    }
    const requestId = randomUUID()
    const senderUrl = (event.sender as any).getURL?.() ?? ''
    const sender = {
      id: event.extension.id,
      url: senderUrl,
      frameId: 0,
      tab: {
        id: (event.sender as any).id,
        index: 0,
        url: senderUrl,
      },
    }
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.userScriptMessageSenders.delete(requestId)
        console.warn('[electron-chrome-extensions] runtime.sendMessage response timeout', { requestId, method: (message as any)?.method })
        resolve(undefined)
      }, 5_000)
      const onResponse = (response: unknown) => {
        clearTimeout(timer)
        if ((message as any)?.method === 'loadTree') {
          const items = (response as any)?.items
          console.info('[electron-chrome-extensions] popup tree response', {
            requestId,
            tabId: (message as any)?.tabId ?? null,
            hasItems: items != null,
            itemCount: Array.isArray(items)
              ? items.length
              : items && typeof items === 'object'
                ? Object.keys(items).length
                : null,
          })
        }
        resolve(response)
      }
      this.userScriptMessageSenders.set(requestId, onResponse)
      this.ctx.router.sendEvent(
        event.extension.id,
        'runtime.onMessage',
        message,
        sender,
        requestId
      )
    })
  }

  private connectPort = async (event: ExtensionEvent, requestedId: string, name = '') => {
    if (event.type !== 'frame') throw new Error('runtime.connectPort requires a frame context')
    const portId = requestedId || randomUUID()
    this.ports.set(portId, { extensionId: event.extension.id, sender: event.sender })
    if (!this.observedPortSenders.has(event.sender)) {
      this.observedPortSenders.add(event.sender)
      event.sender.once('destroyed', () => {
        for (const [id, port] of this.ports) {
          if (port.sender !== event.sender) continue
          this.ports.delete(id)
          if ((this.ctx.session.extensions || this.ctx.session).getExtension(port.extensionId)) {
            this.ctx.router.sendEvent(port.extensionId, `runtime.portDisconnect:${id}`)
          }
        }
      })
    }
    const senderUrl = (event.sender as any).getURL?.() ?? ''
    console.info('[electron-chrome-extensions] runtime port connected', {
      portId,
      name,
      extensionId: event.extension.id,
      senderTabId: (event.sender as any).id,
      senderUrl,
    })
    this.ctx.router.sendEvent(event.extension.id, 'runtime.onConnect', {
      portId,
      name,
      sender: {
        id: event.extension.id,
        url: senderUrl,
        frameId: 0,
        tab: {
          id: (event.sender as any).id,
          index: 0,
          url: senderUrl,
        },
      },
    })
    // The service worker creates its per-port listener while handling
    // runtime.onConnect. Do not acknowledge the connection before that IPC has
    // crossed into the worker, otherwise the first postMessage can be lost.
    await new Promise((resolve) => setTimeout(resolve, 25))
    return { portId, name }
  }

  private portPostMessage = async (event: ExtensionEvent, portId: string, message: unknown) => {
    const port = this.ports.get(portId)
    if (!port || port.extensionId !== event.extension.id || (event.type === 'frame' && port.sender !== event.sender)) {
      console.warn('[electron-chrome-extensions] runtime port message dropped', { portId, eventType: event.type })
      return
    }
    console.info('[electron-chrome-extensions] runtime port message', { portId, eventType: event.type })
    if (event.type === 'service-worker') {
      port.sender.send('crx-user-scripts:runtime-port-message', { portId, message })
      return
    }
    this.ctx.router.sendEvent(port.extensionId, `runtime.portMessage:${portId}`, message)
  }

  private disconnectPort = async (event: ExtensionEvent, portId: string) => {
    const port = this.ports.get(portId)
    if (!port || port.extensionId !== event.extension.id || (event.type === 'frame' && port.sender !== event.sender)) return
    this.ports.delete(portId)
    if (event.type === 'service-worker') {
      port.sender.send('crx-user-scripts:runtime-port-disconnect', { portId })
    } else {
      this.ctx.router.sendEvent(port.extensionId, `runtime.portDisconnect:${portId}`)
    }
  }
}
