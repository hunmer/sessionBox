import type { IpcMainInvokeEvent } from 'electron'
import { getAutoUpdater } from '../composables/useAutoUpdater'

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

  console.log('[AutoUpdater] IPC 处理器已注册')
}

import { ipcMain } from 'electron'
