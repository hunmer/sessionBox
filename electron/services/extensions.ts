import { app, BrowserWindow, session } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import type { BrowserWindow, Session } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  deleteTab as deleteStoredTab,
  createExtension,
  listContainers,
  listExtensions,
  type Extension,
  updateExtension
} from './store'
import { webviewManager } from './webview-manager'

const extensionRuntimeLicense = (process.env.ELECTRON_CHROME_EXTENSIONS_LICENSE ||
  'GPL-3.0') as 'GPL-3.0' | 'Patron-License-2020-11-19'
const defaultPartitionKey = '__default__'

type PartitionKey = string

// 每个 partition 一个扩展管理器实例。
const extensionsMap = new Map<PartitionKey, ElectronChromeExtensions>()

// 记录应用内扩展 ID 到 Electron 实际扩展 ID 的映射。
const partitionExtensionIds = new Map<PartitionKey, Map<string, string>>()

// 缓存扩展信息，供工具栏等 UI 使用。
const extensionInfoMap = new Map<string, { name: string; icon?: string }>()

// windows.create 创建的扩展窗口不属于主窗口；卸载扩展前必须先关闭它们，
// 否则 renderer 仍会尝试初始化 chrome API。
const extensionPopupWindows = new Map<PartitionKey, Set<BrowserWindow>>()

// 避免同一 partition 并发重复加载同一个扩展。
const pendingLoads = new Map<string, Promise<string>>()

type RendererTabCreateRequest = {
  requestId: string
  url: string
  containerId: string
  active: boolean
}

type PendingRendererTabCreate = {
  resolve: (tabId: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const pendingRendererTabCreates = new Map<string, PendingRendererTabCreate>()

function getPartitionKey(containerId?: string | null): PartitionKey {
  return containerId ? `persist:container-${containerId}` : defaultPartitionKey
}

function getSessionForContainer(containerId?: string | null): Session {
  return containerId ? session.fromPartition(getPartitionKey(containerId)) : session.defaultSession
}

function getLoadedMap(partitionKey: PartitionKey): Map<string, string> {
  let loadedMap = partitionExtensionIds.get(partitionKey)
  if (!loadedMap) {
    loadedMap = new Map<string, string>()
    partitionExtensionIds.set(partitionKey, loadedMap)
  }
  return loadedMap
}

function getAllKnownContainerIds(): string[] {
  return listContainers().map((container) => container.id)
}

function getAllTargetContainerIds(): Array<string | null> {
  return [null, ...getAllKnownContainerIds()]
}

function getEnabledExtensions(): Extension[] {
  const testExtensionPath = process.env.SESSIONBOX_TEST_EXTENSION_PATH
  if (testExtensionPath) {
    const existing = listExtensions().find((extension) => extension.path === testExtensionPath)
    if (existing) {
      if (!existing.enabled) updateExtension(existing.id, { enabled: true })
    } else if (existsSync(join(testExtensionPath, 'manifest.json'))) {
      let name = 'SessionBox test extension'
      try {
        const manifest = JSON.parse(readFileSync(join(testExtensionPath, 'manifest.json'), 'utf8'))
        name = manifest.name || manifest.short_name || name
      } catch {
        // The load path is validated below; keep a stable fallback name here.
      }
      createExtension({ name, path: testExtensionPath, enabled: true })
      console.info('[Extensions] test extension registered', { path: testExtensionPath })
    }
  }
  return listExtensions().filter((extension) => extension.enabled)
}

function extensionRequestsUserScripts(extensionPath: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(extensionPath, 'manifest.json'), 'utf8')) as {
      permissions?: string[]
      optional_permissions?: string[]
    }
    return [...(manifest.permissions ?? []), ...(manifest.optional_permissions ?? [])].includes('userScripts')
  } catch {
    return false
  }
}

function getProfilePreferencesPath(containerId?: string | null): string {
  return containerId
    ? join(app.getPath('userData'), 'Partitions', `container-${containerId}`, 'Preferences')
    : join(app.getPath('userData'), 'Preferences')
}

