import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ipcMain } from 'electron'
import { dirname, join, resolve, sep } from 'node:path'
import type { ExtensionContext } from '../context'
import type { ExtensionEvent } from '../router'
import { matchesPattern } from './common'

type UserScript = chrome.userScripts.RegisteredUserScript & {
  allFrames?: boolean
  excludeGlobs?: string[]
  excludeMatches?: string[]
  includeGlobs?: string[]
  matches?: string[]
  runAt?: 'document_start' | 'document_end' | 'document_idle'
  world?: 'MAIN' | 'USER_SCRIPT'
  worldId?: string
}

type WorldProperties = {
  csp?: string
  messaging?: boolean
  worldId?: string
}

export type DocumentUserScript = {
  code: string
  extensionId: string
  runAt: 'document_start' | 'document_end' | 'document_idle'
  scriptId: string
  world: 'MAIN' | 'USER_SCRIPT'
  worldCsp?: string
  worldId: number
  worldName: string
  worldOrigin: string
}

type ExtensionScripts = {
  extension: Electron.Extension
  scripts: Map<string, UserScript>
  worlds: Map<string, WorldProperties>
}

type PersistedExtensionScripts = {
  scripts: UserScript[]
  worlds: Record<string, WorldProperties>
}

type PersistedUserScripts = {
  version: 1
  extensions: Record<string, PersistedExtensionScripts>
}

export type UserScriptsInitialization = {
  extensionId: string
  scriptCount: number
  state: 'registered' | 'restored' | 'timed-out'
}

type InitializationWaiter = {
  settled?: UserScriptsInitialization
  waiters: Set<(result: UserScriptsInitialization) => void>
  workerStarted: boolean
  settlementTimer?: ReturnType<typeof setTimeout>
}

const documentStartChannel = 'crx-user-scripts:document-start'
const executionChannel = 'crx-user-scripts:execution'
const instances = new WeakMap<Electron.Session, UserScriptsAPI>()
let documentStartHandlerInstalled = false

function matchesGlob(pattern: string, url: string): boolean {
  const expression = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*/g, '.*')
  return new RegExp(`^${expression}$`).test(url)
}

function matchesScript(script: UserScript, url: string): boolean {
  const matches = script.matches ?? ['<all_urls>']
  if (!matches.some((pattern) => matchesPattern(pattern, url))) return false
  if (script.excludeMatches?.some((pattern) => matchesPattern(pattern, url))) return false
  if (script.includeGlobs?.length && !script.includeGlobs.some((pattern) => matchesGlob(pattern, url))) {
    return false
  }
  if (script.excludeGlobs?.some((pattern) => matchesGlob(pattern, url))) return false
  return true
}

function createWorldId(extensionId: string, worldId: string): number {
  let hash = 0
  for (const character of `${extensionId}:${worldId}`) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0
  }
  // Keep away from Electron's reserved context-isolation world (999).
  return 1_000_000 + (hash >>> 0) % 1_000_000_000
}

function getScriptCode(extension: Electron.Extension, script: UserScript): string {
  return (script.js ?? [])
    .flatMap((item: any) => {
      if (typeof item.code === 'string') return [item.code]
      if (typeof item.file !== 'string') return []

      const filePath = resolve(extension.path, item.file)
      if (!filePath.startsWith(`${extension.path}${sep}`)) return []
      try {
        return [readFileSync(filePath, 'utf8')]
      } catch (error) {
        console.warn('[electron-chrome-extensions] unable to read user script file', {
          extensionId: extension.id,
          scriptId: script.id,
          file: item.file,
          message: error instanceof Error ? error.message : String(error)
        })
        return []
      }
    })
    .join('\n')
}

export class UserScriptsAPI {
  private scripts = new Map<string, ExtensionScripts>()
  private initializationWaiters = new Map<string, InitializationWaiter>()

  constructor(private ctx: ExtensionContext) {
    const handle = ctx.router.apiHandler()
    handle('userScripts.register', this.register)
    handle('userScripts.unregister', this.unregister)
    handle('userScripts.update', this.update)
    handle('userScripts.getScripts', this.getScripts)
    handle('userScripts.configureWorld', this.configureWorld)

    instances.set(ctx.session, this)
    this.installDocumentStartHandler()
    this.restoreLoadedExtensions()
    this.observeExtensions()
  }

  private getStorageFilePath(): string | undefined {
    const storagePath = this.ctx.session.getStoragePath()
    return storagePath ? join(storagePath, 'electron-chrome-extensions', 'user-scripts.json') : undefined
  }

