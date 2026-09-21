import { ipcMain, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import {
  listTabs,
  createTab,
  updateTab,
  deleteTab,
  reorderTabs,
  saveTabs,
  getPageById,
  getContainerById,
  getRestoreLastUrl
} from '../services/store'
import { webviewManager } from '../services/webview-manager'
import { trayWindowManager } from '../services/tray-window'
import type { Tab } from '../services/store'
import {
  completeExternalBrowserAuth,
  startExternalBrowserAuth,
  type ExternalAuthBrowser
} from '../services/external-auth-cdp'

async function handleExternalAuthSync(
  _event: Electron.IpcMainInvokeEvent,
  tabId: string,
  browser: ExternalAuthBrowser,
  phase: 'start' | 'complete'
) {
  if (browser !== 'chrome' && browser !== 'edge') {
    return { ok: false, error: '不支持的浏览器' }
  }
  const info = webviewManager.getViewInfo(tabId)
  const wc = webviewManager.getWebContents(tabId)
  if (!info || !wc) return { ok: false, error: `Tab ${tabId} 不存在` }

  const page = info.pageId ? getPageById(info.pageId) : undefined
  const syncAuth = phase === 'complete' ? completeExternalBrowserAuth : startExternalBrowserAuth
  const returnUrl = info.lastNonAuthUrl || page?.url
  const result = await syncAuth(browser, info.url, wc.session, info.containerId, returnUrl)
  if (result.ok && !result.pending && !wc.isDestroyed()) {
    const resumeUrl = info.lastNonAuthUrl || result.finalUrl || page?.url
    if (resumeUrl) await wc.loadURL(resumeUrl)
    else wc.reload()
  }
  return result
}

/**
 * 注册 Tab 相关 IPC 处理器
 * 整合 WebContentsView 操作与数据持久化
 */
export function registerTabIpcHandlers(): void {
  // 查询 tab 列表
  ipcMain.handle('tab:list', () => {
    const tabs = listTabs()
    const legacyDebuggerTabs = tabs.filter(tab => tab.url === 'sessionbox://debugger')
    legacyDebuggerTabs.forEach(tab => deleteTab(tab.id))
    return tabs.filter(tab => tab.url !== 'sessionbox://debugger')
  })

  // 创建 tab（含 WebContentsView）
  // pageId 为空字符串时使用默认 partition（无页面关联）
  // containerId 用于无 pageId 时指定容器隔离
  // workspaceId 用于无 pageId 时指定工作区归属
  ipcMain.handle('tab:create', (
    _e,
    pageId: string | null,
    url?: string,
    containerId?: string,
    workspaceId?: string,
    lastNonAuthUrl?: string
  ) => {
    const tabs = listTabs()
    const order = tabs.reduce((max, t) => Math.max(max, t.order), -1) + 1
    const mainWindow = webviewManager.getMainWindow()

    const isInternalPage = url?.startsWith('sessionbox://')

    // 内部页面不属于业务页面，不能继承当前页面的 pageId。
    if (isInternalPage) {
      pageId = null
      const existingTab = tabs.find((t) => t.url === url)
      if (existingTab) {
        if (existingTab.pageId) {
          existingTab.pageId = ''
          updateTab(existingTab.id, { pageId: '' })
        }
        mainWindow?.webContents.send('on:tab:activated', existingTab.id)
        return existingTab
      }
    }

    // 根据 URL 判断是否为内部页面，并设置标题
    // 内部页面标题映射
    const internalPageTitles: Record<string, string> = {
      'bookmarks': '书签管理',
      'history': '历史记录',
      'downloads': '下载管理',
      'passwords': '密码管理',
      'plugins': '插件管理',
    }
    const pageKey = isInternalPage ? url!.replace('sessionbox://', '') : null
    const internalPageTitle = pageKey ? (internalPageTitles[pageKey] || pageKey) : null

    if (!pageId) {
      // 无页面模式：使用指定或默认 partition
      const tabUrl = url || 'https://www.baidu.com'
      const resolvedContainerId = containerId || ''
      const tab = createTab({
        pageId: '',
        title: internalPageTitle || '新标签页',
        url: tabUrl,
        originUrl: tabUrl,
        order,
        workspaceId: workspaceId || undefined
      })
      webviewManager.registerPendingView(tab.id, '', resolvedContainerId, tabUrl, lastNonAuthUrl)
      mainWindow?.webContents.send('on:tab:created', tab)
      return tab
    }

    const page = getPageById(pageId)
    if (!page) throw new Error(`页面 ${pageId} 不存在`)

    const container = page.containerId ? getContainerById(page.containerId) : undefined
    const pageContainerId = page.containerId || ''
    const tabUrl = url || page.url
    const tab = createTab({
      pageId: pageId,
      title: page.name,
      url: tabUrl,
      originUrl: tabUrl,
      order
    })
    webviewManager.registerPendingView(tab.id, pageId, pageContainerId, tabUrl, lastNonAuthUrl)
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

  ipcMain.handle('tab:forceReload', (_e, tabId: string) => {
    webviewManager.forceReload(tabId)
  })

  ipcMain.handle('tab:zoomIn', (_e, tabId: string) => {
    webviewManager.zoomIn(tabId)
  })

  ipcMain.handle('tab:zoomOut', (_e, tabId: string) => {
    webviewManager.zoomOut(tabId)
  })

  ipcMain.handle('tab:zoomReset', (_e, tabId: string) => {
    webviewManager.zoomReset(tabId)
  })

  ipcMain.handle('tab:getZoomLevel', (_e, tabId: string) => {
    return webviewManager.getZoomLevel(tabId)
  })

  ipcMain.handle('tab:detect-proxy', async (_e, tabId: string) => {
    return await webviewManager.detectProxyInfo(tabId)
  })

  ipcMain.handle('tab:set-proxy-enabled', async (_e, tabId: string, enabled: boolean) => {
    return await webviewManager.setProxyEnabledForTab(tabId, enabled)
  })

  ipcMain.handle('tab:apply-proxy', async (_e, tabId: string, proxyId: string | null) => {
    return await webviewManager.applyProxyToTab(tabId, proxyId)
  })

  ipcMain.handle('tab:openDevTools', (_e, tabId: string) => {
    webviewManager.openDevTools(tabId)
  })

  ipcMain.handle('tab:attach-webview', (_e, tabId: string, webContentsId: number) => {
    return webviewManager.attachWebview(tabId, webContentsId)
  })

  ipcMain.handle('tab:list-requested-webviews', () => webviewManager.getRequestedWebviews())

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

    const page = info.pageId ? getPageById(info.pageId) : undefined
    const container = page?.containerId ? getContainerById(page.containerId) : undefined
    const containerId = page?.containerId || ''

    const newWin = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      autoHideMenuBar: true,
      title: page?.name ?? '新窗口',
      webPreferences: {
        partition: containerId ? `persist:container-${containerId}` : undefined,
        sandbox: false
      }
    })

    newWin.loadURL(info.url)
    newWin.once('ready-to-show', () => newWin.show())
  })

  // 在任务栏窗口中打开指定 tab 的当前 URL
  ipcMain.handle('tab:open-at-taskbar', (_e, tabId: string) => {
    const info = webviewManager.getViewInfo(tabId)
    if (!info) throw new Error(`Tab ${tabId} 不存在`)
    const page = info.pageId ? getPageById(info.pageId) : undefined
    if (!page) throw new Error(`Tab ${tabId} 未关联页面`)
    trayWindowManager.openTabAtTaskbar(page, info.url)
  })

  // 批量截取标签页缩略图
  ipcMain.handle('tab:capture', async (_e, tabIds: string[]) => {
    const results = await webviewManager.captureTabs(tabIds)
    const obj: Record<string, string | null> = {}
    for (const [id, dataUrl] of results) {
      obj[id] = dataUrl
    }
    return obj
  })

  // 使用系统默认浏览器打开指定 tab 的当前 URL
  ipcMain.handle('tab:open-in-browser', async (_e, tabId: string) => {
    const info = webviewManager.getViewInfo(tabId)
    if (!info) throw new Error(`Tab ${tabId} 不存在`)

    await shell.openExternal(info.url)
  })

  // 使用已开放 CDP 的 Chrome/Edge 完成 Google 登录，并仅同步目标站 Cookie。
  ipcMain.handle('tab:sync-external-auth', handleExternalAuthSync)

  // 启动时恢复所有保存的 tab（懒加载：仅注册，不创建 WebContentsView）
  // 先清除旧视图，避免刷新时重复叠加
  ipcMain.handle('tab:restore-all', () => {
    webviewManager.destroyAll()
    const restoreLastUrl = getRestoreLastUrl()
    const tabs = listTabs()
    for (const tab of tabs) {
      if (tab.pageId) {
        const page = getPageById(tab.pageId)
        if (page) {
          // 开启恢复：用上次 URL；关闭恢复：用 originUrl，没有则回退到 page.url
          const finalUrl = restoreLastUrl
            ? (tab.url || page.url)
            : (tab.originUrl || page.url)
          webviewManager.registerPendingView(tab.id, tab.pageId, page.containerId || '', finalUrl)
        }
      } else {
        const finalUrl = restoreLastUrl
          ? (tab.url || 'https://www.baidu.com')
          : (tab.originUrl || 'https://www.baidu.com')
        webviewManager.registerPendingView(tab.id, '', '', finalUrl)
      }
    }
    return tabs.map((t) => t.id)
  })
}