function enableUserScriptsInProfile(preferencesPath: string, electronExtensionId: string): void {
  if (!existsSync(preferencesPath)) return
  try {
    const preferences = JSON.parse(readFileSync(preferencesPath, 'utf8')) as Record<string, any>
    const settings = preferences.extensions ??= {}
    const extensionSettings = settings.settings ??= {}
    const extension = extensionSettings[electronExtensionId] ??= {}
    if (extension.user_scripts_enabled === true) return
    extension.user_scripts_enabled = true
    writeFileSync(preferencesPath, JSON.stringify(preferences), 'utf8')
  } catch (error) {
    console.warn('[Extensions] Failed to enable user scripts preference:', preferencesPath, error)
  }
}

/**
 * Electron does not expose Chromium's developerPrivate API. Seed the Chromium
 * preference before any extension session is initialized on the next launch.
 */
export function prepareUserScriptPreferences(): void {
  for (const extension of getEnabledExtensions()) {
    if (!extension.userScriptsEnabled || !extension.electronExtensionId) continue
    enableUserScriptsInProfile(getProfilePreferencesPath(null), extension.electronExtensionId)
    for (const container of listContainers()) {
      enableUserScriptsInProfile(getProfilePreferencesPath(container.id), extension.electronExtensionId)
    }
  }
}

function getLoadedElectronExtensionId(
  browserSession: Session,
  extensionPath: string
): string | undefined {
  return browserSession.extensions
    .getAllExtensions()
    .find((loadedExtension) => loadedExtension.path === extensionPath)?.id
}

async function unloadElectronExtension(
  browserSession: Session,
  electronExtensionId: string
): Promise<void> {
  const partitionKey = browserSession === session.defaultSession
    ? defaultPartitionKey
    : [...extensionsMap.entries()].find(([, instance]) =>
        instance === ElectronChromeExtensions.fromSession(browserSession)
      )?.[0]
  const popupWindows = partitionKey ? extensionPopupWindows.get(partitionKey) : undefined
  if (popupWindows) {
    for (const popupWindow of [...popupWindows]) {
      if (!popupWindow.isDestroyed()) popupWindow.destroy()
    }
    popupWindows.clear()
  }
  browserSession.extensions.removeExtension(electronExtensionId)
}

function requestRendererTabCreate(
  mainWindow: BrowserWindow,
  request: Omit<RendererTabCreateRequest, 'requestId'>
): Promise<string> {
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRendererTabCreates.delete(requestId)
      reject(new Error('Timed out waiting for tabStore to create extension tab'))
    }, 10_000)
    pendingRendererTabCreates.set(requestId, { resolve, reject, timer })
    mainWindow.webContents.send('on:extension:tab:create', { requestId, ...request })
  })
}

export function completeRendererTabCreate(
  requestId: string,
  result: { tabId?: string; error?: string }
): boolean {
  const pending = pendingRendererTabCreates.get(requestId)
  if (!pending) return false
  pendingRendererTabCreates.delete(requestId)
  clearTimeout(pending.timer)
  if (result.error || !result.tabId) {
    pending.reject(new Error(result.error || 'tabStore did not return a tab ID'))
  } else {
    pending.resolve(result.tabId)
  }
  return true
}

