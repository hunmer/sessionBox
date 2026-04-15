import { ipcMain, BrowserWindow } from 'electron'
import { proxyChatCompletions } from '../services/ai-proxy'

export function registerChatIpcHandlers(): void {
  ipcMain.handle('chat:completions', async (event, params) => {
    const mainWindow = BrowserWindow.fromWebContents(event.sender)
    if (!mainWindow) {
      throw new Error('No main window found')
    }
    // 异步代理，不阻塞 IPC response
    proxyChatCompletions(mainWindow, params).catch((err) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('on:chat:error', {
          requestId: params._requestId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
    return { started: true }
  })
}