  private readPersistedScripts(): PersistedUserScripts {
    const filePath = this.getStorageFilePath()
    if (!filePath || !existsSync(filePath)) return { version: 1, extensions: {} }

    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<PersistedUserScripts>
      if (parsed.version !== 1 || !parsed.extensions || typeof parsed.extensions !== 'object') {
        return { version: 1, extensions: {} }
      }
      return { version: 1, extensions: parsed.extensions }
    } catch (error) {
      console.warn('[electron-chrome-extensions] unable to read persisted user scripts', {
        filePath,
        message: error instanceof Error ? error.message : String(error)
      })
      return { version: 1, extensions: {} }
    }
  }

  private persistExtension(extensionId: string): void {
    const filePath = this.getStorageFilePath()
    if (!filePath) return

    const persisted = this.readPersistedScripts()
    const target = this.scripts.get(extensionId)
    if (!target) {
      delete persisted.extensions[extensionId]
    } else {
      persisted.extensions[extensionId] = {
        scripts: [...target.scripts.values()],
        worlds: Object.fromEntries(target.worlds)
      }
    }

    try {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, JSON.stringify(persisted), 'utf8')
    } catch (error) {
      console.warn('[electron-chrome-extensions] unable to persist user scripts', {
        extensionId,
        filePath,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private restoreExtension(extension: Electron.Extension): void {
    const saved = this.readPersistedScripts().extensions[extension.id]
    if (!saved) return

    const target = this.getExtensionScripts(extension)
    target.scripts.clear()
    target.worlds.clear()
    target.worlds.set('default', {})

    for (const script of saved.scripts ?? []) {
      if (script.id) target.scripts.set(script.id, script)
    }
    for (const [worldId, properties] of Object.entries(saved.worlds ?? {})) {
      target.worlds.set(worldId, properties)
    }

    console.info('[electron-chrome-extensions] restored persisted user scripts', {
      extensionId: extension.id,
      scriptCount: target.scripts.size,
      storagePath: this.getStorageFilePath()
    })
    this.settleInitialization(extension.id, 'restored')
  }

  private restoreLoadedExtensions(): void {
    const sessionExtensions = this.ctx.session.extensions || this.ctx.session
    sessionExtensions.getAllExtensions().forEach((extension) => this.restoreExtension(extension))
  }

  private observeExtensions(): void {
    const sessionExtensions = this.ctx.session.extensions || this.ctx.session
    sessionExtensions.on('extension-loaded', (_event, extension) => this.restoreExtension(extension))
    sessionExtensions.on('extension-unloaded', (_event, extension) => this.scripts.delete(extension.id))
  }

  private getInitializationWaiter(extensionId: string): InitializationWaiter {
    let waiter = this.initializationWaiters.get(extensionId)
    if (!waiter) {
      waiter = { waiters: new Set(), workerStarted: false }
      this.initializationWaiters.set(extensionId, waiter)
    }
    return waiter
  }

  private settleInitialization(
    extensionId: string,
    state: UserScriptsInitialization['state']
  ): UserScriptsInitialization {
    const waiter = this.getInitializationWaiter(extensionId)
    if (waiter.settlementTimer) {
      clearTimeout(waiter.settlementTimer)
      waiter.settlementTimer = undefined
    }
    const existing = waiter.settled
    if (existing && state !== 'registered') return existing

    const result: UserScriptsInitialization = {
      extensionId,
      scriptCount: this.scripts.get(extensionId)?.scripts.size ?? 0,
      state
    }
    waiter.settled = result
    waiter.waiters.forEach((resolve) => resolve(result))
    waiter.waiters.clear()
    console.info('[electron-chrome-extensions] user scripts initialization settled', result)
    return result
  }

  private scheduleInitializationSettlement(extensionId: string): void {
    const waiter = this.getInitializationWaiter(extensionId)
    if (waiter.settlementTimer) clearTimeout(waiter.settlementTimer)

    // MV3 extensions may register their initial scripts in several sequential
    // calls. Wait for a short quiet period so navigation observes the complete
    // registration batch rather than only the first call.
    waiter.settlementTimer = setTimeout(() => {
      waiter.settlementTimer = undefined
      this.settleInitialization(extensionId, 'registered')
    }, 50)
  }

  async waitForExtensionInitialization(
    extensionId: string,
    timeoutMs = 10_000
  ): Promise<UserScriptsInitialization> {
    const existingScripts = this.scripts.get(extensionId)?.scripts.size ?? 0
    const waiter = this.getInitializationWaiter(extensionId)
    if (waiter.settled?.state === 'registered') return waiter.settled

    // chrome.userScripts registrations survive service worker termination. Once
    // restored into this Session, they are safe to inject before the worker
    // performs an optional refresh/update cycle.
    if (existingScripts > 0) {
      const scope = `chrome-extension://${extensionId}/`
      if (!waiter.workerStarted) {
        waiter.workerStarted = true
        void this.ctx.session.serviceWorkers.startWorkerForScope(scope).then(
          () => console.info('[electron-chrome-extensions] MV3 worker started for restored user scripts', {
            extensionId,
            scope
          }),
          (error) => console.warn('[electron-chrome-extensions] unable to start MV3 worker for restored user scripts', {
            extensionId,
            scope,
            message: error instanceof Error ? error.message : String(error)
          })
        )
      }
      return this.settleInitialization(extensionId, 'restored')
    }

    if (!waiter.workerStarted || waiter.settled?.state === 'restored') {
      waiter.workerStarted = true
      waiter.settled = undefined
      const scope = `chrome-extension://${extensionId}/`
      console.info('[electron-chrome-extensions] waiting for MV3 user scripts initialization', {
        extensionId,
        scope,
        timeoutMs,
        storagePath: this.getStorageFilePath()
      })
      void this.ctx.session.serviceWorkers.startWorkerForScope(scope).then(
        () => console.info('[electron-chrome-extensions] MV3 worker started for user scripts initialization', {
          extensionId,
          scope
        }),
        (error) => console.warn('[electron-chrome-extensions] unable to start MV3 worker for user scripts initialization', {
          extensionId,
          scope,
          message: error instanceof Error ? error.message : String(error)
        })
      )
    }

    return await new Promise<UserScriptsInitialization>((resolve) => {
      const timer = setTimeout(() => {
        waiter.waiters.delete(onSettled)
        const result = {
          extensionId,
          scriptCount: this.scripts.get(extensionId)?.scripts.size ?? 0,
          state: 'timed-out' as const
        }
        console.warn('[electron-chrome-extensions] user scripts initialization timed out', {
          ...result,
          storagePath: this.getStorageFilePath()
        })
        resolve(result)
      }, timeoutMs)
      const onSettled = (result: UserScriptsInitialization) => {
        clearTimeout(timer)
        resolve(result)
      }
      waiter.waiters.add(onSettled)
    })
  }

  private installDocumentStartHandler(): void {
    if (documentStartHandlerInstalled) return
    documentStartHandlerInstalled = true
    ipcMain.on(documentStartChannel, (event, details: { url?: string; topFrame?: boolean }) => {
      const api = instances.get(event.sender.session)
      const scripts = api?.getDocumentScripts(details.url ?? '', details.topFrame === true) ?? []
      console.info('[electron-chrome-extensions] document user scripts query', {
        webContentsId: event.sender.id,
        sessionStoragePath: event.sender.session.getStoragePath(),
        url: details.url ?? '',
        topFrame: details.topFrame === true,
        scriptCount: scripts.length
      })
      event.returnValue = scripts
    })
    ipcMain.on(executionChannel, (event, details: Record<string, unknown>) => {
      const api = instances.get(event.sender.session)
      if (!api) return
      console.info('[electron-chrome-extensions] user script execution', {
        webContentsId: event.sender.id,
        sessionStoragePath: event.sender.session.getStoragePath(),
        ...details
      })
    })
  }

  private getExtensionScripts(extension: Electron.Extension): ExtensionScripts {
    let scripts = this.scripts.get(extension.id)
    if (!scripts) {
      scripts = {
        extension,
        scripts: new Map(),
        worlds: new Map([['default', {}]])
      }
      this.scripts.set(extension.id, scripts)
    }
    return scripts
  }

  getDocumentScripts(url: string, topFrame: boolean): DocumentUserScript[] {
    if (!url) return []

    const result: DocumentUserScript[] = []
    for (const [extensionId, extensionScripts] of this.scripts) {
      for (const script of extensionScripts.scripts.values()) {
        if (!script.allFrames && !topFrame) continue
        if (!matchesScript(script, url)) continue

        const code = getScriptCode(extensionScripts.extension, script)
        if (!code) continue

        const configuredWorldId = script.worldId ?? 'default'
        const world = script.world ?? 'USER_SCRIPT'
        const worldProperties = extensionScripts.worlds.get(configuredWorldId) ?? {}
        result.push({
          code: `${code}\nvoid 0\n//# sourceURL=chrome-extension://${extensionId}/${encodeURIComponent(script.id ?? 'user-script')}.user-script.js`,
          extensionId,
          runAt: script.runAt ?? 'document_idle',
          scriptId: script.id!,
          world,
          worldCsp: worldProperties.csp,
          worldId: createWorldId(extensionId, configuredWorldId),
          worldName: `Chrome USER_SCRIPT: ${extensionId}/${configuredWorldId}`,
          worldOrigin: `chrome-extension://${extensionId}`
        })
      }
    }

    result.sort((left, right) => {
      if (left.extensionId !== right.extensionId) {
        return left.extensionId.localeCompare(right.extensionId)
      }
      return left.scriptId.localeCompare(right.scriptId, 'en', { numeric: true })
    })

    console.info('[electron-chrome-extensions] user scripts resolved for document', {
      url,
      topFrame,
      registeredExtensions: this.scripts.size,
      scripts: result.map((script) => ({
        extensionId: script.extensionId,
        scriptId: script.scriptId,
        runAt: script.runAt,
        world: script.world
      }))
    })
    return result
  }

  register = async (event: ExtensionEvent, scripts: UserScript[]): Promise<void> => {
    const extensionId = event.extension.id
    const target = this.getExtensionScripts(event.extension)
    if (scripts.some((script) => !script.id || script.id.startsWith('_'))) {
      throw new Error('User script IDs must be non-empty and cannot start with "_"')
    }
    if (scripts.some((script) => !script.js?.length || !script.matches?.length)) {
      throw new Error('User scripts require non-empty js and matches arrays')
    }
    const ids = new Set(scripts.map((script) => script.id!))
    if (ids.size !== scripts.length || scripts.some((script) => target.scripts.has(script.id!))) {
      throw new Error('A user script with this ID is already registered')
    }
    scripts.forEach((script) => target.scripts.set(script.id!, { ...script }))
    this.persistExtension(extensionId)
    this.scheduleInitializationSettlement(extensionId)
    console.info('[electron-chrome-extensions] user scripts registered', {
      extensionId,
      scripts: scripts.map((script) => ({
        id: script.id,
        runAt: script.runAt ?? 'document_idle',
        world: script.world ?? 'USER_SCRIPT',
        worldId: script.worldId ?? 'default',
        sources: script.js?.map((item: any) => item.file || (item.code ? 'inline' : 'unknown'))
      }))
    })
  }

  unregister = async (event: ExtensionEvent, details: { ids?: string[] }): Promise<void> => {
    const target = this.getExtensionScripts(event.extension)
    if (!details.ids) {
      target.scripts.clear()
      this.persistExtension(event.extension.id)
      return
    }
    for (const id of details.ids) target.scripts.delete(id)
    this.persistExtension(event.extension.id)
  }

  update = async (event: ExtensionEvent, scripts: UserScript[]): Promise<void> => {
    const target = this.getExtensionScripts(event.extension)
    if (scripts.some((update) => !update.id || !target.scripts.has(update.id))) {
      throw new Error('Cannot update an unknown user script')
    }
    const updated = scripts.map((update) => ({ ...target.scripts.get(update.id!)!, ...update }))
    updated.forEach((script) => target.scripts.set(script.id!, script))
    this.persistExtension(event.extension.id)
    this.scheduleInitializationSettlement(event.extension.id)
    console.info('[electron-chrome-extensions] user scripts updated', {
      extensionId: event.extension.id,
      scriptIds: scripts.map((script) => script.id)
    })
  }

  getScripts = async (event: ExtensionEvent, filter?: { ids?: string[] }): Promise<UserScript[]> => {
    const scripts = [...this.getExtensionScripts(event.extension).scripts.values()]
    const result = filter?.ids ? scripts.filter((script) => filter.ids!.includes(script.id!)) : scripts
    console.info('[electron-chrome-extensions] user scripts queried', {
      extensionId: event.extension.id,
      filterIds: filter?.ids ?? null,
      scriptCount: result.length
    })
    return result
  }

  configureWorld = async (event: ExtensionEvent, properties: WorldProperties): Promise<void> => {
    const worldId = properties.worldId ?? 'default'
    if (worldId.startsWith('_')) throw new Error('User script world IDs starting with "_" are reserved')
    const target = this.getExtensionScripts(event.extension)
    target.worlds.set(worldId, { ...properties, worldId })
    this.persistExtension(event.extension.id)
    console.info('[electron-chrome-extensions] user script world configured', {
      extensionId: event.extension.id,
      worldId,
      hasCsp: typeof properties.csp === 'string',
      messaging: properties.messaging === true
    })
  }
}
