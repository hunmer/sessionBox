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
  unloadExtensionFromAllAccounts
} from '../services/extensions'

/**
 * 注册扩展相关 IPC 处理器。
 */
export function registerExtensionHandlers(): void {
  ipcMain.handle('extension:list', async (): Promise<Extension[]> => {
    return listExtensions()
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
      return existedExtension
    }

    return createExtension({
      name: extensionName,
      path: extensionPath,
      enabled: true
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
}
