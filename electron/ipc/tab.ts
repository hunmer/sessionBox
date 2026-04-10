import { ipcMain, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import {
  listTabs,
  createTab,
  updateTab,
  deleteTab,
  reorderTabs,
  saveTabs,
  getAccountById
} from '../services/store'
import { webviewManager } from '../services/webview-manager'
import type { Tab } from '../services/store'

/**
 * 注册 Tab 相关 IPC 处理器
 * 整合 WebContentsView 操作与数据持久化
 */
export function registerTabIpcHandlers(): void {
  // 查询 tab 列表
  ipcMain.handle('tab:list', () => listTabs())

  // 创建 tab（含 WebContentsView）
  // accountId 为空字符串时使用默认 partition（无账号关联）
  ipcMain.handle('tab:create', (_e, accountId: string | null, url?: string) => {
    const tabs = listTabs()
    const order = tabs.reduce((max, t) => Math.max(max, t.order), -1) + 1
    const mainWindow = webviewManager.getMainWindow()

    // 内部页面：检查是否已存在相同 URL 的 tab
    if (url?.startsWith('sessionbox://')) {
      const existingTab = tabs.find((t) => t.url === url)
      if (existingTab) {
        mainWindow?.webContents.send('on:tab:activated', existingTab.id)
        return existingTab
      }
    }

    // 根据 URL 判断是否为内部页面，并设置标题
    const isInternalPage = url?.startsWith('sessionbox://')
    // 内部页面标题映射
    const internalPageTitles: Record<string, string> = {
      'bookmarks': '书签管理',
      'history': '历史记录',
      'downloads': '下载管理',
    }
    const pageKey = isInternalPage ? url!.replace('sessionbox://', '') : null
    const internalPageTitle = pageKey ? (internalPageTitles[pageKey] || pageKey) : null

    if (!accountId) {
      // 无账号模式：使用默认 partition
      const tabUrl = url || 'https://www.baidu.com'
      const tab = createTab({
        accountId: '',
        title: internalPageTitle || '新标签页',
        url: tabUrl,
        order
      })
      webviewManager.createView(tab.id, '', tabUrl)
      mainWindow?.webContents.send('on:tab:created', tab)
      return tab
    }

    const account = getAccountById(accountId)
    if (!account) throw new Error(`账号 ${accountId} 不存在`)

    const tabUrl = url || account.defaultUrl
    const tab = createTab({
      accountId,
      title: account.name,
      url: tabUrl,
      order
    })
    webviewManager.createView(tab.id, accountId, tabUrl)
    mainWindow?.webContents.send('on:tab:created', tab)
    return tab
  })

  // 关闭 tab（销毁视图 + 删除数据）
  ipcMain.handle('tab:close', (_e, tabId: string) => {
    webviewManager.destroyView(tabId)
    deleteTab(tabId)
  })

  // 切换 tab
  ipcMain.handle('tab:switch', (_e, tabId: string) => {
    webviewManager.switchView(tabId)
  })

  // 更新 tab 数据
  ipcMain.handle('tab:update', (_e, id: string, data: Partial<Omit<Tab, 'id'>>) =>
    updateTab(id, data)
  )

  // 重排 tab
  ipcMain.handle('tab:reorder', (_e, tabIds: string[]) => reorderTabs(tabIds))

  // 保存所有 tab
  ipcMain.handle('tab:save-all', (_e, tabs: Tab[]) => saveTabs(tabs))

  // 导航操作
  ipcMain.handle('tab:navigate', (_e, tabId: string, url: string) => {
    webviewManager.navigate(tabId, url)
  })

  ipcMain.handle('tab:goBack', (_e, tabId: string) => {
    webviewManager.goBack(tabId)
  })

  ipcMain.handle('tab:goForward', (_e, tabId: string) => {
    webviewManager.goForward(tabId)
  })

  ipcMain.handle('tab:reload', (_e, tabId: string) => {
    webviewManager.reload(tabId)
  })

  ipcMain.handle('tab:detect-proxy', async (_e, tabId: string) => {
    return await webviewManager.detectProxyInfo(tabId)
  })

  ipcMain.handle('tab:set-proxy-enabled', async (_e, tabId: string, enabled: boolean) => {
    return await webviewManager.setProxyEnabledForTab(tabId, enabled)
  })

  ipcMain.handle('tab:openDevTools', (_e, tabId: string) => {
    webviewManager.openDevTools(tabId)
  })

  // 设置标签静音
  ipcMain.handle('tab:set-muted', (_e, tabId: string, muted: boolean) => {
    updateTab(tabId, { muted })
    webviewManager.setAudioMuted(tabId, muted)
  })

  // 控制 WebContentsView 可见性（dialog 弹出时隐藏）
  ipcMain.on('tab:set-overlay-visible', (_e, visible: boolean) => {
    webviewManager.setOverlayVisible(visible)
  })

  // 位置同步（渲染进程 → 主进程，fire-and-forget）
  ipcMain.on('tab:update-bounds', (_e, rect: { x: number; y: number; width: number; height: number }) => {
    webviewManager.updateBounds(rect)
  })

  // 在新 BrowserWindow 中打开指定 tab 的当前 URL
  ipcMain.handle('tab:open-in-new-window', (_e, tabId: string) => {
    const info = webviewManager.getViewInfo(tabId)
    if (!info) throw new Error(`Tab ${tabId} 不存在`)

    const account = getAccountById(info.accountId)

    const newWin = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      autoHideMenuBar: true,
      title: account?.name ?? '新窗口',
      webPreferences: {
        partition: `persist:account-${info.accountId}`,
        sandbox: false
      }
    })

    newWin.loadURL(info.url)
    newWin.once('ready-to-show', () => newWin.show())
  })

  // 使用系统默认浏览器打开指定 tab 的当前 URL
  ipcMain.handle('tab:open-in-browser', async (_e, tabId: string) => {
    const info = webviewManager.getViewInfo(tabId)
    if (!info) throw new Error(`Tab ${tabId} 不存在`)

    await shell.openExternal(info.url)
  })

  // 启动时恢复所有保存的 tab（重建 WebContentsView）
  // 先清除旧视图，避免刷新时重复叠加
  ipcMain.handle('tab:restore-all', () => {
    webviewManager.destroyAll()
    const tabs = listTabs()
    for (const tab of tabs) {
      if (tab.accountId) {
        const account = getAccountById(tab.accountId)
        if (account) {
          webviewManager.createView(tab.id, tab.accountId, tab.url || account.defaultUrl)
          // 恢复静音状态
          if (tab.muted) {
            webviewManager.setAudioMuted(tab.id, true)
          }
        }
      } else {
        webviewManager.createView(tab.id, '', tab.url || 'https://www.baidu.com')
        if (tab.muted) {
          webviewManager.setAudioMuted(tab.id, true)
        }
      }
    }
    return tabs.map((t) => t.id)
  })
}
