import { ipcMain, dialog, app } from 'electron'
import { listExtensions, createExtension, deleteExtension, updateExtension, Extension } from '../services/store'
import { loadExtensionForAccount, unloadExtensionFromAccount, getLoadedExtensionIds } from '../services/extensions'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

/**
 * 注册扩展相关的 IPC 处理器
 */
export function registerExtensionHandlers(): void {
  // 获取扩展列表
  ipcMain.handle('extension:list', async (): Promise<Extension[]> => {
    return listExtensions()
  })

  // 选择并添加扩展（弹出文件选择框）
  ipcMain.handle('extension:select', async (): Promise<Extension | null> => {
    const result = await dialog.showOpenDialog({
      title: '选择 Chrome 扩展',
      properties: ['openDirectory'],
      filters: [
        { name: 'Chrome Extensions', extensions: [] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const extensionPath = result.filePaths[0]

    // 检查是否为有效的扩展目录
    const manifestPath = join(extensionPath, 'manifest.json')
    if (!existsSync(manifestPath)) {
      throw new Error('所选目录不是有效的 Chrome 扩展（缺少 manifest.json）')
    }

    // 从 manifest.json 读取扩展名称
    let extensionName = 'Unknown Extension'
    try {
      const manifestContent = readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent)
      extensionName = manifest.name || manifest.short_name || extensionName
    } catch (e) {
      console.error('[Extensions] Failed to read manifest:', e)
    }

    // 创建扩展记录
    const extension = createExtension({
      name: extensionName,
      path: extensionPath,
      enabled: true
    })

    return extension
  })

  // 为指定账号加载扩展
  ipcMain.handle('extension:load', async (_event, accountId: string, extensionId: string): Promise<void> => {
    console.log('[Extension:load] accountId:', accountId, 'extensionId:', extensionId)

    const extensions = listExtensions()
    const extension = extensions.find((e) => e.id === extensionId)
    if (!extension) {
      console.error('[Extension:load] Extension not found:', extensionId)
      throw new Error(`扩展 ${extensionId} 不存在`)
    }

    console.log('[Extension:load] Loading extension:', extension.name, 'from:', extension.path)
    await loadExtensionForAccount(accountId, extension)
    console.log('[Extension:load] Extension loaded successfully')
  })

  // 从指定账号卸载扩展
  ipcMain.handle('extension:unload', async (_event, accountId: string, extensionId: string): Promise<void> => {
    await unloadExtensionFromAccount(accountId, extensionId)
  })

  // 删除扩展（从所有账号卸载并删除）
  ipcMain.handle('extension:delete', async (_event, extensionId: string): Promise<void> => {
    deleteExtension(extensionId)
  })

  // 更新扩展信息
  ipcMain.handle('extension:update', async (_event, id: string, data: Partial<Omit<Extension, 'id'>>): Promise<void> => {
    updateExtension(id, data)
  })

  // 获取账号已加载的扩展 ID 列表
  ipcMain.handle('extension:getLoaded', async (_event, accountId: string): Promise<string[]> => {
    return getLoadedExtensionIds(accountId)
  })
}
