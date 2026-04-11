import { ipcMain } from 'electron'
import { shell } from 'electron'
import {
  checkConnection,
  getAria2Config,
  updateAria2Config,
  startAria2,
  stopAria2,
  addDownload,
  pauseDownload,
  resumeDownload,
  removeDownload,
  getActiveTasks,
  getWaitingTasks,
  getStoppedTasks,
  getGlobalStat,
  purgeDownloadResult
} from '../services/aria2'
import { webviewManager } from '../services/webview-manager'

export function registerDownloadIpcHandlers(): void {
  ipcMain.handle('download:checkConnection', async () => {
    const connected = await checkConnection()
    webviewManager.setAria2Enabled(connected)
    return connected
  })

  ipcMain.handle('download:getConfig', () => getAria2Config())

  ipcMain.handle('download:updateConfig', (_e, config) => updateAria2Config(config))

  ipcMain.handle('download:start', async () => {
    const ok = await startAria2()
    webviewManager.setAria2Enabled(ok)
    return ok
  })

  ipcMain.handle('download:stop', async () => {
    await stopAria2()
    webviewManager.setAria2Enabled(false)
  })

  ipcMain.handle('download:add', (_e, url: string, options?: { filename?: string; dir?: string; headers?: string[]; cookies?: string; referer?: string }) =>
    addDownload(url, options)
  )

  ipcMain.handle('download:pause', (_e, gid: string) => pauseDownload(gid))

  ipcMain.handle('download:resume', (_e, gid: string) => resumeDownload(gid))

  ipcMain.handle('download:remove', (_e, gid: string) => removeDownload(gid))

  ipcMain.handle('download:listActive', () => getActiveTasks())

  ipcMain.handle('download:listWaiting', () => getWaitingTasks())

  ipcMain.handle('download:listStopped', () => getStoppedTasks())

  ipcMain.handle('download:globalStat', () => getGlobalStat())

  ipcMain.handle('download:purge', () => purgeDownloadResult())

  /** 在系统文件管理器中显示已下载的文件 */
  ipcMain.handle('download:showInFolder', async (_e, filePath: string) => {
    await shell.showItemInFolder(filePath)
  })

  /** 获取下载文件的完整路径（用于拖拽） */
  ipcMain.handle('download:getFilePath', (_e, dir: string, filename: string) => {
    const path = require('path')
    const filePath = path.join(dir, filename)
    return filePath
  })
}