function createExtensionsInstance(
  browserSession: Session,
  containerId?: string | null
): ElectronChromeExtensions {
  const partitionKey = getPartitionKey(containerId)
  const popupWindows = extensionPopupWindows.get(partitionKey) || new Set<BrowserWindow>()
  extensionPopupWindows.set(partitionKey, popupWindows)
  const instance = new ElectronChromeExtensions({
    license: extensionRuntimeLicense,
    session: browserSession,
    async createTab(details) {
      console.info('[Extensions] tabs.create requested', {
        containerId: containerId || null,
        url: details.url,
        active: details.active
      })

      const mainWindow = webviewManager.getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('Main window is not available')
      }

      const tabUrl = details.url || 'https://www.baidu.com'
      const tabId = await requestRendererTabCreate(mainWindow, {
        url: tabUrl,
        containerId: containerId || '',
        active: details.active !== false
      })
      webviewManager.ensureWebContentsForTab(tabId)
      const webContents = await webviewManager.waitForWebContents(tabId)

      console.info('[Extensions] tabs.create completed through tabStore', { tabId, url: tabUrl })
      return [webContents, mainWindow]
    },
    async createWindow(details) {
      const popupWindow = new BrowserWindow({
        width: details.width || 640,
        height: details.height || 420,
        show: details.focused !== false,
        webPreferences: {
          session: browserSession,
          contextIsolation: true,
        },
      })
      popupWindows.add(popupWindow)
      popupWindow.once('closed', () => popupWindows.delete(popupWindow))
      const url = typeof details.url === 'string' ? details.url : 'about:blank'
      await popupWindow.loadURL(url)
      return popupWindow
    },
    async removeWindow(window) {
      const mainWindow = webviewManager.getMainWindow()
      if (window !== mainWindow && !window.isDestroyed()) {
        window.destroy()
      }
    },
    selectTab(webContents) {
      webviewManager.switchByWebContents(webContents)
    },
    removeTab(webContents) {
      // Guest 因渲染进程 reload 被销毁时，只清理扩展内部引用，由 WebviewManager 重建。
      if (webContents.isDestroyed()) return

      const tabId = webviewManager.destroyByWebContents(webContents)
      if (!tabId) return

      deleteStoredTab(tabId)

      const mainWindow = webviewManager.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('on:tab:removed', tabId)
      }
    }
  })

  // Forward action state changes to the host toolbar. The extension preload
  // observes this internally, but the application's Vue toolbar does not.
  instance.on('browser-action-update', () => {
    const mainWindow = webviewManager.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('extension:browser-action-update')
    }
  })

  ElectronChromeExtensions.handleCRXProtocol(browserSession)
  return instance
}

export function getBrowserActionStateForActiveTab(): { activeTabId?: number; actions: any[] } {
  const activeTabId = webviewManager.getActiveTabId()
  if (!activeTabId) return { actions: [] }
  const webContents = webviewManager.getWebContents(activeTabId)
  if (!webContents) return { actions: [] }
  const extensions = ElectronChromeExtensions.fromSession(webContents.session)
  if (!extensions) return { actions: [] }
  return (extensions as any).api.browserAction.getState()
}

/**
 * 获取或创建 partition 对应的 ElectronChromeExtensions 实例。
 */
export function getExtensionsForContainer(containerId?: string | null): ElectronChromeExtensions {
  const partitionKey = getPartitionKey(containerId)

  if (!extensionsMap.has(partitionKey)) {
    const browserSession = getSessionForContainer(containerId)
    extensionsMap.set(partitionKey, createExtensionsInstance(browserSession, containerId))
  }

  return extensionsMap.get(partitionKey)!
}

