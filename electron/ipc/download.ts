import { ipcMain, shell, nativeImage } from 'electron'
import path from 'path'
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
  purgeDownloadResult,
  startNotificationMonitor,
  stopNotificationMonitor
} from '../services/aria2'
import { webviewManager } from '../services/webview-manager'

export function registerDownloadIpcHandlers(): void {
  ipcMain.handle('download:checkConnection', async () => {
    const connected = await checkConnection()
    webviewManager.setAria2Enabled(connected)
    if (connected) startNotificationMonitor()
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
    stopNotificationMonitor()
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
    return path.join(dir, filename)
  })

  /** 原生文件拖拽：通过主进程 startDrag 实现拖拽到外部应用 */
  ipcMain.on('download:startDrag', (event, filePath: string) => {
    // macOS 要求 icon 非空，使用 1x1 透明 PNG
    const icon = nativeImage.createFromBuffer(
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    )
    event.sender.startDrag({ file: filePath, icon })
  })

  /** 双击打开已下载的文件 */
  ipcMain.handle('download:openFile', async (_e, filePath: string) => {
    await shell.openPath(filePath)
  })
}
