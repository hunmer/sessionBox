import { ipcMain, BrowserWindow } from 'electron'
import { startCheck, cancelCheck } from '../services/bookmark-checker'
import type { CheckConfig } from '../services/bookmark-checker'

export function registerBookmarkCheckIpc(): void {
  ipcMain.handle('bookmark:checkStart', (e, config: CheckConfig) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('窗口不存在')
    const taskId = startCheck(win.webContents, config)
    return { taskId }
  })

  ipcMain.handle('bookmark:checkCancel', (_e, taskId: string) => {
    cancelCheck(taskId)
  })
}
