import { session } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { getAccountById, addExtensionToAccount, removeExtensionFromAccount, getAccountExtensions, Extension } from './store'
import { webviewManager } from './webview-manager'

// 每个 partition 一个扩展管理器实例
const extensionsMap = new Map<string, ElectronChromeExtensions>()

// 扩展的 manifest 信息缓存
const extensionInfoMap = new Map<string, { name: string; icon?: string }>()

/**
 * 获取或创建账号的 ElectronChromeExtensions 实例
 */
export function getExtensionsForAccount(accountId: string): ElectronChromeExtensions | null {
  const account = getAccountById(accountId)
  if (!account) return null

  const partition = `persist:account-${accountId}`

  if (!extensionsMap.has(partition)) {
    const browserSession = session.fromPartition(partition)

    const extensions = new ElectronChromeExtensions({
      session: browserSession,
      createTab(details) {
        // 集成到 webviewManager 创建新标签
        // 这里需要与 tab 系统联动，暂时返回 undefined
        console.log('[Extensions] createTab requested:', details)
        return undefined as unknown as [Electron.WebContents, Electron.BrowserWindow]
      },
      selectTab(webContents, browserWindow) {
        // 处理 tab 切换
        console.log('[Extensions] selectTab:', webContents.id)
      },
      removeTab(webContents, browserWindow) {
        // 处理 tab 关闭
        console.log('[Extensions] removeTab:', webContents.id)
      }
    })

    // 处理 crx:// 协议用于加载扩展图标
    ElectronChromeExtensions.handleCRXProtocol(browserSession)

    extensionsMap.set(partition, extensions)
  }

  return extensionsMap.get(partition)!
}

/**
 * 为账号加载扩展
 */
export async function loadExtensionForAccount(accountId: string, extension: Extension): Promise<void> {
  const extInstance = getExtensionsForAccount(accountId)
  if (!extInstance) return

  const partition = `persist:account-${accountId}`
  const browserSession = session.fromPartition(partition)

  try {
    // 加载扩展到 session
    const loadedExt = await browserSession.loadExtension(extension.path)
    console.log('[Extensions] Loaded extension:', loadedExt.id, extension.name)

    // 缓存扩展信息
    extensionInfoMap.set(`${partition}:${loadedExt.id}`, {
      name: extension.name,
      icon: extension.icon
    })

    // 关联到账号
    addExtensionToAccount(accountId, loadedExt.id)
  } catch (error) {
    console.error('[Extensions] Failed to load extension:', error)
    throw error
  }
}

/**
 * 为账号卸载扩展
 */
export async function unloadExtensionFromAccount(accountId: string, extensionId: string): Promise<void> {
  const extInstance = getExtensionsForAccount(accountId)
  if (!extInstance) return

  const partition = `persist:account-${accountId}`
  const browserSession = session.fromPartition(partition)

  try {
    await browserSession.unloadExtension(extensionId)
    console.log('[Extensions] Unloaded extension:', extensionId)

    // 移除关联
    removeExtensionFromAccount(accountId, extensionId)
    extensionInfoMap.delete(`${partition}:${extensionId}`)
  } catch (error) {
    console.error('[Extensions] Failed to unload extension:', error)
    throw error
  }
}

/**
 * 获取账号已加载的扩展 ID 列表
 */
export function getLoadedExtensionIds(accountId: string): string[] {
  return getAccountExtensions(accountId)
}

/**
 * 根据 partition 和扩展 ID 获取扩展信息
 */
export function getExtensionInfo(partition: string, extensionId: string): { name: string; icon?: string } | undefined {
  return extensionInfoMap.get(`${partition}:${extensionId}`)
}

/**
 * 销毁账号的扩展管理器实例
 */
export function destroyExtensionsForAccount(accountId: string): void {
  const partition = `persist:account-${accountId}`
  const ext = extensionsMap.get(partition)
  if (ext) {
    // 卸载所有扩展
    const extIds = getAccountExtensions(accountId)
    const browserSession = session.fromPartition(partition)
    for (const id of extIds) {
      try {
        browserSession.unloadExtension(id)
      } catch (e) {
        // 忽略卸载错误
      }
    }
    extensionsMap.delete(partition)
  }
}

/**
 * 处理扩展的 browserAction popup 创建事件
 */
export function setupExtensionPopupHandler(mainWindow: Electron.BrowserWindow): void {
  for (const [, ext] of extensionsMap) {
    ext.on('browser-action-popup-created', (popup) => {
      console.log('[Extensions] Browser action popup created')
    })
  }
}
