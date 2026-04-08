import { ipcMain } from 'electron'
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
  ipcMain.handle('tab:create', (_e, accountId: string, url?: string) => {
    const account = getAccountById(accountId)
    if (!account) throw new Error(`账号 ${accountId} 不存在`)

    const tabs = listTabs()
    const order = tabs.reduce((max, t) => Math.max(max, t.order), -1) + 1
    const tabUrl = url || account.defaultUrl

    const tab = createTab({
      accountId,
      title: account.name,
      url: tabUrl,
      order
    })

    // 创建 WebContentsView
    webviewManager.createView(tab.id, accountId, tabUrl)

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

  // 控制 WebContentsView 可见性（dialog 弹出时隐藏）
  ipcMain.on('tab:set-overlay-visible', (_e, visible: boolean) => {
    webviewManager.setOverlayVisible(visible)
  })

  // 位置同步（渲染进程 → 主进程，fire-and-forget）
  ipcMain.on('tab:update-bounds', (_e, rect: { x: number; y: number; width: number; height: number }) => {
    webviewManager.updateBounds(rect)
  })

  // 启动时恢复所有保存的 tab（重建 WebContentsView）
  // 先清除旧视图，避免刷新时重复叠加
  ipcMain.handle('tab:restore-all', () => {
    webviewManager.destroyAll()
    const tabs = listTabs()
    for (const tab of tabs) {
      const account = getAccountById(tab.accountId)
      if (account) {
        webviewManager.createView(tab.id, tab.accountId, tab.url || account.defaultUrl)
      }
    }
    return tabs.map((t) => t.id)
  })
}
