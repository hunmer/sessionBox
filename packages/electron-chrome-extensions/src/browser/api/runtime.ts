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
    // USER_SCRIPT worlds do not have Chromium's native extension bindings.
    // Forward the message through the normal router so service-worker listeners
    // still observe it; a response channel is intentionally best-effort.
    this.ctx.router.sendEvent(event.extension.id, 'runtime.onMessage', message, {
      id: event.extension.id,
      url: (event.sender as any)?.getURL?.() ?? ''
    })
    return undefined
  }

  private connectPort = async (event: ExtensionEvent, requestedId: string, name = '') => {
    if (event.type !== 'frame') throw new Error('runtime.connectPort requires a frame context')
    const portId = requestedId || randomUUID()
    this.ports.set(portId, { extensionId: event.extension.id, sender: event.sender })
    console.info('[electron-chrome-extensions] runtime port connected', { portId, name, extensionId: event.extension.id })
    this.ctx.router.sendEvent(event.extension.id, 'runtime.onConnect', { portId, name })
    // The service worker creates its per-port listener while handling
    // runtime.onConnect. Do not acknowledge the connection before that IPC has
    // crossed into the worker, otherwise the first postMessage can be lost.
    await new Promise((resolve) => setTimeout(resolve, 25))
    return { portId, name }
  }

  private portPostMessage = async (event: ExtensionEvent, portId: string, message: unknown) => {
    const port = this.ports.get(portId)
    if (!port || port.extensionId !== event.extension.id) {
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
    if (!port || port.extensionId !== event.extension.id) return
    this.ports.delete(portId)
    if (event.type === 'service-worker') {
      port.sender.send('crx-user-scripts:runtime-port-disconnect', { portId })
    } else {
      this.ctx.router.sendEvent(port.extensionId, `runtime.portDisconnect:${portId}`)
    }
  }
}
