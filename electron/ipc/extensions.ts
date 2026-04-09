import { BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createExtension,
  deleteExtension,
  listExtensions,
  type Extension,
  updateExtension
} from '../services/store'
import {
  getLoadedExtensionIds,
  loadExtensionForAllAccounts,
  openExtensionBrowserActionPopup,
  unloadExtensionFromAllAccounts
} from '../services/extensions'

/**
 * 从扩展目录的 manifest.json 读取图标路径，返回绝对路径。
 * 优先选择 48px 图标，回退到最大可用尺寸。
 */
function readExtensionIcon(extensionPath: string): string | undefined {
  const manifestPath = join(extensionPath, 'manifest.json')
  if (!existsSync(manifestPath)) return undefined

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      icons?: Record<string, string>
    }
    const icons = manifest.icons
    if (!icons) return undefined

    // 优先 48，然后 128、32、16
    for (const size of [48, 128, 32, 16]) {
      const iconPath = icons[String(size)]
      if (iconPath && existsSync(join(extensionPath, iconPath))) {
        return join(extensionPath, iconPath)
      }
    }

    // 回退：取最大的图标
    const sizes = Object.keys(icons)
      .map(Number)
      .sort((a, b) => b - a)
    if (sizes.length > 0) {
      const iconPath = icons[String(sizes[0])]
      if (iconPath && existsSync(join(extensionPath, iconPath))) {
        return join(extensionPath, iconPath)
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * 注册扩展相关 IPC 处理器。
 */
export function registerExtensionHandlers(): void {
  ipcMain.handle('extension:list', async (): Promise<Extension[]> => {
    const extensions = listExtensions()
    // 为缺少图标的扩展自动填充（兼容已有数据）
    for (const ext of extensions) {
      if (!ext.icon) {
        const icon = readExtensionIcon(ext.path)
        if (icon) {
          ext.icon = icon
          updateExtension(ext.id, { icon })
        }
      }
    }
    return extensions
  })

  ipcMain.handle('extension:select', async (event): Promise<Extension | null> => {
    console.log('[Extension IPC] extension:select called')

    const ownerWindow = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions = {
      title: '选择 Chrome 扩展目录',
      properties: ['openDirectory', 'dontAddToRecent'] as const
    }

    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    console.log('[Extension IPC] dialog result:', result)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const extensionPath = result.filePaths[0]
    const manifestPath = join(extensionPath, 'manifest.json')
    if (!existsSync(manifestPath)) {
      throw new Error('所选目录不是有效的 Chrome 扩展，缺少 manifest.json')
    }

    let extensionName = 'Unknown Extension'
    try {
      const manifestContent = readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent) as {
        name?: string
        short_name?: string
      }
      extensionName = manifest.name || manifest.short_name || extensionName
    } catch (error) {
      console.error('[Extension IPC] Failed to read manifest:', error)
    }

    const existedExtension = listExtensions().find((extension) => extension.path === extensionPath)
    if (existedExtension) {
      // 补充图标（兼容旧数据）
      if (!existedExtension.icon) {
        const icon = readExtensionIcon(extensionPath)
        if (icon) {
          existedExtension.icon = icon
          updateExtension(existedExtension.id, { icon })
        }
      }
      return existedExtension
    }

    return createExtension({
      name: extensionName,
      path: extensionPath,
      enabled: true,
      icon: readExtensionIcon(extensionPath)
    })
  })

  ipcMain.handle('extension:load', async (_event, extensionId: string): Promise<void> => {
    const extension = listExtensions().find((item) => item.id === extensionId)
    if (!extension) {
      console.error('[Extension:load] Extension not found:', extensionId)
      throw new Error(`扩展 ${extensionId} 不存在`)
    }

    await loadExtensionForAllAccounts(extension)
  })

  ipcMain.handle('extension:unload', async (_event, extensionId: string): Promise<void> => {
    await unloadExtensionFromAllAccounts(extensionId)
  })

  ipcMain.handle('extension:delete', async (_event, extensionId: string): Promise<void> => {
    await unloadExtensionFromAllAccounts(extensionId)
    deleteExtension(extensionId)
  })

  ipcMain.handle(
    'extension:update',
    async (_event, id: string, data: Partial<Omit<Extension, 'id'>>): Promise<void> => {
      updateExtension(id, data)
    }
  )

  ipcMain.handle('extension:getLoaded', async (): Promise<string[]> => {
    return getLoadedExtensionIds()
  })

  ipcMain.handle(
    'extension:openBrowserActionPopup',
    async (
      _event,
      accountId: string | null,
      extensionId: string,
      anchorRect: { x: number; y: number; width: number; height: number }
    ): Promise<void> => {
      openExtensionBrowserActionPopup(accountId, extensionId, anchorRect)
    }
  )
}
