import { ipcMain } from 'electron'
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

export function registerDownloadIpcHandlers(): void {
  ipcMain.handle('download:checkConnection', () => checkConnection())

  ipcMain.handle('download:getConfig', () => getAria2Config())

  ipcMain.handle('download:updateConfig', (_e, config) => updateAria2Config(config))

  ipcMain.handle('download:start', () => startAria2())

  ipcMain.handle('download:stop', () => stopAria2())

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
}
