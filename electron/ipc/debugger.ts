import { ipcMain, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import {
  injectRrweb,
  startRecording,
  stopRecording,
  getRecordedEvents,
  getActiveRecordings
} from '../services/debugger'
import { webviewManager } from '../services/webview-manager'
import { listTabs } from '../services/store'

let debuggerWindow: BrowserWindow | null = null

export function registerDebuggerIpcHandlers(): void {

  ipcMain.handle('debugger:create-window', async () => {
    if (debuggerWindow && !debuggerWindow.isDestroyed()) {
      debuggerWindow.focus()
      return { success: true }
    }

    debuggerWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      show: false,
      autoHideMenuBar: true,
      frame: false,
      title: '调试工具',
      webPreferences: {
        preload: join(__dirname, '../preload/debugger-preload.js'),
        sandbox: false,
        webviewTag: true
      }
    })

    debuggerWindow.loadFile(join(__dirname, '../preload/debugger-window.html'))
    debuggerWindow.once('ready-to-show', () => debuggerWindow?.show())

    debuggerWindow.on('closed', () => {
      for (const wcId of getActiveRecordings()) {
        stopRecording(wcId)
      }
      debuggerWindow = null
    })

    return { success: true }
  })

  ipcMain.handle('debugger:get-tabs', () => {
    const manager = (global as any).__webviewManager as typeof webviewManager | undefined
    if (!manager) return []

    const tabs = listTabs()
    const result: { tabId: string; title: string; url: string; webContentsId: number }[] = []

    for (const tab of tabs) {
      const wc = manager.getWebContents(tab.id)
      if (wc && !wc.isDestroyed()) {
        result.push({
          tabId: tab.id,
          title: tab.title || tab.url || '未命名',
          url: tab.url || '',
          webContentsId: wc.id
        })
      }
    }
    return result
  })

  ipcMain.handle('debugger:inject', async (_e, wcId: number) => {
    return injectRrweb(wcId)
  })

  ipcMain.handle('debugger:start-record', (_e, wcId: number) => {
    return startRecording(wcId)
  })

  ipcMain.handle('debugger:stop-record', (_e, wcId: number) => {
    return stopRecording(wcId)
  })

  ipcMain.handle('debugger:get-events', (_e, wcId: number) => {
    return getRecordedEvents(wcId)
  })

  ipcMain.handle('debugger:export-events', async (_e, wcId: number) => {
    const events = getRecordedEvents(wcId)
    if (events.length === 0) return { success: false, error: '没有录制事件' }

    const result = await dialog.showSaveDialog(debuggerWindow!, {
      defaultPath: `rrweb-events-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }

    await writeFile(result.filePath, JSON.stringify(events, null, 2), 'utf-8')
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('debugger:load-url', async (_e, url: string) => {
    if (!debuggerWindow || debuggerWindow.isDestroyed()) return { success: false, error: '调试窗口不存在' }
    debuggerWindow.webContents.send('debugger:load-url', url)
    return { success: true }
  })

  // 窗口控制
  ipcMain.handle('debugger:window-minimize', () => { debuggerWindow?.minimize() })
  ipcMain.handle('debugger:window-maximize', () => { debuggerWindow?.maximize() })
  ipcMain.handle('debugger:window-close', () => { debuggerWindow?.close() })
}
