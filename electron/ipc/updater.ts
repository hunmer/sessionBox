import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'
import { getAutoUpdater } from '../composables/useAutoUpdater'
import {
  listUpdateSources,
  getActiveUpdateSourceId,
  setActiveUpdateSourceId,
  addUpdateSource,
  removeUpdateSource,
  updateUpdateSource,
  type UpdateSource
} from '../services/store'

/**
 * 注册自动更新 IPC 处理器
 */
export function registerUpdaterIpc() {
  const updater = getAutoUpdater()

  // 检查更新
  ipcMain.handle('updater:check', async () => {
    return await updater.checkForUpdates()
  })

  // 下载更新
  ipcMain.handle('updater:download', async () => {
    return await updater.downloadUpdate()
  })

  // 安装更新
  ipcMain.handle('updater:install', async (_event: IpcMainInvokeEvent, isSilent = false) => {
    updater.quitAndInstall(isSilent)
    return { success: true }
  })

  // 获取当前版本
  ipcMain.handle('updater:get-version', () => {
    return {
      success: true,
      version: updater.getCurrentVersion()
    }
  })

  // 获取更新信息
  ipcMain.handle('updater:get-info', () => {
    return updater.getUpdateInfo()
  })

  // ====== 更新源管理 ======

  // 获取所有更新源
  ipcMain.handle('updater:list-sources', () => {
    return listUpdateSources()
  })

  // 获取当前激活的更新源 ID
  ipcMain.handle('updater:get-active-source', () => {
    return getActiveUpdateSourceId()
  })

  // 设置激活的更新源
  ipcMain.handle('updater:set-active-source', (_event: IpcMainInvokeEvent, id: string) => {
    try {
      setActiveUpdateSourceId(id)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 添加更新源
  ipcMain.handle('updater:add-source', (_event: IpcMainInvokeEvent, source: UpdateSource) => {
    try {
      addUpdateSource(source)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 删除更新源
  ipcMain.handle('updater:remove-source', (_event: IpcMainInvokeEvent, id: string) => {
    removeUpdateSource(id)
    return { success: true }
  })

  // 更新更新源
  ipcMain.handle('updater:update-source', (_event: IpcMainInvokeEvent, id: string, data: Partial<Omit<UpdateSource, 'id'>>) => {
    try {
      updateUpdateSource(id, data)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[AutoUpdater] IPC 处理器已注册')
}
