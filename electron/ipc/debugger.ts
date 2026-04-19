import { ipcMain, BrowserWindow, dialog, webContents } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import {
  injectActionRecorder,
  startActionRecording,
  stopActionRecording,
  getActionRun,
  getActiveActionRuns,
  type ActionRun
} from '../services/action-recorder'
import { playActionRun, stopActionPlay } from '../services/action-player'
import { webviewManager } from '../services/webview-manager'
import { getPageById, listTabs } from '../services/store'

let debuggerWindow: BrowserWindow | null = null
let embeddedWcId: number | null = null
let activePlayId: string | null = null

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

    debuggerWindow.webContents.on('did-attach-webview', (_e, webContents) => {
      console.log('[debugger-main] did-attach-webview, id:', webContents.id, 'url:', webContents.getURL())
    })

    debuggerWindow.on('closed', () => {
      embeddedWcId = null
      if (activePlayId) {
        stopActionPlay(activePlayId)
        activePlayId = null
      }
      for (const wcId of getActiveActionRuns()) {
        stopActionRecording(wcId)
      }
      debuggerWindow = null
    })

    return { success: true }
  })

  ipcMain.handle('debugger:get-tabs', () => {
    const manager = (global as any).__webviewManager as typeof webviewManager | undefined
    if (!manager) return []

    const tabs = listTabs()
    const result: { tabId: string; title: string; url: string; webContentsId: number; partition: string }[] = []

    for (const tab of tabs) {
      const wc = manager.getWebContents(tab.id)
      const page = getPageById(tab.pageId)
      const containerId = page?.containerId || ''
      const partition = containerId ? `persist:container-${containerId}` : 'default'
      if (wc && !wc.isDestroyed()) {
        result.push({
          tabId: tab.id,
          title: tab.title || tab.url || '未命名',
          url: tab.url || '',
          webContentsId: wc.id,
          partition
        })
      }
    }
    return result
  })

  ipcMain.handle('debugger:inject-action-recorder', async (_e, wcId: number) => {
    return injectActionRecorder(wcId)
  })

  ipcMain.handle('debugger:start-action-record', async (_e, wcId: number) => {
    return startActionRecording(wcId, (step) => {
      if (debuggerWindow && !debuggerWindow.isDestroyed()) {
        debuggerWindow.webContents.send('debugger:action-step', step)
      }
    })
  })

  ipcMain.handle('debugger:stop-action-record', (_e, wcId: number) => {
    return stopActionRecording(wcId)
  })

  ipcMain.handle('debugger:get-action-run', (_e, wcId: number) => {
    return getActionRun(wcId)
  })

  ipcMain.handle('debugger:export-action-run', async (_e, wcId: number) => {
    const run = getActionRun(wcId)
    if (!run || run.steps.length === 0) return { success: false, error: '没有录制动作' }

    const result = await dialog.showSaveDialog(debuggerWindow!, {
      defaultPath: `action-run-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }

    await writeFile(result.filePath, JSON.stringify({
      version: 1,
      type: 'sessionbox-action-run',
      initialUrl: run.initialUrl,
      partition: run.partition,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      steps: run.steps
    }, null, 2), 'utf-8')
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('debugger:play-action-run', async (_e, targetWcId: number, run: ActionRun) => {
    const targetWc = webContents.fromId(targetWcId)
    if (!targetWc || targetWc.isDestroyed()) return { success: false, error: '目标 WebContents 不存在或已销毁' }
    if (!run || !Array.isArray(run.steps)) return { success: false, error: 'ActionRun 无效' }

    playActionRun(targetWc, run, {
      onState: (state) => {
        activePlayId = state.status === 'running' ? state.playId : activePlayId
        if (state.status !== 'running' && activePlayId === state.playId) activePlayId = null
        debuggerWindow?.webContents.send('debugger:action-play-state', state)
      }
    }).catch((error) => {
      debuggerWindow?.webContents.send('debugger:action-play-state', {
        playId: activePlayId || '',
        runId: run.id,
        status: 'failed',
        currentIndex: -1,
        total: run.steps.length,
        results: [],
        error: error instanceof Error ? error.message : String(error)
      })
      activePlayId = null
    })

    return { success: true }
  })

  ipcMain.handle('debugger:stop-action-play', (_e, playId?: string) => {
    if (playId) return stopActionPlay(playId)
    if (!activePlayId) return { success: false, error: '没有正在执行的复原任务' }
    return stopActionPlay(activePlayId)
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

  ipcMain.handle('debugger:get-embedded-wcid', () => {
    console.log('[debugger-main] get-embedded-wcid requested, returning:', embeddedWcId)
    return embeddedWcId
  })

  ipcMain.handle('debugger:set-embedded-wcid', (_e, wcId: number | null) => {
    embeddedWcId = typeof wcId === 'number' ? wcId : null
    console.log('[debugger-main] set-embedded-wcid:', embeddedWcId)
    debuggerWindow?.webContents.send('debugger:embedded-wcid', embeddedWcId)
    return { success: true }
  })
}