async function loadExtensionIntoContainer(
  containerId: string | null | undefined,
  extension: Extension
): Promise<string> {
  const partitionKey = getPartitionKey(containerId)
  const browserSession = getSessionForContainer(containerId)
  const loadedMap = getLoadedMap(partitionKey)

  const existingLoadedId =
    loadedMap.get(extension.id) || getLoadedElectronExtensionId(browserSession, extension.path)
  if (existingLoadedId) {
    // The smoke-test extension is loaded directly from the workspace. Force a
    // fresh load so edits to popup/background assets are visible on restart.
    if (process.env.SESSIONBOX_TEST_EXTENSION_PATH === extension.path) {
      await unloadElectronExtension(browserSession, existingLoadedId)
      loadedMap.delete(extension.id)
    } else {
      loadedMap.set(extension.id, existingLoadedId)
      extensionInfoMap.set(`${partitionKey}:${existingLoadedId}`, {
        name: extension.name,
        icon: extension.icon
      })
      if (extension.userScriptsEnabled && extension.electronExtensionId) {
        enableUserScriptsInProfile(getProfilePreferencesPath(containerId), extension.electronExtensionId)
      }
      await waitForUserScriptsInitialization(containerId, extension, existingLoadedId)
      return existingLoadedId
    }
  }

  const pendingKey = `${partitionKey}:${extension.id}`
  const existingTask = pendingLoads.get(pendingKey)
  if (existingTask) {
    return existingTask
  }

  const loadTask = (async () => {
    await getExtensionsForContainer(containerId).whenReady()
    console.info('[Extensions] extension API preload is ready', { partitionKey })

    const loadedExt = await browserSession.loadExtension(extension.path)
    const userScriptsEnabled = extensionRequestsUserScripts(extension.path)
    if (extension.electronExtensionId !== loadedExt.id || extension.userScriptsEnabled !== userScriptsEnabled) {
      extension.electronExtensionId = loadedExt.id
      extension.userScriptsEnabled = userScriptsEnabled
      updateExtension(extension.id, {
        electronExtensionId: loadedExt.id,
        userScriptsEnabled
      })
    }
    loadedMap.set(extension.id, loadedExt.id)
    extensionInfoMap.set(`${partitionKey}:${loadedExt.id}`, {
      name: extension.name,
      icon: extension.icon
    })

    await waitForUserScriptsInitialization(containerId, extension, loadedExt.id)
    return loadedExt.id
  })()

  pendingLoads.set(pendingKey, loadTask)

  try {
    return await loadTask
  } finally {
    pendingLoads.delete(pendingKey)
  }
}

async function waitForUserScriptsInitialization(
  containerId: string | null | undefined,
  extension: Extension,
  electronExtensionId: string
): Promise<void> {
  // The persisted flag may come from an older install before userScripts was
  // detected. Re-read the manifest so a stale `false` cannot skip the barrier.
  const usesUserScripts = extension.userScriptsEnabled === true || extensionRequestsUserScripts(extension.path)
  if (!usesUserScripts) return

  const initialization = await getExtensionsForContainer(containerId).whenUserScriptsReady(
    electronExtensionId,
    10_000
  )
  console.info('[Extensions] user scripts initialization barrier completed', {
    partitionKey: getPartitionKey(containerId),
    extensionId: extension.id,
    electronExtensionId,
    state: initialization.state,
    scriptCount: initialization.scriptCount
  })
}

/**
 * 确保某个 partition 已加载全部全局扩展。
 */
export async function ensureExtensionsLoadedForContainer(
  containerId?: string | null
): Promise<void> {
  const enabledExtensions = getEnabledExtensions()
  console.info('[Extensions] session initialization started', {
    partitionKey: getPartitionKey(containerId),
    storagePath: getSessionForContainer(containerId).getStoragePath(),
    extensionIds: enabledExtensions.map((extension) => extension.id)
  })
  for (const extension of enabledExtensions) {
    await loadExtensionIntoContainer(containerId, extension)
  }
  console.info('[Extensions] session initialization completed', {
    partitionKey: getPartitionKey(containerId),
    storagePath: getSessionForContainer(containerId).getStoragePath(),
    extensionIds: enabledExtensions.map((extension) => extension.id)
  })
}

/**
 * 将扩展加载到所有 partition。
 */
export async function loadExtensionForAllContainers(extension: Extension): Promise<void> {
  const targets = getAllTargetContainerIds()
  for (const containerId of targets) {
    await loadExtensionIntoContainer(containerId, extension)
  }
}

