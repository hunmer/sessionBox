import { session } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import type { BrowserWindow, Session, WebContents } from 'electron'
import { listAccounts, listExtensions, type Extension } from './store'

const extensionRuntimeLicense = process.env.ELECTRON_CHROME_EXTENSIONS_LICENSE || 'GPL-3.0'
const defaultPartitionKey = '__default__'

type PartitionKey = string

// 每个 partition 一个扩展管理器实例。
const extensionsMap = new Map<PartitionKey, ElectronChromeExtensions>()

// 记录应用内扩展 ID 到 Electron 实际扩展 ID 的映射。
const partitionExtensionIds = new Map<PartitionKey, Map<string, string>>()

// 缓存扩展信息，供工具栏等 UI 使用。
const extensionInfoMap = new Map<string, { name: string; icon?: string }>()

// 避免同一 partition 并发重复加载同一个扩展。
const pendingLoads = new Map<string, Promise<string>>()

function getPartitionKey(accountId?: string | null): PartitionKey {
  return accountId ? `persist:account-${accountId}` : defaultPartitionKey
}

function getSessionForAccount(accountId?: string | null): Session {
  return accountId ? session.fromPartition(getPartitionKey(accountId)) : session.defaultSession
}

function getLoadedMap(partitionKey: PartitionKey): Map<string, string> {
  let loadedMap = partitionExtensionIds.get(partitionKey)
  if (!loadedMap) {
    loadedMap = new Map<string, string>()
    partitionExtensionIds.set(partitionKey, loadedMap)
  }
  return loadedMap
}

function getAllKnownAccountIds(): string[] {
  return listAccounts().map((account) => account.id)
}

function getAllTargetAccountIds(): Array<string | null> {
  return [null, ...getAllKnownAccountIds()]
}

function getEnabledExtensions(): Extension[] {
  return listExtensions().filter((extension) => extension.enabled)
}

function getLoadedElectronExtensionId(
  browserSession: Session,
  extensionPath: string
): string | undefined {
  const sessionExtensions = browserSession.extensions || browserSession
  return sessionExtensions
    .getAllExtensions()
    .find((loadedExtension) => loadedExtension.path === extensionPath)?.id
}

function createExtensionsInstance(browserSession: Session): ElectronChromeExtensions {
  const instance = new ElectronChromeExtensions({
    license: extensionRuntimeLicense,
    session: browserSession,
    createTab(details) {
      console.log('[Extensions] createTab requested:', details)
      return undefined as unknown as [WebContents, BrowserWindow]
    },
    selectTab(webContents) {
      console.log('[Extensions] selectTab:', webContents.id)
    },
    removeTab(webContents) {
      console.log('[Extensions] removeTab:', webContents.id)
    }
  })

  ElectronChromeExtensions.handleCRXProtocol(browserSession)
  return instance
}

/**
 * 获取或创建 partition 对应的 ElectronChromeExtensions 实例。
 */
export function getExtensionsForAccount(accountId?: string | null): ElectronChromeExtensions {
  const partitionKey = getPartitionKey(accountId)

  if (!extensionsMap.has(partitionKey)) {
    const browserSession = getSessionForAccount(accountId)
    extensionsMap.set(partitionKey, createExtensionsInstance(browserSession))
  }

  return extensionsMap.get(partitionKey)!
}

async function loadExtensionIntoAccount(
  accountId: string | null | undefined,
  extension: Extension
): Promise<string> {
  const partitionKey = getPartitionKey(accountId)
  const browserSession = getSessionForAccount(accountId)
  const loadedMap = getLoadedMap(partitionKey)

  const existingLoadedId =
    loadedMap.get(extension.id) || getLoadedElectronExtensionId(browserSession, extension.path)
  if (existingLoadedId) {
    loadedMap.set(extension.id, existingLoadedId)
    extensionInfoMap.set(`${partitionKey}:${existingLoadedId}`, {
      name: extension.name,
      icon: extension.icon
    })
    return existingLoadedId
  }

  const pendingKey = `${partitionKey}:${extension.id}`
  const existingTask = pendingLoads.get(pendingKey)
  if (existingTask) {
    return existingTask
  }

  const loadTask = (async () => {
    getExtensionsForAccount(accountId)

    console.log('[Extensions] Loading extension into partition:', {
      partitionKey,
      extensionId: extension.id,
      path: extension.path
    })

    const loadedExt = await browserSession.loadExtension(extension.path)
    loadedMap.set(extension.id, loadedExt.id)
    extensionInfoMap.set(`${partitionKey}:${loadedExt.id}`, {
      name: extension.name,
      icon: extension.icon
    })

    return loadedExt.id
  })()

  pendingLoads.set(pendingKey, loadTask)

  try {
    return await loadTask
  } finally {
    pendingLoads.delete(pendingKey)
  }
}

/**
 * 确保某个 partition 已加载全部全局扩展。
 */
export async function ensureExtensionsLoadedForAccount(
  accountId?: string | null
): Promise<void> {
  const enabledExtensions = getEnabledExtensions()
  for (const extension of enabledExtensions) {
    await loadExtensionIntoAccount(accountId, extension)
  }
}

/**
 * 将扩展加载到所有 partition。
 */
export async function loadExtensionForAllAccounts(extension: Extension): Promise<void> {
  console.log('[loadExtensionForAllAccounts] Starting...', {
    extensionId: extension.id,
    extensionPath: extension.path,
    license: extensionRuntimeLicense
  })

  const targets = getAllTargetAccountIds()
  for (const accountId of targets) {
    await loadExtensionIntoAccount(accountId, extension)
  }
}

async function unloadExtensionFromAccount(
  accountId: string | null | undefined,
  extensionId: string
): Promise<void> {
  const partitionKey = getPartitionKey(accountId)
  const browserSession = getSessionForAccount(accountId)
  const loadedMap = getLoadedMap(partitionKey)
  const electronExtensionId = loadedMap.get(extensionId)

  if (!electronExtensionId) {
    return
  }

  await browserSession.unloadExtension(electronExtensionId)
  loadedMap.delete(extensionId)
  extensionInfoMap.delete(`${partitionKey}:${electronExtensionId}`)
}

/**
 * 从所有 partition 卸载扩展。
 */
export async function unloadExtensionFromAllAccounts(extensionId: string): Promise<void> {
  const targets = getAllTargetAccountIds()
  for (const accountId of targets) {
    await unloadExtensionFromAccount(accountId, extensionId)
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
 * 销毁 partition 对应的扩展管理器实例。
 */
export function destroyExtensionsForAccount(accountId?: string | null): void {
  const partitionKey = getPartitionKey(accountId)
  const ext = extensionsMap.get(partitionKey)
  if (!ext) return

  extensionsMap.delete(partitionKey)
  partitionExtensionIds.delete(partitionKey)

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
