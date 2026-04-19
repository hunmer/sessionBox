import type { BrowserWindow } from 'electron'
import type { ViewEntry, FrozenTabInfo } from './types'
import { getExtensionsForContainer } from '../extensions'
import { broadcastToRenderer, pluginEventBus } from '../plugin-event-bus'

export function freezeView(
  entry: ViewEntry,
  mainWindow: BrowserWindow | null,
  snifferEnabled: boolean
): FrozenTabInfo {
  const url = entry.view.webContents.getURL()

  const frozenInfo: FrozenTabInfo = {
    url,
    pageId: entry.pageId,
    containerId: entry.containerId,
    snifferEnabled
  }

  try {
    if (entry.willDownloadHandler && !entry.view.webContents.isDestroyed()) {
      entry.view.webContents.session.removeListener('will-download', entry.willDownloadHandler)
    }

    const extensions = getExtensionsForContainer(entry.containerId || null)
    if (!entry.view.webContents.isDestroyed()) {
      extensions.removeTab(entry.view.webContents)
    }

    entry.view.setVisible(false)
    entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    mainWindow?.contentView.removeChildView(entry.view)

    if (!entry.view.webContents.isDestroyed()) {
      entry.view.webContents.close()
    }
  } catch {
    // 忽略销毁异常
  }

  broadcastToRenderer('on:tab:frozen', entry.tabId, true)
  pluginEventBus.emit('tab:frozen', { tabId: entry.tabId, frozen: true })
  mainWindow?.webContents.send('on:tab:frozen', entry.tabId, true)

  return frozenInfo
}