async function unloadExtensionFromContainer(
  containerId: string | null | undefined,
  extensionId: string
): Promise<void> {
  const partitionKey = getPartitionKey(containerId)
  const browserSession = getSessionForContainer(containerId)
  const loadedMap = getLoadedMap(partitionKey)
  const extension = listExtensions().find((item) => item.id === extensionId)
  const electronExtensionId =
    loadedMap.get(extensionId) ||
    (extension ? getLoadedElectronExtensionId(browserSession, extension.path) : undefined)

  if (!electronExtensionId) {
    return
  }

  await unloadElectronExtension(browserSession, electronExtensionId)
  loadedMap.delete(extensionId)
  extensionInfoMap.delete(`${partitionKey}:${electronExtensionId}`)
}

/**
 * 从所有 partition 卸载扩展。
 */
export async function unloadExtensionFromAllContainers(extensionId: string): Promise<void> {
  const targets = getAllTargetContainerIds()
  for (const containerId of targets) {
    await unloadExtensionFromContainer(containerId, extensionId)
  }
}

/**
 * 获取当前全局生效的扩展 ID 列表。
 */
export function getLoadedExtensionIds(): string[] {
  return getEnabledExtensions().map((extension) => extension.id)
}

/**
 * 根据 partition 和 Electron 扩展 ID 获取扩展信息。
 */
export function getExtensionInfo(
  partition: string,
  extensionId: string
): { name: string; icon?: string } | undefined {
  return extensionInfoMap.get(`${partition}:${extensionId}`)
}

/**
 * 打开扩展的 browser action popup。
 * @param extensionAppId 应用级扩展 ID（Extension.id）
 * @param anchorRect 弹出窗口的锚点位置
 */
export function openExtensionBrowserActionPopup(
  extensionAppId: string,
  anchorRect: { x: number; y: number; width: number; height: number; alignment?: string }
): void {
  const activeTabId = webviewManager.getActiveTabId()
  if (!activeTabId) {
    console.warn('[Extensions] Cannot open browser action popup without an active tab')
    return
  }

  const activeWebContents = webviewManager.getWebContents(activeTabId)
  const activeTab = webviewManager.getViewInfo(activeTabId)
  if (!activeWebContents || !activeTab) {
    console.warn('[Extensions] Active tab is not available for browser action popup', { activeTabId })
    return
  }

  const containerId = activeTab.containerId || null
  const partitionKey = getPartitionKey(containerId)
  const ext = ElectronChromeExtensions.fromSession(activeWebContents.session)
  if (!ext) {
    console.warn('[Extensions] No ElectronChromeExtensions instance for active tab session:', {
      activeTabId,
      partitionKey
    })
    return
  }

  // 从 store 中通过 path 在 session 里找到 electron 级别 ID
  const extension = listExtensions().find((e) => e.id === extensionAppId)
  if (!extension) return

  const browserSession = activeWebContents.session
  const electronExt = browserSession.extensions.getAllExtensions().find(
    (e) => e.path === extension.path
  )
  if (!electronExt) {
    console.warn('[Extensions] Extension is not loaded in the active tab session', {
      activeTabId,
      containerId,
      extensionAppId
    })
    return
  }

  ;(ext as any).api.browserAction.openPopup(
    { extension: { id: electronExt.id } } as any,
    { anchorRect, tabId: activeWebContents.id, alignment: anchorRect.alignment }
  )
}

/**
 * 销毁 partition 对应的扩展管理器实例。
 */
export function destroyExtensionsForContainer(containerId?: string | null): void {
  const partitionKey = getPartitionKey(containerId)
  const ext = extensionsMap.get(partitionKey)
  if (!ext) return

  extensionsMap.delete(partitionKey)
  partitionExtensionIds.delete(partitionKey)
  extensionPopupWindows.delete(partitionKey)

  for (const key of [...extensionInfoMap.keys()]) {
    if (key.startsWith(`${partitionKey}:`)) {
      extensionInfoMap.delete(key)
    }
  }
}

/**
 * 处理扩展 popup 创建事件。
 */
export function setupExtensionPopupHandler(_mainWindow: BrowserWindow): void {
  for (const [, ext] of extensionsMap) {
    ext.on('browser-action-popup-created', () => {
      console.log('[Extensions] Browser action popup created')
    })
  }
}
